import { useCallback } from 'react';
import type { RefObject, Dispatch, SetStateAction } from 'react';
import type { ApiChannel, ApiMessage, ApiMemberGroup } from '../api';
import { getBeamIdentity } from '../auth';
import { setAvatarCache } from '../avatarCache';
import { addNotification } from '../notificationStore';
import type { WsEvent } from '../hooks/useWebSocket';

interface UseWsEventsParams {
  activeChannelRef: RefObject<ApiChannel | null>;
  channelsRef: RefObject<ApiChannel[]>;
  setMessages: Dispatch<SetStateAction<ApiMessage[]>>;
  setChannels: Dispatch<SetStateAction<ApiChannel[]>>;
  setMemberGroups: Dispatch<SetStateAction<ApiMemberGroup[]>>;
  setUnreadChannelIds: Dispatch<SetStateAction<Set<string>>>;
  setMentionCounts: Dispatch<SetStateAction<Record<string, number>>>;
  setWsVoiceRoomMap: Dispatch<SetStateAction<Record<string, string[]>>>;
  setLiveStreams: Dispatch<SetStateAction<Map<string, string>>>;
  setStreamModalOpen: Dispatch<SetStateAction<boolean>>;
  handleVoiceState: (event: Extract<WsEvent, { type: 'voice_state' }>) => void;
  handleStreamEnded: () => void;
  clearRemoteFrames: () => void;
  notifyMessage: (
    channelName: string,
    identity: string,
    content: string,
    activeChannelId: string | number | null,
    channelId: string | number,
    mentions?: string[]
  ) => void;
}

export function useWsEvents({
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
}: UseWsEventsParams) {
  return useCallback((event: WsEvent) => {
    if (event.type === 'message') {
      if (String(event.msg.channel_id) === String(activeChannelRef.current?.id)) {
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
      }
      const ch = channelsRef.current.find(c => String(c.id) === String(event.msg.channel_id));
      notifyMessage(
        ch?.name ?? 'channel',
        event.msg.beam_identity,
        event.msg.content,
        activeChannelRef.current?.id ?? null,
        event.msg.channel_id,
        event.msg.mentions
      );
      const myId = getBeamIdentity();
      const isMentioned = !!(myId && event.msg.beam_identity !== myId && event.msg.mentions?.includes(myId));
      const isActiveChannel = String(event.msg.channel_id) === String(activeChannelRef.current?.id);
      if (isMentioned) {
        addNotification({
          type: 'ping',
          title: `#${ch?.name ?? 'channel'}`,
          body: event.msg.content.slice(0, 120),
        });
      }
      if (!isActiveChannel) {
        setUnreadChannelIds(prev => {
          const next = new Set(prev);
          next.add(String(event.msg.channel_id));
          return next;
        });
        if (isMentioned) {
          const chId = String(event.msg.channel_id);
          setMentionCounts(prev => ({ ...prev, [chId]: (prev[chId] ?? 0) + 1 }));
        }
      }
    }
    if (event.type === 'message_edited') {
      if (String(event.channel_id) === String(activeChannelRef.current?.id)) {
        setMessages(prev =>
          prev.map(m =>
            String(m.id) === String(event.id)
              ? { ...m, content: event.content, edited_at: event.edited_at ?? null }
              : m
          )
        );
      }
    }
    if (event.type === 'message_deleted') {
      if (String(event.channel_id) === String(activeChannelRef.current?.id)) {
        setMessages(prev => prev.filter(m => String(m.id) !== String(event.id)));
      }
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
      setWsVoiceRoomMap(prev => {
        const ch = event.channel_id;
        const current = prev[ch] ?? [];
        if (event.action === 'join') {
          if (current.includes(event.identity)) return prev;
          return { ...prev, [ch]: [...current, event.identity] };
        } else {
          const next = current.filter(id => id !== event.identity);
          if (next.length === 0) {
            const { [ch]: _, ...rest } = prev;
            return rest;
          }
          return { ...prev, [ch]: next };
        }
      });
    }
    if (event.type === 'voice_snapshot') {
      setWsVoiceRoomMap(event.rooms);
    }
    if (event.type === 'stream_start') {
      setLiveStreams(prev => new Map(prev).set(event.channel_id, event.broadcaster));
    }
    if (event.type === 'stream_end') {
      setLiveStreams(prev => { const next = new Map(prev); next.delete(event.channel_id); return next; });
      handleStreamEnded();
      clearRemoteFrames();
    }
    if (event.type === 'stream_started') {
      setStreamModalOpen(true);
    }
    if (event.type === 'stream_joined') {
      setStreamModalOpen(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleVoiceState, handleStreamEnded, clearRemoteFrames, notifyMessage]);
}
