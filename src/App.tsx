import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  fetchServers,
  fetchChannels,
  fetchCategories,
  fetchMessages,
  fetchMembers,
  fetchCustomRoles,
  fetchServerInfo,
  exchangeToken,
  getAccountInfo,
  leaveCloudServer,
  deleteCloudServer,
  type ApiServer,
  type ApiChannel,
  type ApiMessage,
  type ApiMemberGroup,
} from './api';
import { isZcloudUrl } from './config';
import { setAvatarCache } from './avatarCache';
import { isAuthenticated, forceLogout } from './auth';
import { getBeamIdentity } from './auth';
import type { SidebarCategory } from './types';
import { useWebSocket, buildChatMessagePayload } from './hooks/useWebSocket';
import { useTheme } from './hooks/useTheme';
import { useResourcePack } from './hooks/useResourcePack';

import Sidebar from './components/Sidebar';
import ChatMain from './components/ChatMain';
import BoardView from './components/BoardView';
import Members from './components/Members';
import Login from './components/Login';
import styles from './App.module.css';

import RailAdapter from './components/RailAdapter';
import VoiceModal from './components/VoiceModal';
import AddServerModal from './components/AddServerModal';
import HomeView from './components/HomeView';
import CommunityView from './components/CommunityView';
import AccountModal from './components/AccountModal';
import ServerSettingsModal from './components/ServerSettingsModal';
import DevPanel from './components/DevPanel';
import ScreenShareOverlay from './components/ScreenShareOverlay';
import ScreenPickerModal from './components/ScreenPickerModal';
import TitleBar from './components/TitleBar';
import PermissionsSetup from './components/PermissionsSetup';
import { useVoice } from './hooks/useVoice';
import { useStream } from './hooks/useStream';
import StreamModal from './components/StreamModal';
import { useHealthCheck } from './hooks/useHealthCheck';
import { useVoiceRooms } from './hooks/useVoiceRooms';
import { useNotifications } from './hooks/useNotifications';
import StatusBanner from './components/StatusBanner';

