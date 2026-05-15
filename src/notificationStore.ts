export type NotifType = 'ping' | 'dm' | 'friend-request' | 'broadcast';

export interface NotifItem {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

type Listener = (items: NotifItem[]) => void;

let items: NotifItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...items];
  listeners.forEach(l => l(snapshot));
}

export function addNotification(item: Omit<NotifItem, 'id' | 'timestamp' | 'read'>) {
  const now = Date.now();
  // Suppress duplicate same-type+title within 5 seconds
  const dupe = items.find(
    i => i.type === item.type && i.title === item.title && now - i.timestamp < 5000
  );
  if (dupe) return;

  items = [
    { ...item, id: `${now}-${Math.random().toString(36).slice(2)}`, timestamp: now, read: false },
    ...items,
  ].slice(0, 50);
  emit();
}

export function markRead(type: NotifType) {
  let changed = false;
  items = items.map(i => {
    if (i.type === type && !i.read) { changed = true; return { ...i, read: true }; }
    return i;
  });
  if (changed) emit();
}

export function getUnreadCount(): number {
  return items.filter(i => !i.read).length;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener([...items]);
  return () => listeners.delete(listener);
}
