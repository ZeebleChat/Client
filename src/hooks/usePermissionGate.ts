import { useState, useEffect, useCallback } from 'react';

export type PermState = 'unknown' | 'granted' | 'denied' | 'prompt';

export function usePermissionGate(kind: 'microphone' | 'camera') {
  const [state, setState] = useState<PermState>('unknown');

  useEffect(() => {
    let live = true;
    navigator.permissions
      .query({ name: kind as PermissionName })
      .then(status => {
        if (!live) return;
        setState(status.state as PermState);
        status.onchange = () => { if (live) setState(status.state as PermState); };
      })
      .catch(() => { if (live) setState('prompt'); });
    return () => { live = false; };
  }, [kind]);

  const request = useCallback(async (): Promise<boolean> => {
    try {
      const constraints = kind === 'microphone' ? { audio: true } : { video: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
