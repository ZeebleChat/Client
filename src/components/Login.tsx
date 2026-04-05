/**
 * Login/Registration screen component.
 * Handles user authentication with beam_identity and password.
 * Supports both login and registration modes, with validation.
 * Note: Beam ID is only required for login; registration is handled by the auth server.
 */
import { useState, type FormEvent } from 'react';
import { loginReq, registerReq, redeemPromoReq, sendEmailPinReq, verifyEmailPinReq, sendPasswordResetPinReq, resetPasswordWithPinReq } from '../api';
import { saveSession } from '../auth';
import styles from './Login.module.css';
import TosModal from './TosModal';

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
  const [promoExpanded, setPromoExpanded] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [tosModalOpen, setTosModalOpen] = useState(false);
  const [verifyStep, setVerifyStep] = useState(false);
  const [pendingSession, setPendingSession] = useState<Parameters<typeof saveSession>[0] | null>(null);
  const [pendingToken, setPendingToken] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // Forgot password flow
  const [forgotStep, setForgotStep] = useState<'off' | 'email' | 'reset'>('off');
  const [resetEmail, setResetEmail] = useState('');
  const [resetPin, setResetPin] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  function switchMode(register: boolean) {
    setIsRegister(register);
    setError('');
    setPassword('');
    setEmail('');
    setPromoCode('');
    setPromoStatus('idle');
    setPromoExpanded(false);
    setConfirmPassword('');
    setTosAccepted(false);
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
    if (isRegister && password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (isRegister && !tosAccepted) { setError('You must agree to the Terms of Service'); return; }
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

  async function handleResetSendPin(e: React.FormEvent) {
    e.preventDefault();
    setResetError('');
    if (!resetEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail.trim())) {
      setResetError('Please enter a valid email address');
      return;
    }
    setResetLoading(true);
    const result = await sendPasswordResetPinReq(resetEmail.trim());
    setResetLoading(false);
    if (!result.ok) { setResetError(result.error || 'Failed — please try again'); return; }
    setForgotStep('reset');
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError('');
    if (!resetPin.trim()) { setResetError('Please enter the 6-digit code'); return; }
    if (resetNewPassword.length < 8) { setResetError('Password must be at least 8 characters'); return; }
    if (resetNewPassword !== resetConfirmPassword) { setResetError('Passwords do not match'); return; }
    setResetLoading(true);
    const result = await resetPasswordWithPinReq(resetEmail.trim(), resetPin.trim(), resetNewPassword);
    setResetLoading(false);
    if (!result.ok) { setResetError(result.error || 'Failed — please try again'); return; }
    setResetSuccess(true);
  }

  function exitForgot() {
    setForgotStep('off');
    setResetEmail('');
    setResetPin('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setResetError('');
    setResetSuccess(false);
  }

  if (forgotStep !== 'off') {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>
          <div className={styles.brand}>Z</div>
          <h1 className={styles.title}>Reset Password</h1>

          {resetSuccess ? (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', margin: '0 0 8px' }}>
                Password updated! You can now sign in.
              </p>
              <button className={styles.btn} type="button" onClick={exitForgot}>Back to Sign In</button>
            </>
          ) : forgotStep === 'email' ? (
            <form className={styles.form} onSubmit={handleResetSendPin}>
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', margin: '0' }}>
                Enter your account email and we'll send a reset code.
              </p>
              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              {resetError && <div className={styles.error}>{resetError}</div>}
              <button className={styles.btn} type="submit" disabled={resetLoading}>
                {resetLoading ? 'Sending…' : 'Send Reset Code'}
              </button>
              <button type="button" className={styles.forgotBack} onClick={exitForgot}>
                Back to Sign In
              </button>
            </form>
          ) : (
            <form className={styles.form} onSubmit={handleResetPassword}>
              <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', margin: '0' }}>
                We sent a code to <strong style={{ color: 'var(--text-1)' }}>{resetEmail}</strong>
              </p>
              <div className={styles.field}>
                <label className={styles.label}>Reset Code</label>
                <input
                  className={styles.input}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={resetPin}
                  onChange={e => setResetPin(e.target.value.replace(/\D/g, ''))}
                  autoComplete="one-time-code"
                  autoFocus
                  style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20 }}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>New Password <span style={{ opacity: 0.5 }}>(min 8 chars)</span></label>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="••••••••"
                  value={resetNewPassword}
                  onChange={e => setResetNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Confirm New Password</label>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="••••••••"
                  value={resetConfirmPassword}
                  onChange={e => setResetConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              {resetError && <div className={styles.error}>{resetError}</div>}
              <button className={styles.btn} type="submit" disabled={resetLoading}>
                {resetLoading ? 'Resetting…' : 'Reset Password'}
              </button>
              <button type="button" className={styles.forgotBack}
                onClick={() => { setResetPin(''); setResetError(''); handleResetSendPin({ preventDefault: () => {} } as React.FormEvent); }}>
                Resend code
              </button>
            </form>
          )}
        </div>
      </div>
    );
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
              <label className={styles.label}>Username <span style={{ opacity: 0.5 }}>(optional)</span></label>
              <input
                className={styles.input}
                type="text"
                placeholder="username"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className={styles.label}>
                Password {isRegister && <span style={{ opacity: 0.5 }}>(min 8 chars)</span>}
              </label>
              {!isRegister && (
                <button
                  type="button"
                  className={styles.forgotLink}
                  onClick={() => { setResetEmail(''); setForgotStep('email'); }}
                >
                  Forgot password?
                </button>
              )}
            </div>
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
              <label className={styles.label}>Confirm Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {isRegister && (
            <div className={styles.promoCollapse}>
              <button
                type="button"
                className={styles.promoToggle}
                onClick={() => setPromoExpanded(v => !v)}
              >
                Have a promo code? {promoExpanded ? '▲' : '▼'}
              </button>
              {promoExpanded && (
                <div className={styles.field} style={{ marginTop: 8 }}>
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
            </div>
          )}

          {isRegister && (
            <label className={styles.tosLabel}>
              <input
                type="checkbox"
                checked={tosAccepted}
                onChange={e => setTosAccepted(e.target.checked)}
                className={styles.tosCheckbox}
              />
              I agree to the{' '}
              <button type="button" className={styles.tosLink} onClick={() => setTosModalOpen(true)}>
                Terms of Service
              </button>
            </label>
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
      {tosModalOpen && <TosModal onClose={() => setTosModalOpen(false)} />}
    </div>
  );
}
