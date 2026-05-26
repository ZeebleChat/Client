import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchServers,
  fetchChannels,
  fetchCategories,
  fetchMessages,
  fetchMembers,
  fetchCustomRoles,
  fetchServerInfo,
  fetchUnreadState,
  markChannelRead,
  exchangeToken,
  getAccountInfo,
  leaveCloudServer,
  deleteCloudServer,
  tryAutoLogin,
  startTokenRefreshTimer,
  stopTokenRefreshTimer,
  type ApiServer,
  type ApiChannel,
  type ApiCategory,
  type ApiMessage,
  type ApiMemberGroup,
} from '../api';
import { isZcloudUrl } from '../config';
import { setAvatarCache } from '../avatarCache';
import { forceLogout } from '../auth';
import { getBeamIdentity } from '../auth';
import type { SidebarCategory } from '../types';
import { useWebSocket, buildChatMessagePayload } from '../hooks/useWebSocket';
import { clearPingsForChannel } from '../notificationStore';
import { useTheme } from '../hooks/useTheme';
import { useResourcePack } from '../hooks/useResourcePack';

import Login from '../components/Login';
import RailAdapter from '../components/RailAdapter';
import HomeView from '../components/HomeView';
import CommunityView from '../components/CommunityView';
import TitleBar from '../components/TitleBar';
import PermissionsSetup from '../components/PermissionsSetup';
import StatusBanner from '../components/StatusBanner';
import { useVoice } from '../hooks/useVoice';
import { useStream } from '../hooks/useStream';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { useVoiceRooms } from '../hooks/useVoiceRooms';
import { useNotifications } from '../hooks/useNotifications';

import { useWsEvents } from './useWsEvents';
import AppModals from './AppModals';
import ServerView from './ServerView';
import styles from './App.module.css';

