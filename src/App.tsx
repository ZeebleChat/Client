/**
 * Main application entry point for Zeeble chat client.
 * Manages global state including authentication, server/channels/messages,
 * voice channels, and renders the three-column layout (Rail | Sidebar+Chat | Members).
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
fetchServers,
fetchChannels,
fetchCategories,
fetchMessages,
fetchMembers,
fetchCustomRoles,
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

import Sidebar from './components/Sidebar';
import ChatMain from './components/ChatMain';
import Members from './components/Members';
import Login from './components/Login';
import styles from './App.module.css';

// ── Rail needs a compatible server list ──────────────────────────────────────
// Rail was built for mock Server objects with { id, name, unread }.
// Adapt ApiServer to that shape inline.

import RailAdapter from './components/RailAdapter';
import VoiceModal from './components/VoiceModal';
import AddServerModal from './components/AddServerModal';
import HomeView from './components/HomeView';
import AccountModal from './components/AccountModal';
import ServerSettingsModal from './components/ServerSettingsModal';
import ScreenShareOverlay from './components/ScreenShareOverlay';
import ScreenPickerModal from './components/ScreenPickerModal';
import TitleBar from './components/TitleBar';
import { useVoice } from './hooks/useVoice';
import { useHealthCheck } from './hooks/useHealthCheck';
import StatusBanner from './components/StatusBanner';

/**
 * Root application component. Handles:
 * - Authentication state management
 * - Server/channel/message fetching and caching
 * - WebSocket connection for real-time updates
 * - Voice channel state via useVoice hook
 * - Modal visibility (account, server settings, add server)
 * - View switching between home and server views
 */
