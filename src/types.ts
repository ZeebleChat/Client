export type { ApiServer, ApiChannel, ApiCategory, ApiMessage, ApiMemberGroup, ApiMemberUser } from './api';

export interface SidebarCategory {
  id: string | number;
  name: string;
  textChannels: import('./api').ApiChannel[];
  voiceChannels: import('./api').ApiChannel[];
}

export type StatusDotClass = 'on' | 'idle' | 'dnd' | 'offline';

export interface Server {
  id: string;
  name: string;
  unread?: number;
  channels: unknown[];
}

export type Message = Record<string, unknown>;

export interface MemberGroup {
  name?: string;
  label?: string;
  members: unknown[];
}

export function statusClass(status?: string): StatusDotClass {
  if (status === 'online') return 'on';
  if (status === 'idle') return 'idle';
  if (status === 'dnd') return 'dnd';
  return 'offline';
}

export function formatTime(ts: number | string | null | undefined): string {
  if (ts == null) return '';
  let d: Date;
  if (typeof ts === 'number') {
    d = ts > 1e10 ? new Date(ts) : new Date(ts * 1000);
  } else {
    const s = String(ts).trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      d = n > 1e10 ? new Date(n) : new Date(n * 1000);
    } else {
      d = new Date(s.replace(' ', 'T'));
    }
  }
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `Today at ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
