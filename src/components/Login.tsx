/**
 * Login/Registration screen component.
 * Handles user authentication with beam_identity and password.
 * Supports both login and registration modes, with validation.
 * Note: Beam ID is only required for login; registration is handled by the auth server.
 */
import { useState, type FormEvent } from 'react';
import { loginReq, registerReq, redeemPromoReq, sendEmailPinReq, verifyEmailPinReq } from '../api';
import { saveSession } from '../auth';
import styles from './Login.module.css';

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [verifyStep, setVerifyStep] = useState(false);
  const [pendingSession, setPendingSession] = useState<Parameters<typeof saveSession>[0] | null>(null);
  const [pendingToken, setPendingToken] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  function switchMode(register: boolean) {
    setIsRegister(register);
    setError('');
    setPassword('');
    setEmail('');
    setPromoCode('');
    setPromoStatus('idle');
    setVerifyStep(false);
    setPendingToken('');
    setPendingSession(null);
    setPin('');
    setPinError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!isRegister && !identity.trim()) { setError('Beam identity is required'); return; }
    if (!password) { setError('Password is required'); return; }
    if (isRegister && password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (isRegister && !email.trim()) { setError('Email is required'); return; }
    if (isRegister && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address'); return; }

    setLoading(true);

    try {
      let result;
      if (isRegister) {
        result = await registerReq('', password, displayName.trim() || undefined, email.trim());
      } else {
        result = await loginReq(identity.trim(), password);
      }

      if (!result.ok || !result.data?.token) {
        setError(result.data && 'error' in result.data
          ? String((result.data as { error?: string }).error)
          : isRegister ? 'Registration failed' : 'Invalid credentials');
        return;
      }

      if (isRegister && promoCode.trim()) {
        const promo = await redeemPromoReq(result.data.token, promoCode.trim());
        setPromoStatus(promo.ok ? 'success' : 'error');
      }

      if (isRegister) {
        // Send the PIN and move to the verify step
        await sendEmailPinReq(result.data.token, email.trim());
        setPendingToken(result.data.token);
        setPendingSession(result.data);
        setVerifyStep(true);
        return;
      }

      saveSession(result.data);
      onLogin();
    } catch {
      setError('Connection failed — please try again');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim()) { setPinError('Please enter the 6-digit code'); return; }
    setPinLoading(true);
    setPinError('');
    const result = await verifyEmailPinReq(pendingToken, pin.trim());
    setPinLoading(false);
    if (!result.ok) {
      setPinError(result.error || 'Invalid code — please try again');
      return;
    }
    // Verified — complete sign-up
    if (pendingSession) saveSession(pendingSession);
    onLogin();
  }

  if (verifyStep) {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>
          <div className={styles.brand}>Z</div>
          <h1 className={styles.title}>Verify your email</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', margin: '0 0 8px' }}>
            We sent a 6-digit code to<br />
            <strong style={{ color: 'var(--text-1)' }}>{email}</strong>
          </p>
          <form className={styles.form} onSubmit={handleVerifyPin}>
            <div className={styles.field}>
              <label className={styles.label}>Verification Code</label>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                autoFocus
                style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20 }}
              />
            </div>
            {pinError && <div className={styles.error}>{pinError}</div>}
            <button className={styles.btn} type="submit" disabled={pinLoading}>
              {pinLoading ? 'Verifying…' : 'Verify Email'}
            </button>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', textAlign: 'center' }}
              onClick={async () => { setPin(''); setPinError(''); await sendEmailPinReq(pendingToken, email); }}
            >
              Resend code
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <div className={styles.brand}>Z</div>
        <h1 className={styles.title}>Welcome to Zeeble</h1>

        {/* ── Mode toggle pill ── */}
        <div className={styles.modeToggle}>
          <button
            type="button"
            className={`${styles.modeBtn} ${!isRegister ? styles.modeBtnActive : ''}`}
            onClick={() => switchMode(false)}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${isRegister ? styles.modeBtnActive : ''}`}
            onClick={() => switchMode(true)}
          >
            Sign Up
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          {isRegister && (
            <div className={styles.field}>
              <label className={styles.label}>Display Name <span style={{ opacity: 0.5 }}>(optional)</span></label>
              <input
                className={styles.input}
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={12}
                autoComplete="off"
              />
            </div>
          )}

          {isRegister && (
            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          )}

          {!isRegister && (
            <div className={styles.field}>
              <label className={styles.label}>Beam Identity</label>
              <input
                className={styles.input}
                type="text"
                placeholder="user»1234"
                value={identity}
                onChange={e => setIdentity(e.target.value)}
                autoComplete="username"
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>
              Password {isRegister && <span style={{ opacity: 0.5 }}>(min 8 chars)</span>}
            </label>
            <input
              className={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          {isRegister && (
            <div className={styles.field}>
              <label className={styles.label}>Promo Code <span style={{ opacity: 0.5 }}>(optional)</span></label>
              <input
                className={styles.input}
                type="text"
                placeholder="Enter code"
                value={promoCode}
                onChange={e => setPromoCode(e.target.value)}
                autoComplete="off"
              />
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}
          {promoStatus === 'success' && <div className={styles.promoSuccess}>Promo applied!</div>}
          {promoStatus === 'error' && <div className={styles.error}>Promo code is invalid or already used.</div>}

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading
              ? (isRegister ? 'Creating account…' : 'Signing in…')
              : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
}
