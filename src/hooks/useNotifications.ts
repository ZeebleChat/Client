import { useCallback } from 'react';
import { getBeamIdentity } from '../auth';

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
    msgChannelId: string | number
  ) => {
    const myId = getBeamIdentity();
    if (senderBeam === myId) return; // own message
    if (String(activeChannelId) === String(msgChannelId)) return; // already viewing

    const myName = localStorage.getItem('cached_display_name') || myId || '';
    const isMention = myName
      ? content.toLowerCase().includes(`@${myName.toLowerCase()}`)
      : false;

    const notifAllMsg  = localStorage.getItem('notif_all_msg') === 'true';
    const notifMention = localStorage.getItem('notif_mention') !== 'false';

    if (notifAllMsg || (notifMention && isMention)) {
      notify(`#${channelName}`, content.slice(0, 100), `ch-${msgChannelId}`);
    }
  }, [notify]);

  const notifyDm = useCallback((fromBeam: string, content: string) => {
    const myId = getBeamIdentity();
    if (fromBeam === myId) return;
    if (localStorage.getItem('notif_dm') === 'false') return;
    notify(`DM from ${fromBeam}`, content.slice(0, 100), `dm-${fromBeam}`);
  }, [notify]);

  return { notify, notifyMessage, notifyDm };
}
