/**
 * Checks browser / WebView2 permission state for a media device type.
 *
 * Returns:
 *  - state:   'unknown' | 'granted' | 'denied' | 'prompt'
 *  - request: async fn — calls getUserMedia to trigger the permission grant
 *             (only needed when state === 'prompt')
 */
import { useState, useEffect, useCallback } from 'react';

export type PermState = 'unknown' | 'granted' | 'denied' | 'prompt';

export function usePermissionGate(kind: 'microphone' | 'camera') {
  const [state, setState] = useState<PermState>('unknown');

  // Check current permission state via the Permissions API (no dialog shown)
  useEffect(() => {
    let live = true;
    navigator.permissions
      .query({ name: kind as PermissionName })
      .then(status => {
        if (!live) return;
        setState(status.state as PermState);
        status.onchange = () => {
          if (live) setState(status.state as PermState);
        };
      })
      .catch(() => {
        // Permissions API not available (e.g. older WebView) — assume prompt
        if (live) setState('prompt');
      });
    return () => { live = false; };
  }, [kind]);

  // Calling this will actually trigger getUserMedia (one-time browser prompt)
  const request = useCallback(async (): Promise<boolean> => {
    try {
      const constraints =
        kind === 'microphone' ? { audio: true } : { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Immediately release — we just needed the grant
      stream.getTracks().forEach(t => t.stop());
      setState('granted');
      return true;
    } catch {
      setState('denied');
      return false;
    }
  }, [kind]);

  return { state, request };
}
