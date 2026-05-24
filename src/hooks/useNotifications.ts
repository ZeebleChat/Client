import { useCallback } from 'react';
import { getBeamIdentity } from '../auth';
import { addNotification } from '../notificationStore';

export function useNotifications() {
  const notify = useCallback((title: string, body: string, tag?: string) => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (localStorage.getItem('notif_desktop') === 'false') return;
    new Notification(title, { body, tag, icon: '/icons/128x128.png' });
  }, []);

  const notifyMessage = useCallback((
    channelName: string,
    senderBeam: string,
    content: string,
    activeChannelId: string | number | null,
    msgChannelId: string | number,
    serverMentions?: string[]
  ) => {
    const myId = getBeamIdentity();
    if (senderBeam === myId) return;
    if (String(activeChannelId) === String(msgChannelId)) return;

    const myName = localStorage.getItem('cached_display_name') || myId || '';
    const isMention =
      (myId != null && (serverMentions ?? []).includes(myId)) ||
      (myName ? content.toLowerCase().includes(`@${myName.toLowerCase()}`) : false);

    const notifAllMsg  = localStorage.getItem('notif_all_msg') === 'true';
    const notifMention = localStorage.getItem('notif_mention') !== 'false';

    if (notifAllMsg || (notifMention && isMention)) {
      notify(`#${channelName}`, content.slice(0, 100), `ch-${msgChannelId}`);
    }

    // Note: ping bell entries for @mentions are added in App.tsx using the
    // server-confirmed mentions array, so we only need to handle notifAllMsg here.
    if (notifAllMsg) {
      addNotification({
        type: 'ping',
        title: `#${channelName}`,
        body: content.slice(0, 120),
      });
    }
  }, [notify]);

  const notifyDm = useCallback((fromBeam: string, content: string) => {
    const myId = getBeamIdentity();
    if (fromBeam === myId) return;
    if (localStorage.getItem('notif_dm') === 'false') return;
    notify(`DM from ${fromBeam}`, content.slice(0, 100), `dm-${fromBeam}`);
    addNotification({
      type: 'dm',
      title: fromBeam,
      body: content.slice(0, 120),
    });
  }, [notify]);

  const notifyFriendRequest = useCallback((fromBeam: string) => {
    notify(`Friend request from ${fromBeam}`, 'Wants to be friends', `fr-${fromBeam}`);
    addNotification({
      type: 'friend-request',
      title: fromBeam,
      body: 'Sent you a friend request',
    });
  }, [notify]);

  return { notify, notifyMessage, notifyDm, notifyFriendRequest };
}
