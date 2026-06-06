import React from 'react';
import Sidebar from '../components/Sidebar';
import ChatMain from '../components/ChatMain';
import BoardView from '../components/BoardView';
import Members from '../components/Members';
import type { ApiChannel, ApiMessage, ApiMemberGroup } from '../api';
import type { SidebarCategory } from '../types';
import type { Participant } from '../hooks/useVoice';
import type { EmojiManifest } from '../resourcePack';

type SidebarProps = React.ComponentProps<typeof Sidebar>;

interface ServerViewProps {
  mobileOpen: boolean;
  serverName: string;
  unreadChannelIds: Set<string>;
  mentionCounts: Record<string, number>;
  bannerAttachmentId: string | null;
  categories: SidebarCategory[];
  activeChannel: ApiChannel | null;
  activeVoiceChannelId: string | number | null;
  activeVoiceChannelName: string | null;
  voiceParticipants: Participant[];
  voiceRoomParticipants: Record<string, string[]>;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  voiceStatus: SidebarProps['voiceStatus'];
  voiceErrorMsg: SidebarProps['voiceErrorMsg'];
  isScreenSharing: boolean;
  liveStreams: Map<string, string>;
  messages: ApiMessage[];
  messagesLoading: boolean;
  memberGroups: ApiMemberGroup[];
  roleMap: Record<string, string | null | undefined>;
  isCloudServer: boolean;
  isOwner: boolean;
  emojiManifest?: EmojiManifest;
  packBaseUrl?: string;
  onSelectChannel: (ch: ApiChannel) => void;
  onJoinVoice: (ch: ApiChannel) => Promise<void>;
  onLeaveVoice: () => Promise<void>;
  onStartStream: (ch: ApiChannel) => Promise<void>;
  onJoinStream: (ch: ApiChannel) => Promise<void>;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onOpenServerSettings: () => void;
  onOpenInvites: () => void;
  onToggleScreenShare: () => void;
  onRefreshChannels: () => Promise<void>;
  onLeaveServer: () => Promise<{ ok: boolean }>;
  onDeleteServer: () => Promise<{ ok: boolean }>;
  onSend: (content: string, attachments?: (string | number)[]) => void;
  onReply: (content: string, replyTo: string | number, attachments?: (string | number)[]) => void;
  onCreatePost: (title: string, content: string) => void;
  onOpenSidebar: () => void;
  onDm: () => void;
}

export default function ServerView({
  mobileOpen,
  serverName,
  unreadChannelIds,
  mentionCounts,
  bannerAttachmentId,
  categories,
  activeChannel,
  activeVoiceChannelId,
  activeVoiceChannelName,
  voiceParticipants,
  voiceRoomParticipants,
  voiceMuted,
  voiceDeafened,
  voiceStatus,
  voiceErrorMsg,
  isScreenSharing,
  liveStreams,
  messages,
  messagesLoading,
  memberGroups,
  roleMap,
  isCloudServer,
  isOwner,
  emojiManifest,
  packBaseUrl,
  onSelectChannel,
  onJoinVoice,
  onLeaveVoice,
  onStartStream,
  onJoinStream,
  onToggleMute,
  onToggleDeafen,
  onOpenServerSettings,
  onOpenInvites,
  onToggleScreenShare,
  onRefreshChannels,
  onLeaveServer,
  onDeleteServer,
  onSend,
  onReply,
  onCreatePost,
  onOpenSidebar,
  onDm,
}: ServerViewProps) {
  return (
    <>
      <Sidebar
        mobileOpen={mobileOpen}
        serverName={serverName}
        unreadChannelIds={unreadChannelIds}
        mentionCounts={mentionCounts}
        bannerAttachmentId={bannerAttachmentId}
        categories={categories}
        activeChannelId={activeChannel?.id ?? null}
        activeVoiceChannelId={activeVoiceChannelId}
        activeVoiceChannelName={activeVoiceChannelName}
        voiceParticipants={voiceParticipants}
        voiceRoomParticipants={voiceRoomParticipants}
        onSelectChannel={onSelectChannel}
        onJoinVoice={onJoinVoice}
        onLeaveVoice={onLeaveVoice}
        liveStreamChannels={liveStreams}
        onStartStream={onStartStream}
        onJoinStream={onJoinStream}
        voiceMuted={voiceMuted}
        voiceDeafened={voiceDeafened}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
        onOpenServerSettings={onOpenServerSettings}
        onOpenInvites={onOpenInvites}
        onToggleScreenShare={onToggleScreenShare}
        isScreenSharing={isScreenSharing}
        voiceStatus={voiceStatus}
        voiceErrorMsg={voiceErrorMsg}
        onRefresh={onRefreshChannels}
        isCloudServer={isCloudServer}
        isOwner={isOwner}
        onLeaveServer={onLeaveServer}
        onDeleteServer={onDeleteServer}
      />
      {activeChannel?.type === 'board' ? (
        <BoardView
          channelId={activeChannel.id}
          channelName={activeChannel.name}
          liveMessages={messages}
          onCreatePost={onCreatePost}
          onReply={onReply}
          roleMap={roleMap}
        />
      ) : (
        <ChatMain
          channelName={activeChannel?.name ?? 'Select a channel'}
          channelId={activeChannel?.id ?? null}
          messages={messages}
          onSend={onSend}
          onReply={onReply}
          loading={messagesLoading}
          roleMap={roleMap}
          onOpenSidebar={onOpenSidebar}
          emojiManifest={emojiManifest}
          packBaseUrl={packBaseUrl}
        />
      )}
      <Members groups={memberGroups} onDm={onDm} />
    </>
  );
}
