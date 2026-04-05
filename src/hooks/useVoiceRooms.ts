import { useState, useEffect, useRef } from 'react';
import { getServerUrl } from '../config';
import { getChatToken } from '../auth';

const POLL_INTERVAL_MS = 10_000;

async function fetchVoiceRooms(): Promise<string[]> {
  const serverUrl = getServerUrl();
  const token = getChatToken(serverUrl);
  if (!serverUrl || !token) return [];
  try {
    const res = await fetch(`${serverUrl}/v1/voice/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rooms: Array<{ name: string }> = Array.isArray(data?.rooms) ? data.rooms : [];
    return rooms.map(r => r.name);
  } catch { return []; }
}

async function fetchParticipants(channelId: string): Promise<string[]> {
  const serverUrl = getServerUrl();
  const token = getChatToken(serverUrl);
  if (!serverUrl || !token) return [];
  try {
    const res = await fetch(
      `${serverUrl}/v1/voice/participants/${encodeURIComponent(channelId)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const participants: Array<{ identity: string }> = Array.isArray(data?.participants)
      ? data.participants
      : [];
    return participants.map(p => p.identity);
  } catch { return []; }
}

export function useVoiceRooms(enabled: boolean): Record<string, string[]> {
  const [roomMap, setRoomMap] = useState<Record<string, string[]>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRoomMap({});
      return;
    }

    async function poll() {
      const activeRooms = await fetchVoiceRooms();
      if (activeRooms.length === 0) {
        setRoomMap({});
        return;
      }
      const entries = await Promise.all(
        activeRooms.map(async id => [id, await fetchParticipants(id)] as const),
      );
      setRoomMap(Object.fromEntries(entries));
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);

  return roomMap;
}