export default function App() {
  useTheme();
  const [authed, setAuthed] = useState(isAuthenticated());

  // ── Server state ───────────────────────────────────────────────────────────
  const [servers, setServers] = useState<ApiServer[]>([]);
  const [activeServerUrl, setActiveServerUrl] = useState<string>(
    localStorage.getItem('active_server_url') || ''
  );
  const healthStatus = useHealthCheck(authed, activeServerUrl);

  // ── Channel / category state ───────────────────────────────────────────────
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [apiCategories, setApiCategories] = useState<import('./api').ApiCategory[]>([]);
  const [activeChannel, setActiveChannel] = useState<ApiChannel | null>(null);

  // ── Message state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // ── Member state ───────────────────────────────────────────────────────────
  const [memberGroups, setMemberGroups] = useState<ApiMemberGroup[]>([]);

  // ── Voice state ────────────────────────────────────────────────────────────
  const { voiceState, joinVoice, leaveVoice, toggleMute, toggleDeafen, toggleScreenShare, startScreenCapture } = useVoice();
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [addServerOpen, setAddServerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [serverSettingsInitialTab, setServerSettingsInitialTab] = useState<'overview' | 'categories' | 'roles' | 'invites'>('overview');
  const [view, setView] = useState<'server' | 'home'>(
    localStorage.getItem('active_server_url') ? 'server' : 'home'
  );

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const handleWsEvent = useCallback((event: import('./hooks/useWebSocket').WsEvent) => {
    if (event.type === 'message') {
      setMessages(prev => {
        // Deduplicate: server replays recent messages on WS join, which are
        // already present from the HTTP fetch — skip if ID already exists.
        const alreadyExists = prev.some(
          m => !String(m.id).startsWith('opt-') && String(m.id) === String(event.msg.id)
        );
        if (alreadyExists) return prev;

        // Replace optimistic message from same user with confirmed server copy
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
    }
  }, []);

  const { send } = useWebSocket({
    serverUrl: activeServerUrl,
    channelId: activeChannel?.id ?? null,
    onEvent: handleWsEvent,
  });

  // ── Listen for forced logout events (e.g. 401 cascade from api.ts) ──────────
  useEffect(() => {
    const handler = () => setAuthed(false);
    window.addEventListener('zeeble-logout', handler);
    return () => window.removeEventListener('zeeble-logout', handler);
  }, []);

  // ── Load servers + prefetch own avatar on auth ────────────────────────────
  useEffect(() => {
    if (!authed) return;
    fetchServers().then(setServers);
    // Populate avatar cache so all avatar spots show immediately
    getAccountInfo().then(info => {
      const identity = getBeamIdentity();
      if (info && identity) {
        setAvatarCache(identity, info.avatar_attachment_id);
      }
    });
  }, [authed]);

  // ── Switch server ──────────────────────────────────────────────────────────
  const switchServer = useCallback(async (serverUrl: string, serverName: string) => {
    setChannels([]);
    setApiCategories([]);
    setActiveChannel(null);
    setMessages([]);
    setMemberGroups([]);

    // Exchange token FIRST so the chat token is ready before the WS reconnects
    await exchangeToken(serverUrl);

    localStorage.setItem('active_server_url', serverUrl);
    localStorage.setItem('active_server_name', serverName);
    setActiveServerUrl(serverUrl); // triggers WS reconnect via serverUrl dep

    // Load channels, categories, members, custom roles in parallel
    const [chs, cats, mems] = await Promise.all([
      fetchChannels(),
      fetchCategories(),
      fetchMembers(),
      fetchCustomRoles(), // populates getRoleColor cache
    ]);
    setChannels(chs);
    setApiCategories(cats);
    setMemberGroups(mems);

    // Auto-select first text channel and switch to server view
    const first = chs.find(ch => ch.type === 'text');
    if (first) selectChannel(first);
    setView('server');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load initial server data if already active ─────────────────────────────
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
      const first = chs.find(ch => ch.type === 'text');
      if (first) selectChannel(first);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // ── Select channel ─────────────────────────────────────────────────────────
  const selectChannel = useCallback(async (channel: ApiChannel) => {
    setActiveChannel(channel);
    setMessages([]);
    setMessagesLoading(true);
    const msgs = await fetchMessages(channel.id);
    setMessages(msgs);
    setMessagesLoading(false);
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback((content: string, attachmentIds?: (string | number)[]) => {
    if (!activeChannel) return;
    const { payload, optimistic } = buildChatMessagePayload(activeChannel.id, content, attachmentIds);
    // Add optimistic message immediately
    setMessages(prev => [...prev, { ...optimistic, _optimistic: true } as ApiMessage]);
    // Send over WS
    send(payload);
  }, [activeChannel, send]);

  // ── Voice ─────────────────────────────────────────────────────────────────
  const handleJoinVoice = useCallback(async (channel: ApiChannel) => {
    await joinVoice(channel);
  }, [joinVoice]);

  const handleLeaveVoice = useCallback(async () => {
    await leaveVoice();
    setVoiceModalOpen(false);
  }, [leaveVoice]);

  // ── Build role map for chat coloring ──────────────────────────────────────
  const roleMap = useMemo(() => {
    const map: Record<string, string | null | undefined> = {};
    for (const group of memberGroups) {
      for (const user of group.users ?? []) {
        map[user.name] = user.role;
      }
    }
    return map;
  }, [memberGroups]);

  // ── Build sidebar categories ───────────────────────────────────────────────
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
    }));

    // Uncategorized text/voice channels
    const catIds = new Set(apiCategories.map(c => String(c.id)));
    const uncatText = channels.filter(
      ch => ch.type === 'text' && !catIds.has(String(ch.category_id))
    );
    const uncatVoice = channels.filter(
      ch => ch.type === 'voice' && !catIds.has(String(ch.category_id))
    );
    if (uncatText.length || uncatVoice.length) {
      result.unshift({
        id: '__uncategorized__',
        name: 'Channels',
        textChannels: uncatText,
        voiceChannels: uncatVoice,
      });
    }

    return result;
  }, [channels, apiCategories]);

  // ── Active server name ─────────────────────────────────────────────────────
  const activeServerName = useMemo(() => {
    const srv = servers.find(s => s.server_url === activeServerUrl);
    return srv?.server_name ?? localStorage.getItem('active_server_name') ?? 'Server';
  }, [servers, activeServerUrl]);

  // ── Auth state ─────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <>
        <TitleBar />
        <Login onLogin={() => setAuthed(true)} />
        <StatusBanner status={healthStatus} />
      </>
    );
  }

  return (
    <div className={styles.root}>
    <TitleBar />
    <div className={styles.app}>
      <RailAdapter
        servers={servers}
        activeServerUrl={activeServerUrl}
        view={view}
        onSelectServer={(url, name) => { setView('server'); switchServer(url, name); }}
        onLogout={() => { forceLogout(); setAuthed(false); }}
        onAddServer={() => setAddServerOpen(true)}
        onHome={() => setView('home')}
        onOpenAccount={() => setAccountOpen(true)}
      />
      {view === 'home' ? (
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
            serverName={activeServerName}
            categories={sidebarCategories}
            activeChannelId={activeChannel?.id ?? null}
            activeVoiceChannelId={voiceState.channel?.id ?? null}
            activeVoiceChannelName={voiceState.channel?.name ?? null}
            voiceParticipants={voiceState.participants}
            onSelectChannel={selectChannel}
            onJoinVoice={handleJoinVoice}
            onLeaveVoice={handleLeaveVoice}
            voiceMuted={voiceState.isMuted}
            voiceDeafened={voiceState.isDeafened}
            onToggleMute={toggleMute}
            onToggleDeafen={toggleDeafen}
            onOpenServerSettings={() => { setServerSettingsInitialTab('overview'); setServerSettingsOpen(true); }}
            onOpenInvites={() => { setServerSettingsInitialTab('invites'); setServerSettingsOpen(true); }}
            onToggleScreenShare={toggleScreenShare}
            isScreenSharing={voiceState.isScreenSharing}
            onRefresh={async () => {
              const [chs, cats] = await Promise.all([fetchChannels(), fetchCategories()]);
              setChannels(chs);
              setApiCategories(cats);
            }}
            isCloudServer={isZcloudUrl(activeServerUrl)}
            isOwner={memberGroups.flatMap(g => g.users ?? []).find(u => u.name === getBeamIdentity())?.is_owner ?? false}
            onLeaveServer={async () => {
              await leaveCloudServer(activeServerUrl);
              localStorage.removeItem('active_server_url');
              localStorage.removeItem('active_server_name');
              setActiveServerUrl('');
              setView('home');
              setServers(await fetchServers());
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
          <ChatMain
            channelName={activeChannel?.name ?? 'Select a channel'}
            channelId={activeChannel?.id ?? null}
            messages={messages}
            onSend={handleSend}
            loading={messagesLoading}
            roleMap={roleMap}
          />
          <Members
            groups={memberGroups}
            onDm={() => setView('home')}
          />
        </>
      )}

      <ScreenShareOverlay screens={voiceState.remoteScreens} />
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
          onToggleScreenShare={toggleScreenShare}
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
          }}
        />
      )}
      <StatusBanner status={healthStatus} />
    </div>
    </div>
  );
}