export default function App() {
  useTheme();
  const resourcePack = useResourcePack();

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__pack = resourcePack;
    }
  }, [resourcePack]);

  const [authed, setAuthed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    tryAutoLogin()
      .then(ok => { if (ok) setAuthed(true); })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In Tauri the permission compat layer handles everything at the OS level —
  // mark setup done immediately so the PermissionsSetup screen never appears.
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

  const [permissionsReady, setPermissionsReady] = useState(
    () => isTauri || localStorage.getItem('permissions_setup_done') === '1'
  );

  useEffect(() => {
    if (!authed) return;
    if (permissionsReady) {
      if (isTauri) localStorage.setItem('permissions_setup_done', '1');
      return;
    }
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .catch(() => ({ state: 'prompt' }))
      .then(mic => {
        const notif = 'Notification' in window ? Notification.permission : 'granted';
        if (mic.state === 'granted' && notif === 'granted') {
          localStorage.setItem('permissions_setup_done', '1');
          setPermissionsReady(true);
        }
      });
  }, [authed]);

  const [servers, setServers] = useState<ApiServer[]>([]);
  const [activeServerUrl, setActiveServerUrl] = useState<string>(
    localStorage.getItem('active_server_url') || ''
  );
  const healthStatus = useHealthCheck(authed, activeServerUrl);

  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [apiCategories, setApiCategories] = useState<ApiCategory[]>([]);
  const [activeChannel, setActiveChannel] = useState<ApiChannel | null>(null);
  const [unreadChannelIds, setUnreadChannelIds] = useState<Set<string>>(new Set());
  const [mentionCounts, setMentionCounts] = useState<Record<string, number>>({});
  // Persists per-server unread/mention state across server switches AND page
  // refreshes so the rail can show indicators on servers you're not viewing.
  const [serverNotifMap, setServerNotifMap] = useState<Record<string, { hasUnread: boolean; hasMention: boolean }>>(() => {
    try {
      const raw = localStorage.getItem('zbl_server_notif_map');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [memberGroups, setMemberGroups] = useState<ApiMemberGroup[]>([]);

  const { voiceState, remoteFrames, joinVoice, leaveVoice, toggleMute, toggleDeafen, toggleScreenShare, startScreenCapture, handleVoiceAudio, handleVoiceState, handleScreenFrame, clearRemoteFrames } = useVoice();
  const { streamState, startBroadcast, joinAsViewer, stopStream, handleStreamAudio, handleStreamEnded, toggleStreamMute: toggleStreamMuteInternal } = useStream();
  const [liveStreams, setLiveStreams] = useState<Map<string, string>>(new Map());
  const voiceRoomParticipants = useVoiceRooms(!!activeServerUrl && authed && isZcloudUrl(activeServerUrl));
  const [wsVoiceRoomMap, setWsVoiceRoomMap] = useState<Record<string, string[]>>({});
  const [serverBannerAttachmentId, setServerBannerAttachmentId] = useState<string | null>(null);
  const [serverOwnerBeamIdentity, setServerOwnerBeamIdentity] = useState<string | null>(null);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [streamModalOpen, setStreamModalOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [serverSettingsInitialTab, setServerSettingsInitialTab] = useState<'overview' | 'categories' | 'roles' | 'invites'>('overview');
  const [view, setView] = useState<'server' | 'home' | 'community'>(
    localStorage.getItem('active_server_url') ? 'server' : 'home'
  );

  const { notifyMessage } = useNotifications();
  const channelsRef = useRef(channels);
  useEffect(() => { channelsRef.current = channels; }, [channels]);
  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  const activeServerUrlRef = useRef(activeServerUrl);
  useEffect(() => { activeServerUrlRef.current = activeServerUrl; }, [activeServerUrl]);
  const mentionCountsRef = useRef(mentionCounts);
  useEffect(() => { mentionCountsRef.current = mentionCounts; }, [mentionCounts]);
  const unreadChannelIdsRef = useRef(unreadChannelIds);
  useEffect(() => { unreadChannelIdsRef.current = unreadChannelIds; }, [unreadChannelIds]);
  // Blocks the serverNotifMap sync effect during server switches so the old
  // server's badge isn't wiped when mentionCounts is cleared mid-transition.
  const serverSwitchingRef = useRef(false);

  useEffect(() => {
    if (!activeServerUrl || serverSwitchingRef.current) return;
    setServerNotifMap(prev => ({
      ...prev,
      [activeServerUrl]: {
        hasUnread: unreadChannelIds.size > 0,
        hasMention: Object.values(mentionCounts).some(c => c > 0),
      },
    }));
  }, [activeServerUrl, unreadChannelIds, mentionCounts]);

  useEffect(() => {
    try { localStorage.setItem('zbl_server_notif_map', JSON.stringify(serverNotifMap)); } catch {}
  }, [serverNotifMap]);

  const handleWsEvent = useWsEvents({
    activeChannelRef,
    channelsRef,
    setMessages,
    setChannels,
    setMemberGroups,
    setUnreadChannelIds,
    setMentionCounts,
    setWsVoiceRoomMap,
    setLiveStreams,
    setStreamModalOpen,
    handleVoiceState,
    handleStreamEnded,
    clearRemoteFrames,
    notifyMessage,
  });

  const { send } = useWebSocket({
    serverUrl: activeServerUrl,
    channelId: activeChannel?.id ?? null,
    onEvent: handleWsEvent,
    onVoiceAudio: handleVoiceAudio,
    onStreamAudio: handleStreamAudio,
    onScreenFrame: handleScreenFrame,
  });

  useEffect(() => {
    const handler = () => setAuthed(false);
    window.addEventListener('zeeble-logout', handler);
    return () => window.removeEventListener('zeeble-logout', handler);
  }, []);

  useEffect(() => {
    if (authed) {
      startTokenRefreshTimer();
    } else {
      stopTokenRefreshTimer();
    }
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    fetchServers().then(setServers);
    getAccountInfo().then(info => {
      const identity = getBeamIdentity();
      if (info && identity) {
        setAvatarCache(identity, info.avatar_attachment_id);
        if (info.display_name) {
          localStorage.setItem('cached_display_name', info.display_name);
        }
      }
    });
  }, [authed]);

  const selectChannel = useCallback(async (channel: ApiChannel) => {
    setActiveChannel(channel);
    setUnreadChannelIds(prev => {
      const next = new Set(prev);
      next.delete(String(channel.id));
      return next;
    });
    setMentionCounts(prev => {
      if (!prev[String(channel.id)]) return prev;
      const next = { ...prev };
      delete next[String(channel.id)];
      return next;
    });
    clearPingsForChannel(`#${channel.name}`);
    markChannelRead(channel.id);
    setMessages([]);
    setMessagesLoading(true);
    setMobileSidebarOpen(false);
    const { messages: msgs } = await fetchMessages(channel.id);
    setMessages(msgs);
    setMessagesLoading(false);
  }, []);

  const switchServer = useCallback(async (serverUrl: string, serverName: string) => {
    const prevUrl = activeServerUrlRef.current;
    if (prevUrl) {
      const snap = {
        hasUnread: unreadChannelIdsRef.current.size > 0,
        hasMention: Object.values(mentionCountsRef.current).some(c => c > 0),
      };
      setServerNotifMap(prev => ({ ...prev, [prevUrl]: snap }));
    }
    serverSwitchingRef.current = true;

    setChannels([]);
    setApiCategories([]);
    setActiveChannel(null);
    setMessages([]);
    setMemberGroups([]);
    setServerOwnerBeamIdentity(null);
    setServerBannerAttachmentId(null);
    setWsVoiceRoomMap({});
    setUnreadChannelIds(new Set());
    setMentionCounts({});
    setServerNotifMap(prev => { const n = { ...prev }; delete n[serverUrl]; return n; });

    await exchangeToken(serverUrl);

    localStorage.setItem('active_server_url', serverUrl);
    localStorage.setItem('active_server_name', serverName);
    setActiveServerUrl(serverUrl);

    const [chs, cats, mems] = await Promise.all([
      fetchChannels(),
      fetchCategories(),
      fetchMembers(),
      fetchCustomRoles(),
    ]);
    setChannels(chs);
    setApiCategories(cats);
    setMemberGroups(mems);
    fetchServerInfo(serverUrl).then(info => {
      setServerBannerAttachmentId(info?.banner_attachment_id ?? null);
      setServerOwnerBeamIdentity(info?.owner_beam_identity ?? null);
    });

    const first = chs.find(ch => ch.type === 'text');
    if (first) await markChannelRead(first.id);

    const unreadState = await fetchUnreadState();
    setUnreadChannelIds(new Set(unreadState.unread));
    serverSwitchingRef.current = false;
    setMentionCounts(unreadState.mentions);

    if (first) selectChannel(first);
    setView('server');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authed || !activeServerUrl) return;
    (async () => {
      await exchangeToken(activeServerUrl);
      const [chs, cats, mems] = await Promise.all([
        fetchChannels(),
        fetchCategories(),
        fetchMembers(),
        fetchCustomRoles(),
      ]);
      setChannels(chs);
      setApiCategories(cats);
      setMemberGroups(mems);
      fetchServerInfo(activeServerUrl).then(info => {
        setServerBannerAttachmentId(info?.banner_attachment_id ?? null);
        setServerOwnerBeamIdentity(info?.owner_beam_identity ?? null);
      });

      const first = chs.find(ch => ch.type === 'text');
      if (first) await markChannelRead(first.id);

      const unreadState = await fetchUnreadState();
      setUnreadChannelIds(new Set(unreadState.unread));
      setMentionCounts(unreadState.mentions);

      if (first) selectChannel(first);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const handleSend = useCallback((content: string, attachmentIds?: (string | number)[]) => {
    if (!activeChannel) return;
    const { payload, optimistic } = buildChatMessagePayload(activeChannel.id, content, attachmentIds);
    setMessages(prev => [...prev, { ...optimistic, _optimistic: true } as ApiMessage]);
    send(payload);
  }, [activeChannel, send]);

  const handleCreatePost = useCallback((title: string, content: string) => {
    if (!activeChannel) return;
    const { payload, optimistic } = buildChatMessagePayload(activeChannel.id, content, [], { title });
    setMessages(prev => [...prev, { ...optimistic, _optimistic: true } as ApiMessage]);
    send(payload);
  }, [activeChannel, send]);

  const handleReply = useCallback((content: string, replyTo: string | number, attachmentIds?: (string | number)[]) => {
    if (!activeChannel) return;
    const { payload, optimistic } = buildChatMessagePayload(activeChannel.id, content, attachmentIds ?? [], { replyTo });
    setMessages(prev => [...prev, { ...optimistic, _optimistic: true } as ApiMessage]);
    send(payload);
  }, [activeChannel, send]);

  const handleJoinVoice = useCallback(async (channel: ApiChannel) => {
    await joinVoice(channel, send);
  }, [joinVoice, send]);

  const handleLeaveVoice = useCallback(async () => {
    await leaveVoice();
    setVoiceModalOpen(false);
  }, [leaveVoice]);

  const handleStartStream = useCallback(async (channel: ApiChannel) => {
    await startBroadcast(channel, send);
  }, [startBroadcast, send]);

  const handleJoinStream = useCallback(async (channel: ApiChannel) => {
    const broadcaster = liveStreams.get(String(channel.id));
    if (!broadcaster) return;
    await joinAsViewer(channel, broadcaster, send);
  }, [joinAsViewer, liveStreams, send]);

  const handleStopStream = useCallback(async () => {
    await stopStream();
    setStreamModalOpen(false);
  }, [stopStream]);

  const roleMap = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const group of memberGroups) {
      for (const user of group.users ?? []) {
        map[user.name] = user.role;
      }
    }
    return map;
  }, [memberGroups]);

  const sidebarCategories = useMemo((): SidebarCategory[] => {
    const sorted = [...apiCategories].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const result: SidebarCategory[] = sorted.map(cat => ({
      id: cat.id,
      name: cat.name,
      textChannels: channels
        .filter(ch => String(ch.category_id) === String(cat.id) && ch.type === 'text')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      voiceChannels: channels
        .filter(ch => String(ch.category_id) === String(cat.id) && ch.type === 'voice')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      arenaChannels: channels
        .filter(ch => String(ch.category_id) === String(cat.id) && ch.type === 'arena')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      boardChannels: channels
        .filter(ch => String(ch.category_id) === String(cat.id) && ch.type === 'board')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    }));

    const catIds = new Set(apiCategories.map(c => String(c.id)));
    const uncatText = channels.filter(ch => ch.type === 'text' && !catIds.has(String(ch.category_id)));
    const uncatVoice = channels.filter(ch => ch.type === 'voice' && !catIds.has(String(ch.category_id)));
    const uncatArena = channels.filter(ch => ch.type === 'arena' && !catIds.has(String(ch.category_id)));
    const uncatBoard = channels.filter(ch => ch.type === 'board' && !catIds.has(String(ch.category_id)));
    if (uncatText.length || uncatVoice.length || uncatArena.length || uncatBoard.length) {
      result.unshift({
        id: '__uncategorized__',
        name: 'Channels',
        textChannels: uncatText,
        voiceChannels: uncatVoice,
        arenaChannels: uncatArena,
        boardChannels: uncatBoard,
      });
    }

    return result;
  }, [channels, apiCategories]);

  const activeServerName = useMemo(() => {
    const srv = servers.find(s => s.server_url === activeServerUrl);
    return srv?.server_name ?? localStorage.getItem('active_server_name') ?? 'Server';
  }, [servers, activeServerUrl]);

  if (!authChecked) return <TitleBar />;

  if (!authed) {
    return (
      <>
        <TitleBar />
        <Login onLogin={() => setAuthed(true)} />
        <StatusBanner status={healthStatus} />
      </>
    );
  }

  if (!permissionsReady) {
    return (
      <>
        <TitleBar />
        <PermissionsSetup onDone={() => { localStorage.setItem('permissions_setup_done', '1'); setPermissionsReady(true); }} />
      </>
    );
  }

  const isOwner = serverOwnerBeamIdentity != null
    ? serverOwnerBeamIdentity === getBeamIdentity()
    : memberGroups.flatMap(g => g.users ?? []).find(u => u.name === getBeamIdentity())?.is_owner ?? false;

  return (
    <div className={styles.root}>
      <TitleBar />
      <div className={styles.app}>
        {mobileSidebarOpen && (
          <div className={styles.backdrop} onClick={() => setMobileSidebarOpen(false)} />
        )}
        <RailAdapter
          servers={servers}
          activeServerUrl={activeServerUrl}
          serverNotifMap={serverNotifMap}
          view={view}
          onSelectServer={(url, name) => { setView('server'); switchServer(url, name); }}
          onLogout={() => { forceLogout(); setAuthed(false); }}
          onAddServer={() => setAddServerOpen(true)}
          onHome={() => setView('home')}
          onOpenAccount={() => setAccountOpen(true)}
          onCommunity={() => setView('community')}
          onLeaveServer={async (serverUrl) => {
            if (voiceState.status === 'connected' && serverUrl === activeServerUrl) {
              await handleLeaveVoice();
            }
            const result = await leaveCloudServer(serverUrl);
            if (result.ok) {
              if (serverUrl === activeServerUrl) {
                localStorage.removeItem('active_server_url');
                localStorage.removeItem('active_server_name');
                setActiveServerUrl('');
                setView('home');
              }
              setServers(await fetchServers());
            }
          }}
        />
        {view === 'community' ? (
          <CommunityView resourcePack={resourcePack} />
        ) : view === 'home' ? (
          <HomeView
            onOpenAccount={() => setAccountOpen(true)}
            onAddServer={() => setAddServerOpen(true)}
            voiceChannel={voiceState.channel?.name ?? null}
            onLeaveVoice={handleLeaveVoice}
            voiceMuted={voiceState.isMuted}
            voiceDeafened={voiceState.isDeafened}
            onToggleMute={toggleMute}
            onToggleDeafen={toggleDeafen}
          />
        ) : (
          <ServerView
            mobileOpen={mobileSidebarOpen}
            serverName={activeServerName}
            unreadChannelIds={unreadChannelIds}
            mentionCounts={mentionCounts}
            bannerAttachmentId={serverBannerAttachmentId}
            categories={sidebarCategories}
            activeChannel={activeChannel}
            activeVoiceChannelId={voiceState.channel?.id ?? null}
            activeVoiceChannelName={voiceState.channel?.name ?? null}
            voiceParticipants={voiceState.participants}
            voiceRoomParticipants={{ ...voiceRoomParticipants, ...wsVoiceRoomMap }}
            voiceMuted={voiceState.isMuted}
            voiceDeafened={voiceState.isDeafened}
            voiceStatus={voiceState.status}
            voiceErrorMsg={voiceState.errorMsg}
            isScreenSharing={voiceState.isScreenSharing}
            liveStreams={liveStreams}
            messages={messages}
            messagesLoading={messagesLoading}
            memberGroups={memberGroups}
            roleMap={roleMap}
            isCloudServer={isZcloudUrl(activeServerUrl)}
            isOwner={isOwner}
            emojiManifest={resourcePack.activePack?.emojiManifest}
            packBaseUrl={resourcePack.activePack?.baseUrl}
            onSelectChannel={selectChannel}
            onJoinVoice={handleJoinVoice}
            onLeaveVoice={handleLeaveVoice}
            onStartStream={handleStartStream}
            onJoinStream={handleJoinStream}
            onToggleMute={toggleMute}
            onToggleDeafen={toggleDeafen}
            onOpenServerSettings={() => { setServerSettingsInitialTab('overview'); setServerSettingsOpen(true); }}
            onOpenInvites={() => { setServerSettingsInitialTab('invites'); setServerSettingsOpen(true); }}
            onToggleScreenShare={toggleScreenShare}
            onRefreshChannels={async () => {
              const [chs, cats] = await Promise.all([fetchChannels(), fetchCategories()]);
              setChannels(chs);
              setApiCategories(cats);
            }}
            onLeaveServer={async () => {
              const result = await leaveCloudServer(activeServerUrl);
              if (result.ok) {
                localStorage.removeItem('active_server_url');
                localStorage.removeItem('active_server_name');
                setActiveServerUrl('');
                setView('home');
                setServers(await fetchServers());
              }
              return result;
            }}
            onDeleteServer={async () => {
              const result = await deleteCloudServer(activeServerUrl);
              if (result.ok) {
                localStorage.removeItem('active_server_url');
                localStorage.removeItem('active_server_name');
                setActiveServerUrl('');
                setView('home');
                setServers(await fetchServers());
              }
              return result;
            }}
            onSend={handleSend}
            onReply={handleReply}
            onCreatePost={handleCreatePost}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onDm={() => setView('home')}
          />
        )}
        <AppModals
          voiceModalOpen={voiceModalOpen}
          voiceState={voiceState}
          onLeaveVoice={handleLeaveVoice}
          onCloseVoiceModal={() => setVoiceModalOpen(false)}
          streamModalOpen={streamModalOpen}
          streamState={streamState}
          onStopStream={handleStopStream}
          onToggleStreamMute={toggleStreamMuteInternal}
          onCloseStreamModal={() => setStreamModalOpen(false)}
          addServerOpen={addServerOpen}
          onCloseAddServer={() => setAddServerOpen(false)}
          onServerAdded={() => { fetchServers().then(setServers); }}
          accountOpen={accountOpen}
          onCloseAccount={() => setAccountOpen(false)}
          onAccountLogout={() => { setAccountOpen(false); forceLogout(); setAuthed(false); }}
          onAccountDm={() => { setAccountOpen(false); setView('home'); }}
          onAccountSwitchServer={(url, name) => { setAccountOpen(false); setView('server'); switchServer(url, name); }}
          onOpenDevPanel={() => { setAccountOpen(false); setDevPanelOpen(true); }}
          serverSettingsOpen={serverSettingsOpen}
          serverName={activeServerName}
          serverSettingsTab={serverSettingsInitialTab}
          onCloseServerSettings={() => setServerSettingsOpen(false)}
          onRefreshServerSettings={async () => {
            const [chs, cats, mems] = await Promise.all([fetchChannels(), fetchCategories(), fetchMembers()]);
            setChannels(chs);
            setApiCategories(cats);
            setMemberGroups(mems);
            fetchServerInfo(activeServerUrl).then(info => {
              setServerBannerAttachmentId(info?.banner_attachment_id ?? null);
              setServerOwnerBeamIdentity(info?.owner_beam_identity ?? null);
            });
          }}
          devPanelOpen={devPanelOpen}
          onCloseDevPanel={() => setDevPanelOpen(false)}
          remoteFrames={remoteFrames}
          showScreenPicker={voiceState.showScreenPicker}
          onStartScreenCapture={startScreenCapture}
          healthStatus={healthStatus}
        />
      </div>
    </div>
  );
}