export default function App() {
  useTheme();
  const resourcePack = useResourcePack();

  // Dev helper: window.__pack.loadPack('/packs/dark_midnight/') etc.
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__pack = resourcePack;
    }
  }, [resourcePack]);
  const [authed, setAuthed] = useState(isAuthenticated());

  // In Tauri the permission compat layer handles everything at the OS level —
  // mark setup done immediately so the PermissionsSetup screen never appears.
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

  const [permissionsReady, setPermissionsReady] = useState(
    () => isTauri || localStorage.getItem('permissions_setup_done') === '1'
  );

  // In Tauri: persist the flag once so future launches never re-check.
  // In browser: check existing grants so returning users skip the setup screen.
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
  const [apiCategories, setApiCategories] = useState<import('./api').ApiCategory[]>([]);
  const [activeChannel, setActiveChannel] = useState<ApiChannel | null>(null);

  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [memberGroups, setMemberGroups] = useState<ApiMemberGroup[]>([]);

  const { voiceState, remoteFrames, joinVoice, leaveVoice, toggleMute, toggleDeafen, toggleScreenShare, startScreenCapture, handleVoiceAudio, handleVoiceState, handleScreenFrame } = useVoice();
  const { streamState, startBroadcast, joinAsViewer, stopStream, handleStreamAudio, handleStreamEnded, toggleStreamMute: toggleStreamMuteInternal } = useStream();
  // channelId → broadcaster identity for all currently live streams
  const [liveStreams, setLiveStreams] = useState<Map<string, string>>(new Map());
  const voiceRoomParticipants = useVoiceRooms(!!activeServerUrl && authed && isZcloudUrl(activeServerUrl));
  const [serverBannerAttachmentId, setServerBannerAttachmentId] = useState<number | null>(null);
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

  const handleWsEvent = useCallback((event: import('./hooks/useWebSocket').WsEvent) => {
    if (event.type === 'message') {
      setMessages(prev => {
        const alreadyExists = prev.some(
          m => !String(m.id).startsWith('opt-') && String(m.id) === String(event.msg.id)
        );
        if (alreadyExists) return prev;

        const myId = getBeamIdentity();
        if (event.msg.beam_identity === myId) {
          const optIdx = prev.findIndex(
            m => (m as ApiMessage & { _optimistic?: boolean })._optimistic &&
                 m.content === event.msg.content
          );
          if (optIdx !== -1) {
            const next = [...prev];
            next[optIdx] = event.msg;
            return next;
          }
        }
        return [...prev, event.msg];
      });
      const ch = channelsRef.current.find(c => String(c.id) === String(event.msg.channel_id));
      notifyMessage(
        ch?.name ?? 'channel',
        event.msg.beam_identity,
        event.msg.content,
        activeChannelRef.current?.id ?? null,
        event.msg.channel_id
      );
    }
    if (event.type === 'message_edited') {
      setMessages(prev =>
        prev.map(m =>
          String(m.id) === String(event.id)
            ? { ...m, content: event.content, edited_at: event.edited_at ?? null }
            : m
        )
      );
    }
    if (event.type === 'message_deleted') {
      setMessages(prev => prev.filter(m => String(m.id) !== String(event.id)));
    }
    if (event.type === 'member') {
      setMemberGroups(event.groups);
      for (const group of event.groups) {
        for (const user of group.users) {
          if (user.avatar != null) setAvatarCache(user.name, String(user.avatar));
        }
      }
    }
    if (event.type === 'channel_created') {
      setChannels(prev => prev.some(c => String(c.id) === String(event.channel.id)) ? prev : [...prev, event.channel]);
    }
    if (event.type === 'channel_deleted') {
      setChannels(prev => prev.filter(c => String(c.id) !== String(event.channel_id)));
    }
    if (event.type === 'channel_renamed') {
      setChannels(prev => prev.map(c => String(c.id) === String(event.channel.id) ? { ...c, ...event.channel } : c));
    }
    if (event.type === 'voice_state') {
      handleVoiceState(event);
    }
    if (event.type === 'stream_start') {
      setLiveStreams(prev => new Map(prev).set(event.channel_id, event.broadcaster));
    }
    if (event.type === 'stream_end') {
      setLiveStreams(prev => { const next = new Map(prev); next.delete(event.channel_id); return next; });
      handleStreamEnded();
    }
    if (event.type === 'stream_started') {
      setStreamModalOpen(true);
    }
    if (event.type === 'stream_joined') {
      setStreamModalOpen(true);
    }
  }, [handleVoiceState, handleStreamEnded]);

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
    setMessages([]);
    setMessagesLoading(true);
    setMobileSidebarOpen(false);
    const msgs = await fetchMessages(channel.id);
    setMessages(msgs);
    setMessagesLoading(false);
  }, []);

  const switchServer = useCallback(async (serverUrl: string, serverName: string) => {
    setChannels([]);
    setApiCategories([]);
    setActiveChannel(null);
    setMessages([]);
    setMemberGroups([]);

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
    fetchServerInfo(serverUrl).then(info => setServerBannerAttachmentId(info?.banner_attachment_id ?? null));

    const first = chs.find(ch => ch.type === 'text');
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
      fetchServerInfo(activeServerUrl).then(info => setServerBannerAttachmentId(info?.banner_attachment_id ?? null));
      const first = chs.find(ch => ch.type === 'text');
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
    const uncatText = channels.filter(
      ch => ch.type === 'text' && !catIds.has(String(ch.category_id))
    );
    const uncatVoice = channels.filter(
      ch => ch.type === 'voice' && !catIds.has(String(ch.category_id))
    );
    const uncatArena = channels.filter(
      ch => ch.type === 'arena' && !catIds.has(String(ch.category_id))
    );
    const uncatBoard = channels.filter(
      ch => ch.type === 'board' && !catIds.has(String(ch.category_id))
    );
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
          view={view}
          onSelectServer={(url, name) => { setView('server'); switchServer(url, name); }}
          onLogout={() => { forceLogout(); setAuthed(false); }}
          onAddServer={() => setAddServerOpen(true)}
          onHome={() => setView('home')}
          onOpenAccount={() => setAccountOpen(true)}
          onCommunity={() => setView('community')}
          onLeaveServer={async (serverUrl) => {
            // Disconnect from voice first if we're on the server being left
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
          <>
            <Sidebar
              mobileOpen={mobileSidebarOpen}
              serverName={activeServerName}
              bannerAttachmentId={serverBannerAttachmentId}
              categories={sidebarCategories}
              activeChannelId={activeChannel?.id ?? null}
              activeVoiceChannelId={voiceState.channel?.id ?? null}
              activeVoiceChannelName={voiceState.channel?.name ?? null}
              voiceParticipants={voiceState.participants}
              voiceRoomParticipants={voiceRoomParticipants}
              onSelectChannel={selectChannel}
              onJoinVoice={handleJoinVoice}
              onLeaveVoice={handleLeaveVoice}
              liveStreamChannels={liveStreams}
              onStartStream={handleStartStream}
              onJoinStream={handleJoinStream}
              voiceMuted={voiceState.isMuted}
              voiceDeafened={voiceState.isDeafened}
              onToggleMute={toggleMute}
              onToggleDeafen={toggleDeafen}
              onOpenServerSettings={() => { setServerSettingsInitialTab('overview'); setServerSettingsOpen(true); }}
              onOpenInvites={() => { setServerSettingsInitialTab('invites'); setServerSettingsOpen(true); }}
              onToggleScreenShare={toggleScreenShare}
              isScreenSharing={voiceState.isScreenSharing}
              voiceStatus={voiceState.status}
              voiceErrorMsg={voiceState.errorMsg}
              onRefresh={async () => {
                const [chs, cats] = await Promise.all([fetchChannels(), fetchCategories()]);
                setChannels(chs);
                setApiCategories(cats);
              }}
              isCloudServer={isZcloudUrl(activeServerUrl)}
              isOwner={memberGroups.flatMap(g => g.users ?? []).find(u => u.name === getBeamIdentity())?.is_owner ?? false}
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
            />
            {activeChannel?.type === 'board' ? (
              <BoardView
                channelId={activeChannel.id}
                channelName={activeChannel.name}
                liveMessages={messages}
                onCreatePost={handleCreatePost}
                onReply={handleReply}
                roleMap={roleMap}
              />
            ) : (
              <ChatMain
                channelName={activeChannel?.name ?? 'Select a channel'}
                channelId={activeChannel?.id ?? null}
                messages={messages}
                onSend={handleSend}
                onReply={handleReply}
                loading={messagesLoading}
                roleMap={roleMap}
                onOpenSidebar={() => setMobileSidebarOpen(true)}
                emojiManifest={resourcePack.activePack?.emojiManifest}
                packBaseUrl={resourcePack.activePack?.baseUrl}
              />
            )}
            <Members groups={memberGroups} onDm={() => setView('home')} />
          </>
        )}

        <ScreenShareOverlay frames={remoteFrames} />
        {voiceState.showScreenPicker && (
          <ScreenPickerModal
            onShare={startScreenCapture}
            onClose={() => startScreenCapture('')}
          />
        )}
        {voiceModalOpen && (
          <VoiceModal
            state={voiceState}
            onLeave={handleLeaveVoice}
            onClose={() => setVoiceModalOpen(false)}
          />
        )}
        {streamModalOpen && (
          <StreamModal
            state={streamState}
            onStop={handleStopStream}
            onToggleMute={toggleStreamMuteInternal}
            onClose={() => setStreamModalOpen(false)}
          />
        )}
        {addServerOpen && (
          <AddServerModal
            onClose={() => setAddServerOpen(false)}
            onAdded={() => { fetchServers().then(setServers); }}
          />
        )}
        {accountOpen && (
          <AccountModal
            onClose={() => setAccountOpen(false)}
            onLogout={() => { setAccountOpen(false); forceLogout(); setAuthed(false); }}
            onDm={() => { setAccountOpen(false); setView('home'); }}
            onSwitchServer={(url, name) => { setAccountOpen(false); setView('server'); switchServer(url, name); }}
            onOpenDevPanel={() => { setAccountOpen(false); setDevPanelOpen(true); }}
          />
        )}
        {serverSettingsOpen && (
          <ServerSettingsModal
            serverName={activeServerName}
            initialTab={serverSettingsInitialTab}
            onClose={() => setServerSettingsOpen(false)}
            onRefresh={async () => {
              const [chs, cats, mems] = await Promise.all([fetchChannels(), fetchCategories(), fetchMembers()]);
              setChannels(chs);
              setApiCategories(cats);
              setMemberGroups(mems);
              fetchServerInfo(activeServerUrl).then(info => setServerBannerAttachmentId(info?.banner_attachment_id ?? null));
            }}
          />
        )}
        {devPanelOpen && (
          <DevPanel onClose={() => setDevPanelOpen(false)} />
        )}
        <StatusBanner status={healthStatus} />
      </div>
    </div>
  );
}
