import { useState, useEffect, useRef, useCallback } from 'react';
import { checkAuthHealth, validateToken, checkServerHealth } from '../api';
import { forceLogout } from '../auth';

export type HealthStatus = 'ok' | 'api_down' | 'server_down' | 'session_expired' | 'reconnected';

const AUTH_INTERVAL = 30_000;
const TOKEN_INTERVAL = 60_000;
const RECONNECTED_DISPLAY = 3_000;

export function useHealthCheck(authed: boolean, activeServerUrl: string): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>('ok');
  const lastRef = useRef<HealthStatus>('ok');
  const wasDownRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transition = useCallback((next: HealthStatus) => {
    if (next === lastRef.current) return;
    lastRef.current = next;
    setStatus(next);
  }, []);

  const runAuthCheck = useCallback(async () => {
    if (!authed || !navigator.onLine) return;
    const up = await checkAuthHealth();
    if (!up) {
      wasDownRef.current = true;
      transition('api_down');
    } else if (wasDownRef.current && lastRef.current === 'api_down') {
      wasDownRef.current = false;
      transition('reconnected');
      reconnectTimerRef.current = setTimeout(() => transition('ok'), RECONNECTED_DISPLAY);
    }
  }, [authed, transition]);

  const runTokenCheck = useCallback(async () => {
    if (!authed || !navigator.onLine) return;
    const result = await validateToken();
    if (result === 'invalid') {
      transition('session_expired');
      setTimeout(() => forceLogout(), 1500);
    }
  }, [authed, transition]);

  const runServerCheck = useCallback(async () => {
    if (!authed || !activeServerUrl || !navigator.onLine) return;
    const up = await checkServerHealth(activeServerUrl);
    if (!up) {
      wasDownRef.current = true;
      transition('server_down');
    } else if (wasDownRef.current && lastRef.current === 'server_down') {
      wasDownRef.current = false;
      transition('reconnected');
      reconnectTimerRef.current = setTimeout(() => transition('ok'), RECONNECTED_DISPLAY);
    }
  }, [authed, activeServerUrl, transition]);

  useEffect(() => {
    if (!authed) return;
    runAuthCheck();
    const id = setInterval(runAuthCheck, AUTH_INTERVAL);
    return () => clearInterval(id);
  }, [authed, runAuthCheck]);

  useEffect(() => {
    if (!authed) return;
    const intervalId = { current: 0 as ReturnType<typeof setInterval> };
    const t = setTimeout(() => {
      runTokenCheck();
      intervalId.current = setInterval(runTokenCheck, TOKEN_INTERVAL);
    }, 10_000);
    return () => { clearTimeout(t); clearInterval(intervalId.current); };
  }, [authed, runTokenCheck]);

  useEffect(() => {
    if (!authed || !activeServerUrl) return;
    runServerCheck();
    const id = setInterval(runServerCheck, AUTH_INTERVAL);
    return () => clearInterval(id);
  }, [authed, activeServerUrl, runServerCheck]);

  useEffect(() => {
    if (!authed) return;
    window.addEventListener('online', runAuthCheck);
    return () => window.removeEventListener('online', runAuthCheck);
  }, [authed, runAuthCheck]);

  useEffect(() => () => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
  }, []);

  return status;
}
