/**
 * Type definitions for Zeeble React client.
 * Re-exports API types and provides UI-level composed types.
 */

// Re-export API types for use across components
export type { ApiServer, ApiChannel, ApiCategory, ApiMessage, ApiMemberGroup, ApiMemberUser } from './api';

// UI-level composed types

/**
 * Category with channels for sidebar rendering.
 * Derived from ApiCategory + filtering channels by category_id.
 */
export interface SidebarCategory {
id: string | number;
name: string;
textChannels: import('./api').ApiChannel[];
voiceChannels: import('./api').ApiChannel[];
}

/** CSS class for status indicator dot */
export type StatusDotClass = 'on' | 'idle' | 'dnd' | 'offline';

/** Mock server type for Rail component (legacy) */
export interface Server {
id: string;
name: string;
unread?: number;
channels: unknown[];
}

/** Generic message type for legacy data module */
export type Message = Record<string, unknown>;

/** Member group for legacy data module */
export interface MemberGroup {
name?: string;
label?: string;
members: unknown[];
}

/**
 * Maps API status string to CSS class for status indicator.
 * @param status - Status string from API (online, idle, dnd, etc.)
 * @returns CSS class name for the status dot
 */
export function statusClass(status?: string): StatusDotClass {
if (status === 'online') return 'on';
if (status === 'idle') return 'idle';
if (status === 'dnd') return 'dnd';
return 'offline';
}

/**
 * Formats a timestamp into a human-readable string.
 * Handles Unix seconds, milliseconds, or ISO strings.
 * @param ts - Timestamp in various formats
 * @returns Formatted string like "Today at 3:14 PM" or "Jan 15"
 */
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
