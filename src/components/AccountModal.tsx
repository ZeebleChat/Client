/**
 * Account settings modal with multiple tabs:
 * Profile (avatar, display name), Security (password), Friends,
 * Servers (leave), Sub-accounts (create/manage), Premium info,
 * Appearance (theme, accent color), and Dev (server URLs).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';
import {
  getAccountInfo,
  updateDisplayName,
  sendEmailPinReq,
  verifyEmailPinReq,
  updatePassword,
  fetchFriends,
  sendFriendRequest,
  removeFriend,
  fetchFriendRequests,
  acceptFriendRequest,
  fetchServers,
  removeServer,
  uploadAvatar,
  getAuthAttachmentUrl,
  createSubAccount,
  deleteSubAccount,
  lockSubAccount,
  unlockSubAccount,
  setSubAccountPassword,
  setChildParentalControls,
  regenBotKey,
  setupTotp,
  enableTotp,
  disableTotp,
  generateRecoveryCodes,
  getRecoveryCodesStatus,
  createSubscription,
  confirmSubscriptionPayment,
  redeemPromoCode,
  type ApiFriend,
  type ApiFriendRequest,
  type ApiAccountInfo,
  type ApiSubAccount,
  type ApiServer,
  type ParentalControls,
} from '../api';

const stripePromise = loadStripe('pk_live_51TDqoL3D524x7zwNWBF2QWsFCixoCww15vFqIvCX6nGv0NIMw51zgM3OakA7sop5Jw6LQ3XDP8GYBftKPQc21C0500U3iLuR2O');
import { getBeamIdentity, getToken } from '../auth';
import { ENV_AUTH_URL, ENV_DM_URL, ENV_ZCLOUD_URL } from '../config';
import { setAvatarCache, getAvatarCache, AVATAR_CACHE_EVENT } from '../avatarCache';
import { useTheme, type Theme } from '../hooks/useTheme';
import PermissionGate from './PermissionGate';
import styles from './AccountModal.module.css';

interface Props {
  onClose: () => void;
  onLogout: () => void;
  onDm?: (beamIdentity: string) => void;
  onSwitchServer?: (url: string, name: string) => void;
  onOpenDevPanel?: () => void;
}

type Tab = 'profile' | 'security' | 'friends' | 'servers' | 'subaccounts' | 'promo' | 'premium' | 'appearance' | 'notifications' | 'accessibility' | 'voice' | 'dev';

// ── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ name, avatarId, size = 48 }: { name: string; avatarId?: string | null; size?: number }) {
  if (avatarId) {
    return (
      <img
        src={getAuthAttachmentUrl(avatarId)}
        className={styles.avatarImg}
        style={{ width: size, height: size, borderRadius: 12 }}
        alt="avatar"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const inits = (name || '?').slice(0, 2).toUpperCase();
  return (
    <div className={styles.avatar} style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {inits}
    </div>
  );
}

// ── Profile tab ────────────────────────────────────────────────────────────────

function ProfileTab() {
  const beamIdentity = getBeamIdentity();
  const [info, setInfo] = useState<ApiAccountInfo | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [emailSending, setEmailSending] = useState(false);
  const [emailPinStep, setEmailPinStep] = useState(false);
  const [emailPin, setEmailPin] = useState('');
  const [emailPinVerifying, setEmailPinVerifying] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAccountInfo().then(data => {
      if (data) {
        setInfo(data);
        setDisplayName(data.display_name ?? '');
        setEmail(data.email ?? '');
        // Populate avatar cache so other components can show the avatar
        if (beamIdentity) setAvatarCache(beamIdentity, data.avatar_attachment_id);
      }
    });
  }, [beamIdentity]);

  async function handleSave() {
    if (!displayName.trim()) return;
    setSaving(true);
    setSaveStatus(null);
    const result = await updateDisplayName(displayName.trim());
    setSaving(false);
    if (result.ok) {
      setSaveStatus({ ok: true, msg: 'Display name saved!' });
      localStorage.setItem('cached_display_name', displayName.trim());
      window.dispatchEvent(new CustomEvent('zeeble:display-name-changed'));
    } else {
      setSaveStatus({ ok: false, msg: result.error || 'Failed to save.' });
    }
    setTimeout(() => setSaveStatus(null), 2500);
  }

  async function handleSendEmailPin() {
    const trimmed = email.trim();
    if (!trimmed) { setEmailStatus({ ok: false, msg: 'Email cannot be empty.' }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setEmailStatus({ ok: false, msg: 'Please enter a valid email address.' }); return; }
    setEmailSending(true);
    setEmailStatus(null);
    const token = getToken() ?? '';
    const result = await sendEmailPinReq(token, trimmed);
    setEmailSending(false);
    if (!result.ok) {
      setEmailStatus({ ok: false, msg: result.error || 'Failed to send code.' });
      return;
    }
    setEmailPin('');
    setEmailPinStep(true);
    setEmailStatus({ ok: true, msg: `Code sent to ${trimmed}` });
    setTimeout(() => setEmailStatus(null), 3000);
  }

  async function handleVerifyEmailPin() {
    if (!emailPin.trim()) { setEmailStatus({ ok: false, msg: 'Enter the 6-digit code.' }); return; }
    setEmailPinVerifying(true);
    setEmailStatus(null);
    const token = getToken() ?? '';
    const result = await verifyEmailPinReq(token, emailPin.trim());
    setEmailPinVerifying(false);
    if (!result.ok) {
      setEmailStatus({ ok: false, msg: result.error || 'Incorrect code — please try again.' });
      return;
    }
    setEmailPinStep(false);
    setEmailPin('');
    setInfo(prev => prev ? { ...prev, email: email.trim() } : prev);
    setEmailStatus({ ok: true, msg: 'Email verified and saved!' });
    setTimeout(() => setEmailStatus(null), 3000);
  }

  async function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const result = await uploadAvatar(file);
    setUploading(false);
    if (result.ok && result.avatar_attachment_id) {
      setInfo(prev => prev ? { ...prev, avatar_attachment_id: result.avatar_attachment_id } : prev);
      if (beamIdentity) setAvatarCache(beamIdentity, result.avatar_attachment_id);
    }
    e.target.value = '';
  }

  const accountType = info?.account_type ?? '';

  return (
    <div className={styles.tabContent}>
      <div className={styles.profileCard}>
        <div className={styles.avatarWrap} onClick={() => fileRef.current?.click()} title="Change avatar">
          <Avatar name={displayName || beamIdentity} avatarId={info?.avatar_attachment_id} size={64} />
          <div className={styles.avatarOverlay}>
            {uploading ? '…' : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleAvatarFile} />
        </div>
        <div className={styles.profileMeta}>
          <div className={styles.profileBeam}>{beamIdentity}</div>
          <div className={styles.badgeRow}>
            {accountType && (
              <span className={`${styles.badge} ${
                accountType === 'primary' ? styles.badgePrimary :
                accountType === 'bot' ? styles.badgeBot :
                styles.badgeAlt
              }`}>
                {accountType}
              </span>
            )}
            {info?.verified && (
              <span className={`${styles.badge} ${styles.badgeVerified}`}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                Verified
              </span>
            )}
          </div>
        </div>
        <button
          className={styles.qrBtn}
          title="Show QR code to add as friend"
          onClick={() => setShowQr(v => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="3" height="3" rx="0.5"/><rect x="19" y="14" width="2" height="2" rx="0.5"/>
            <rect x="14" y="19" width="2" height="2" rx="0.5"/><rect x="18" y="18" width="3" height="3" rx="0.5"/>
          </svg>
        </button>
      </div>

      {showQr && beamIdentity && (
        <div className={styles.qrCard}>
          <div className={styles.qrLabel}>Scan to add as friend</div>
          <div className={styles.qrWrap}>
            <QRCodeSVG value={beamIdentity} size={160} bgColor="#ffffff" fgColor="#111111" level="M" />
          </div>
          <div className={styles.qrBeam}>{beamIdentity}</div>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Beam Identity</label>
        <div className={styles.inputReadonly}>{beamIdentity}</div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Display Name <span className={styles.fieldHint}>(max 12 chars)</span></label>
        <input
          className={styles.input}
          value={displayName}
          maxLength={12}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="Your display name"
          autoComplete="off"
        />
        <div className={styles.charCount}>{displayName.length}/12</div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>
          Email
          {info?.email && <span className={styles.fieldHint}> (verified)</span>}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setEmailPinStep(false); }}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={emailPinStep}
          />
          <button
            className={styles.saveBtn}
            onClick={handleSendEmailPin}
            disabled={emailSending || emailPinStep}
            style={{ whiteSpace: 'nowrap', margin: 0 }}
          >
            {emailSending ? 'Sending…' : 'Send Code'}
          </button>
        </div>
      </div>

      {emailPinStep && (
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Verification Code</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={emailPin}
              onChange={e => setEmailPin(e.target.value.replace(/\D/g, ''))}
              autoComplete="one-time-code"
              autoFocus
              style={{ letterSpacing: '0.25em', textAlign: 'center', fontSize: 18 }}
            />
            <button
              className={styles.saveBtn}
              onClick={handleVerifyEmailPin}
              disabled={emailPinVerifying}
              style={{ whiteSpace: 'nowrap', margin: 0 }}
            >
              {emailPinVerifying ? 'Verifying…' : 'Verify'}
            </button>
          </div>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}
            onClick={handleSendEmailPin}
          >
            Resend code
          </button>
        </div>
      )}

      {emailStatus && (
        <div className={`${styles.feedback} ${emailStatus.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {emailStatus.msg}
        </div>
      )}

      {saveStatus && (
        <div className={`${styles.feedback} ${saveStatus.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {saveStatus.msg}
        </div>
      )}

      <button
        className={styles.saveBtn}
        onClick={handleSave}
        disabled={saving || !displayName.trim()}
      >
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

// ── Security tab ───────────────────────────────────────────────────────────────

function SecurityTab() {
  // ── Change password ─────────────────────────────────────────────────────────
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // ── TOTP / 2FA ──────────────────────────────────────────────────────────────
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpEnabling, setTotpEnabling] = useState(false);
  const [totpStatus, setTotpStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [totpDisablePassword, setTotpDisablePassword] = useState('');
  const [showTotpDisable, setShowTotpDisable] = useState(false);
  const [totpDisabling, setTotpDisabling] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // ── Recovery codes ──────────────────────────────────────────────────────────
  const [recoveryStatus, setRecoveryStatus] = useState<{ enabled: boolean; remaining: number } | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [showRecoveryGenerate, setShowRecoveryGenerate] = useState(false);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [recoveryActionStatus, setRecoveryActionStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    getAccountInfo().then(info => {
      if (info) {
        setTotpEnabled(info.auth_methods?.includes('totp') ?? false);
      }
    });
    getRecoveryCodesStatus().then(setRecoveryStatus);
  }, []);

  async function handleSubmit() {
    if (!current || !next || !confirm) {
      setStatus({ ok: false, msg: 'Please fill in all fields.' });
      return;
    }
    if (next !== confirm) {
      setStatus({ ok: false, msg: 'New passwords do not match.' });
      return;
    }
    if (next.length < 8) {
      setStatus({ ok: false, msg: 'New password must be at least 8 characters.' });
      return;
    }
    setSubmitting(true);
    setStatus(null);
    const result = await updatePassword(current, next);
    setSubmitting(false);
    if (result.ok) {
      setStatus({ ok: true, msg: 'Password updated successfully.' });
      setCurrent('');
      setNext('');
      setConfirm('');
    } else {
      setStatus({ ok: false, msg: result.error || 'Failed to update password.' });
    }
  }

  async function handleTotpSetup() {
    setTotpStatus(null);
    const result = await setupTotp();
    if (result.ok && result.secret && result.otpauth_url) {
      setTotpSetupData({ secret: result.secret, otpauth_url: result.otpauth_url });
      setTotpCode('');
    } else {
      setTotpStatus({ ok: false, msg: result.error || 'Setup failed.' });
    }
  }

  async function handleTotpEnable() {
    if (!totpCode.trim()) return;
    setTotpEnabling(true);
    setTotpStatus(null);
    const result = await enableTotp(totpCode.trim());
    setTotpEnabling(false);
    if (result.ok) {
      setTotpEnabled(true);
      setTotpSetupData(null);
      setTotpCode('');
      setTotpStatus({ ok: true, msg: '2FA enabled successfully.' });
    } else {
      setTotpStatus({ ok: false, msg: result.error || 'Invalid code. Try again.' });
    }
  }

  async function handleTotpDisable() {
    if (!totpDisablePassword) return;
    setTotpDisabling(true);
    setTotpStatus(null);
    const result = await disableTotp(totpDisablePassword);
    setTotpDisabling(false);
    if (result.ok) {
      setTotpEnabled(false);
      setShowTotpDisable(false);
      setTotpDisablePassword('');
      setTotpStatus({ ok: true, msg: '2FA disabled.' });
      setRecoveryStatus({ enabled: false, remaining: 0 });
    } else {
      setTotpStatus({ ok: false, msg: result.error || 'Failed to disable 2FA.' });
    }
  }

  async function handleGenerateCodes() {
    if (!recoveryPassword) return;
    setGeneratingCodes(true);
    setRecoveryActionStatus(null);
    const result = await generateRecoveryCodes(recoveryPassword);
    setGeneratingCodes(false);
    if (result.ok && result.codes) {
      setNewCodes(result.codes);
      setRecoveryPassword('');
      setShowRecoveryGenerate(false);
      setRecoveryStatus({ enabled: true, remaining: result.codes.length });
    } else {
      setRecoveryActionStatus({ ok: false, msg: result.error || 'Failed to generate codes.' });
    }
  }

  function copySecret() {
    if (totpSetupData?.secret) {
      navigator.clipboard.writeText(totpSetupData.secret).catch(() => {});
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  }

  function copyAllCodes() {
    if (newCodes) {
      navigator.clipboard.writeText(newCodes.join('\n')).catch(() => {});
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    }
  }

  return (
    <div className={styles.tabContent}>

      {/* ── Change Password ─────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle}>Change Password</div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Current Password</label>
        <input
          className={styles.input}
          type="password"
          value={current}
          onChange={e => setCurrent(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>New Password</label>
        <input
          className={styles.input}
          type="password"
          value={next}
          onChange={e => setNext(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Confirm New Password</label>
        <input
          className={styles.input}
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
      </div>

      {status && (
        <div className={`${styles.feedback} ${status.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {status.msg}
        </div>
      )}

      <button
        className={styles.saveBtn}
        onClick={handleSubmit}
        disabled={submitting}
      >
        {submitting ? 'Updating…' : 'Update Password'}
      </button>

      {/* ── Two-Factor Authentication ────────────────────────────────────────── */}
      <div className={styles.sectionTitle} style={{ marginTop: 28 }}>Two-Factor Authentication (2FA)</div>

      <div className={styles.twoFaStatus}>
        <span className={`${styles.twoFaBadge} ${totpEnabled ? styles.twoFaBadgeActive : styles.twoFaBadgeInactive}`}>
          {totpEnabled ? 'Active' : 'Inactive'}
        </span>
        {totpEnabled ? (
          <button
            className={styles.saveBtn}
            style={{ marginLeft: 'auto' }}
            onClick={() => { setShowTotpDisable(v => !v); setTotpStatus(null); }}
          >
            Disable 2FA
          </button>
        ) : (
          !totpSetupData && (
            <button
              className={styles.saveBtn}
              style={{ marginLeft: 'auto' }}
              onClick={handleTotpSetup}
            >
              Set Up Authenticator App
            </button>
          )
        )}
      </div>

      {totpStatus && (
        <div className={`${styles.feedback} ${totpStatus.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {totpStatus.msg}
        </div>
      )}

      {totpSetupData && !totpEnabled && (
        <div className={styles.twoFaSetupBox}>
          <div className={styles.qrCenter}>
            <QRCodeSVG value={totpSetupData.otpauth_url} size={160} bgColor="#ffffff" fgColor="#111111" level="M" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Secret Key (enter manually if needed)</label>
            <div className={styles.secretMono}>
              <span>{totpSetupData.secret}</span>
              <button className={styles.saveBtn} style={{ marginLeft: 8, padding: '4px 10px', fontSize: 11 }} onClick={copySecret}>
                {copiedSecret ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Enter 6-digit code from your app to verify</label>
            <input
              className={styles.input}
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
              onKeyDown={e => e.key === 'Enter' && handleTotpEnable()}
            />
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleTotpEnable}
            disabled={totpEnabling || totpCode.length < 6}
          >
            {totpEnabling ? 'Verifying…' : 'Enable 2FA'}
          </button>
        </div>
      )}

      {showTotpDisable && totpEnabled && (
        <div className={styles.twoFaSetupBox}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Confirm your password to disable 2FA</label>
            <input
              className={styles.input}
              type="password"
              value={totpDisablePassword}
              onChange={e => setTotpDisablePassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={e => e.key === 'Enter' && handleTotpDisable()}
            />
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleTotpDisable}
            disabled={totpDisabling || !totpDisablePassword}
          >
            {totpDisabling ? 'Disabling…' : 'Confirm Disable 2FA'}
          </button>
        </div>
      )}

      {/* ── Recovery Codes ───────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle} style={{ marginTop: 28 }}>Recovery Codes</div>

      {recoveryStatus && (
        <div className={styles.twoFaStatus}>
          <span className={`${styles.twoFaBadge} ${recoveryStatus.enabled ? styles.twoFaBadgeActive : styles.twoFaBadgeInactive}`}>
            {recoveryStatus.enabled ? `${recoveryStatus.remaining} remaining` : 'None generated'}
          </span>
          <button
            className={styles.saveBtn}
            style={{ marginLeft: 'auto' }}
            onClick={() => { setShowRecoveryGenerate(v => !v); setNewCodes(null); setRecoveryActionStatus(null); }}
          >
            Generate New Codes
          </button>
        </div>
      )}

      {recoveryActionStatus && (
        <div className={`${styles.feedback} ${recoveryActionStatus.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {recoveryActionStatus.msg}
        </div>
      )}

      {showRecoveryGenerate && !newCodes && (
        <div className={styles.twoFaSetupBox}>
          <div className={styles.recoveryWarn}>
            Generating new codes will invalidate any existing codes. Store them somewhere safe.
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Confirm your password</label>
            <input
              className={styles.input}
              type="password"
              value={recoveryPassword}
              onChange={e => setRecoveryPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={e => e.key === 'Enter' && handleGenerateCodes()}
            />
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleGenerateCodes}
            disabled={generatingCodes || !recoveryPassword}
          >
            {generatingCodes ? 'Generating…' : 'Generate 8 Recovery Codes'}
          </button>
        </div>
      )}

      {newCodes && (
        <div className={styles.twoFaSetupBox}>
          <div className={styles.recoveryWarn}>
            Save these codes now — they will not be shown again.
          </div>
          <div className={styles.recoveryCodesGrid}>
            {newCodes.map(code => (
              <div key={code} className={styles.recoveryCodePill}>{code}</div>
            ))}
          </div>
          <button
            className={styles.saveBtn}
            style={{ marginTop: 10 }}
            onClick={copyAllCodes}
          >
            {copiedCodes ? 'Copied!' : 'Copy All Codes'}
          </button>
        </div>
      )}

      {/* ── Passkeys ─────────────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle} style={{ marginTop: 28 }}>Passkeys</div>

      <div className={styles.passkeyCard}>
        <div className={styles.twoFaStatus}>
          <span className={styles.comingSoonBadge}>Coming Soon</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 12px' }}>
          Sign in without a password using your device's biometrics or a hardware security key.
        </p>
        <button className={styles.saveBtn} disabled>
          Add Passkey
        </button>
      </div>

      {/* ── QR Code Login ────────────────────────────────────────────────────── */}
      <div className={styles.sectionTitle} style={{ marginTop: 28 }}>QR Code Login</div>

      <div className={styles.passkeyCard}>
        <div className={styles.twoFaStatus}>
          <span className={styles.comingSoonBadge}>Coming Soon</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 12px' }}>
          Scan a QR code with your mobile device to instantly log in on this device — no password needed.
        </p>
        <button className={styles.saveBtn} disabled>
          Show QR Code
        </button>
      </div>

    </div>
  );
}

// ── Friends tab ────────────────────────────────────────────────────────────────

function FriendsTab({ onDm }: { onDm?: (beam: string) => void }) {
  const [friends, setFriends] = useState<ApiFriend[]>([]);
  const [requests, setRequests] = useState<ApiFriendRequest[]>([]);
  const [addValue, setAddValue] = useState('');
  const [addStatus, setAddStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [fr, rq] = await Promise.all([fetchFriends(), fetchFriendRequests()]);
    setFriends(fr);
    setRequests(rq);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAddFriend() {
    const beam = addValue.trim();
    if (!beam) return;
    setAddLoading(true);
    setAddStatus(null);
    const result = await sendFriendRequest(beam);
    setAddLoading(false);
    if (result.ok) {
      setAddStatus({ ok: true, msg: 'Friend request sent!' });
      setAddValue('');
    } else {
      setAddStatus({ ok: false, msg: result.error || 'Failed to send request.' });
    }
  }

  async function handleRemove(id: string | number, beam: string) {
    setRemoving(beam);
    await removeFriend(id);
    setRemoving(null);
    load();
  }

  async function handleAccept(id: string | number) {
    setAccepting(String(id));
    await acceptFriendRequest(id);
    setAccepting(null);
    load();
  }

  const incoming = requests.filter(r => r.direction === 'incoming' || !r.direction);

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Add Friend</div>
      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="beam_identity»example"
          value={addValue}
          onChange={e => setAddValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddFriend()}
          spellCheck={false}
          autoComplete="off"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        />
        <button
          className={styles.addBtn}
          onClick={handleAddFriend}
          disabled={addLoading || !addValue.trim()}
        >
          {addLoading ? '…' : 'Send'}
        </button>
      </div>
      {addStatus && (
        <div className={`${styles.feedback} ${addStatus.ok ? styles.feedbackOk : styles.feedbackErr}`}>
          {addStatus.msg}
        </div>
      )}

      {incoming.length > 0 && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 20 }}>
            Pending Requests
            <span className={styles.countBadge}>{incoming.length}</span>
          </div>
          {incoming.map(req => {
            const name = req.display_name || req.from_beam || req.beam_identity || 'Unknown';
            return (
              <div key={String(req.id)} className={styles.listRow}>
                <Avatar name={name} size={34} />
                <div className={styles.listInfo}>
                  <div className={styles.listName}>{name}</div>
                  <div className={styles.listSub}>Wants to be friends</div>
                </div>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnAccept}`}
                  disabled={accepting === String(req.id)}
                  onClick={() => handleAccept(req.id)}
                >
                  {accepting === String(req.id) ? '…' : 'Accept'}
                </button>
              </div>
            );
          })}
        </>
      )}

      <div className={styles.sectionTitle} style={{ marginTop: 20 }}>
        Friends
        <span className={styles.countBadge}>{friends.length}</span>
      </div>

      {friends.length === 0 && (
        <div className={styles.emptyMsg}>No friends yet.</div>
      )}

      {friends.map(f => {
        const name = f.display_name || f.beam_identity;
        const avatarId = f.avatar_attachment_id != null ? String(f.avatar_attachment_id) : undefined;
        return (
          <div key={f.beam_identity} className={styles.listRow}>
            <div className={styles.listAvatarWrap}>
              <Avatar name={name} avatarId={avatarId} size={34} />
              <div className={`${styles.statusDot} ${f.status === 'online' ? styles.dotOnline : styles.dotOffline}`} />
            </div>
            <div className={styles.listInfo}>
              <div className={styles.listName}>{name}</div>
              {f.beam_identity !== name && (
                <div className={styles.listSub}>{f.beam_identity}</div>
              )}
            </div>
            {onDm && (
              <button
                className={styles.actionBtn}
                title="Send DM"
                onClick={() => { onDm(f.beam_identity); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            )}
            <button
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              title="Remove friend"
              disabled={removing === f.beam_identity}
              onClick={() => handleRemove(f.id, f.beam_identity)}
            >
              {removing === f.beam_identity ? '…' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="22" y1="18" x2="16" y2="18"/>
                </svg>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Servers tab ────────────────────────────────────────────────────────────────

function ServersTab({ onSwitchServer }: { onSwitchServer?: (url: string, name: string) => void }) {
  const [servers, setServers] = useState<ApiServer[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeStatus, setRemoveStatus] = useState<{ url: string; ok: boolean; msg: string } | null>(null);

  const load = useCallback(() => {
    fetchServers().then(setServers);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRemove(url: string) {
    setRemoving(url);
    setRemoveStatus(null);
    const result = await removeServer(url);
    setRemoving(null);
    if (result.ok) {
      load();
    } else {
      setRemoveStatus({ url, ok: false, msg: result.error || 'Failed to remove server.' });
    }
  }

  function formatJoinDate(ts?: string): string {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return ts;
    }
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>
        Your Servers
        <span className={styles.countBadge}>{servers.length}</span>
      </div>

      {servers.length === 0 && (
        <div className={styles.emptyMsg}>No servers joined yet.</div>
      )}

      {servers.map(srv => (
        <div key={srv.server_url} className={styles.serverRow}>
          <div className={styles.serverIcon}>
            {(srv.server_name ?? 'S').slice(0, 2).toUpperCase()}
          </div>
          <div className={styles.listInfo}>
            <div className={styles.listName}>{srv.server_name ?? srv.server_url}</div>
            <div className={styles.listSub}>{srv.server_url}</div>
            {srv.joined_at && (
              <div className={styles.listSub2}>Joined {formatJoinDate(srv.joined_at)}</div>
            )}
          </div>
          <div className={styles.serverActions}>
            {removeStatus?.url === srv.server_url && !removeStatus.ok && (
              <span className={styles.removeErr}>{removeStatus.msg}</span>
            )}
            {onSwitchServer && (
              <button
                className={`${styles.actionBtn} ${styles.actionBtnAccept}`}
                title="Switch to server"
                onClick={() => onSwitchServer(srv.server_url, srv.server_name ?? srv.server_url)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"/>
                  <path d="M21 3L9 15"/>
                  <polyline points="9 3 3 3 3 21 21 21 21 15"/>
                </svg>
              </button>
            )}
            <button
              className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
              title="Leave server"
              disabled={removing === srv.server_url}
              onClick={() => handleRemove(srv.server_url)}
            >
              {removing === srv.server_url ? '…' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sub-accounts tab ───────────────────────────────────────────────────────────

const SA_TYPE_LABELS: Record<string, string> = { alt: 'Alt', child: 'Child', bot: 'Bot', streamer: 'Streamer' };
const SA_TYPE_COLORS: Record<string, string> = { Child: 'var(--accent)', Alt: 'var(--green)', Bot: 'var(--gold)', Streamer: 'var(--purple)' };

type SaEntry = ApiSubAccount & { typeLabel: string };

const DEFAULT_PC: ParentalControls = { can_join_servers: true, can_leave_servers: true, can_dm: true };

function SubAccountRow({ acc, onRefresh }: { acc: SaEntry; onRefresh: () => void }) {
  const isBot = acc.typeLabel === 'Bot';
  const isChild = acc.typeLabel === 'Child';
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwFeedback, setPwFeedback] = useState('');
  const [botToken, setBotToken] = useState(acc.bot_token ?? '');
  const [pc, setPc] = useState<ParentalControls>(acc.parental_controls ?? DEFAULT_PC);

  async function handlePcToggle(key: keyof ParentalControls) {
    const updated = { ...pc, [key]: !pc[key] };
    setPc(updated);
    const r = await setChildParentalControls(acc.id, updated);
    if (!r.ok) { setPc(pc); alert(r.error ?? 'Failed to update parental controls'); }
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    const r = await fn();
    setBusy(null);
    if (r.ok) onRefresh(); else alert(r.error ?? `Failed: ${label}`);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${acc.display_name}"? This cannot be undone.`)) return;
    await run('delete', () => deleteSubAccount(acc.id));
  }

  async function handleLock() {
    if (!confirm(`Lock "${acc.display_name}"?`)) return;
    await run('lock', () => lockSubAccount(acc.id));
  }

  async function handleUnlock() {
    if (!confirm(`Unlock "${acc.display_name}"?`)) return;
    await run('unlock', () => unlockSubAccount(acc.id));
  }

  async function handleSetPw() {
    if (newPw.length < 8) { setPwFeedback('Min 8 characters.'); return; }
    setBusy('pw');
    const r = await setSubAccountPassword(acc.id, newPw);
    setBusy(null);
    if (r.ok) { setNewPw(''); setPwFeedback('Password updated!'); }
    else setPwFeedback(r.error ?? 'Failed.');
  }

  async function handleRegenKey() {
    if (!confirm(`Regenerate API key for "${acc.display_name}"?\nThe old key will stop working immediately.`)) return;
    setBusy('regen');
    const r = await regenBotKey(acc.id);
    setBusy(null);
    if (r.ok) {
      if (r.new_token) setBotToken(r.new_token);
      else onRefresh();
    } else alert(r.error ?? 'Failed.');
  }

  return (
    <div className={styles.saCard}>
      <div className={styles.saCardRow}>
        <Avatar name={acc.display_name || acc.beam_identity} size={34} />
        <div className={styles.listInfo}>
          <div className={styles.listName}>
            {acc.display_name || acc.beam_identity}
            {acc.locked && <span className={styles.lockedTag}>locked</span>}
          </div>
          <div className={styles.listSub}>{acc.beam_identity}</div>
        </div>
        <span className={styles.badge} style={{
          color: SA_TYPE_COLORS[acc.typeLabel] ?? 'var(--text-2)',
          background: 'rgba(99,102,241,0.08)',
          border: '1px solid rgba(99,102,241,0.15)',
        }}>{acc.typeLabel}</span>

        {/* Quick actions */}
        <div className={styles.saQuickBtns}>
          <button
            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
            title="Delete"
            disabled={!!busy}
            onClick={handleDelete}
          >
            {busy === 'delete' ? '…' : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            )}
          </button>
          <button
            className={styles.actionBtn}
            title={expanded ? 'Collapse' : 'Manage'}
            onClick={() => setExpanded(v => !v)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.saManagePanel}>
          {isBot ? (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Bot Token</label>
                <div className={styles.saTokenRow}>
                  <input
                    className={styles.input}
                    readOnly
                    value={botToken || '(not available — regen to reveal)'}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                  />
                  <button
                    className={styles.actionBtn}
                    title="Copy token"
                    onClick={() => navigator.clipboard.writeText(botToken)}
                    disabled={!botToken}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>
              </div>
              <button
                className={`${styles.saManageBtn} ${styles.saManageBtnWarn}`}
                disabled={!!busy}
                onClick={handleRegenKey}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                {busy === 'regen' ? 'Regenerating…' : 'Regenerate Key'}
              </button>
            </>
          ) : (
            <>
              {/* Lock / Unlock */}
              <div className={styles.saManageBtnRow}>
                {acc.locked ? (
                  <button className={`${styles.saManageBtn} ${styles.saManageBtnOk}`} disabled={!!busy} onClick={handleUnlock}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                    </svg>
                    {busy === 'unlock' ? 'Unlocking…' : 'Unlock Account'}
                  </button>
                ) : (
                  <button className={styles.saManageBtn} disabled={!!busy} onClick={handleLock}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    {busy === 'lock' ? 'Locking…' : 'Lock Account'}
                  </button>
                )}
              </div>

              {/* Change password */}
              <div className={styles.fieldGroup} style={{ marginTop: 10 }}>
                <label className={styles.fieldLabel}>Change Password</label>
                <div className={styles.saTokenRow}>
                  <input
                    className={styles.input}
                    type="password"
                    value={newPw}
                    onChange={e => { setNewPw(e.target.value); setPwFeedback(''); }}
                    placeholder="New password (min 8)"
                    autoComplete="new-password"
                    style={{ flex: 1 }}
                  />
                  <button
                    className={styles.saManageBtn}
                    disabled={!!busy || newPw.length < 8}
                    onClick={handleSetPw}
                    style={{ flexShrink: 0 }}
                  >
                    {busy === 'pw' ? '…' : 'Set'}
                  </button>
                </div>
                {pwFeedback && (
                  <div className={`${styles.feedback} ${pwFeedback.includes('!') ? styles.feedbackOk : styles.feedbackErr}`} style={{ marginTop: 4 }}>
                    {pwFeedback}
                  </div>
                )}
              </div>

              {/* Parental controls (child accounts only) */}
              {isChild && (
                <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                  <label className={styles.fieldLabel}>Parental Controls</label>
                  {(
                    [
                      { key: 'can_join_servers', label: 'Can join servers' },
                      { key: 'can_leave_servers', label: 'Can leave servers' },
                      { key: 'can_dm', label: 'Can send DMs' },
                    ] as { key: keyof ParentalControls; label: string }[]
                  ).map(({ key, label }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
                      <button
                        className={pc[key] ? styles.saManageBtnOk : styles.saManageBtn}
                        style={{ minWidth: 60, fontSize: 12 }}
                        onClick={() => handlePcToggle(key)}
                      >
                        {pc[key] ? 'Allowed' : 'Blocked'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SubaccountsTab() {
  const [subAccounts, setSubAccounts] = useState<SaEntry[]>([]);
  const [type, setType] = useState<'alt' | 'child' | 'bot' | 'streamer'>('alt');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const needsPassword = type !== 'bot';
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    const info = await getAccountInfo();
    if (!info) return;
    setSubAccounts([
      ...(info.children ?? []).map(a => ({ ...a, typeLabel: 'Child' })),
      ...(info.alts ?? []).map(a => ({ ...a, typeLabel: 'Alt' })),
      ...(info.bots ?? []).map(a => ({ ...a, typeLabel: 'Bot' })),
      ...(info.streamers ?? []).map(a => ({ ...a, typeLabel: 'Streamer' })),
    ]);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!name.trim()) { setStatus({ ok: false, msg: 'Display name required.' }); return; }
    if (needsPassword && password.length < 8) { setStatus({ ok: false, msg: 'Password must be at least 8 characters.' }); return; }
    setCreating(true);
    setStatus(null);
    const result = await createSubAccount(name.trim(), type, needsPassword ? password : undefined);
    setCreating(false);
    if (result.ok) {
      setStatus({ ok: true, msg: `${SA_TYPE_LABELS[type]} account created!` });
      setName(''); setPassword(''); load();
    } else {
      setStatus({ ok: false, msg: (result as { error?: string }).error || 'Failed to create.' });
    }
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Create Subaccount</div>

      <div className={styles.saTypeGroup} style={{ marginBottom: 8 }}>
        {(['alt', 'child', 'bot', 'streamer'] as const).map(t => (
          <button key={t}
            className={`${styles.saTypePill} ${type === t ? styles.saTypePillActive : ''}`}
            onClick={() => { setType(t); setPassword(''); }}
          >
            {SA_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className={styles.saFormRow}>
        <input className={styles.input} value={name} onChange={e => setName(e.target.value)}
          placeholder="Display name (max 12)" maxLength={12} autoComplete="off" style={{ flex: 1 }} />
        <button className={styles.addBtn} onClick={handleCreate}
          disabled={creating || !name.trim() || (needsPassword && password.length < 8)}>
          {creating ? '…' : 'Create'}
        </button>
      </div>

      {needsPassword && (
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel}>Password <span className={styles.fieldHint}>(required · min 8 chars)</span></label>
          <input className={styles.input} type="password" value={password}
            onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
        </div>
      )}

      {status && (
        <div className={`${styles.feedback} ${status.ok ? styles.feedbackOk : styles.feedbackErr}`}>{status.msg}</div>
      )}

      <div className={styles.sectionTitle}>
        Your Subaccounts <span className={styles.countBadge}>{subAccounts.length}</span>
      </div>

      {subAccounts.length === 0 && <div className={styles.emptyMsg}>No subaccounts yet.</div>}
      {subAccounts.map(acc => <SubAccountRow key={acc.id} acc={acc} onRefresh={load} />)}
    </div>
  );
}

// ── Premium tab ────────────────────────────────────────────────────────────────

// freeVal / premiumVal: a string value, 'check', 'included', or null (= X mark)
const PREMIUM_PERKS: { label: string; freeVal: string | 'check' | 'included' | null; premiumVal: string | 'check' | 'included' | null; tooltip?: string }[] = [
  { label: 'Join server',                        freeVal: '100',       premiumVal: '200'      },
  { label: 'Zeeble cloud servers (create)',      freeVal: '10',       premiumVal: '30'       },
  { label: 'Sub-accounts',                       freeVal: '10',       premiumVal: '20'       },
  { label: 'Message search',                     freeVal: 'included', premiumVal: 'included' },
  { label: 'Custom beam tag',                    freeVal: null,       premiumVal: 'check'    },
  { label: 'Profile banner & animated avatar',   freeVal: null,       premiumVal: 'check'    },
  {
    label:      'Monthly boosts',
    freeVal:    null,
    premiumVal: '5',
    tooltip:    'Boosts unlock extra emoji & sticker slots and make them globally available across Zeeble. On cloud servers, they also expand the server\'s total limits. On self-hosted servers, they make your emojis & stickers global.',
  },
];

// ── PromoTab ──────────────────────────────────────────────────────────────────

function PromoTab() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleRedeem() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setStatus(null);
    const result = await redeemPromoCode(trimmed);
    setLoading(false);
    setStatus({ ok: result.ok, msg: result.ok ? (result.message ?? 'Promo code redeemed!') : (result.error ?? 'Failed to redeem code.') });
    if (result.ok) setCode('');
  }

  return (
    <div className={styles.tabContent}>
      <p className={styles.sectionTitle}>Redeem Promo Code</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label className={styles.fieldLabel}>Promo Code</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.input}
            placeholder="Enter your code"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !loading && handleRedeem()}
            maxLength={32}
            spellCheck={false}
          />
          <button
            className={styles.saveBtn}
            onClick={handleRedeem}
            disabled={loading || !code.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            {loading ? 'Redeeming…' : 'Redeem'}
          </button>
        </div>
        {status && (
          <p style={{ fontSize: 13, color: status.ok ? 'var(--green, #4ade80)' : 'var(--red, #f87171)', margin: 0 }}>
            {status.msg}
          </p>
        )}
      </div>
    </div>
  );
}

// ── PremiumTab ────────────────────────────────────────────────────────────────

type PayStep = 'plans' | 'card' | 'success';

function PremiumTab() {
  const [info, setInfo] = useState<ApiAccountInfo | null>(null);
  const [step, setStep] = useState<PayStep>('plans');
  const [clientSecret, setClientSecret] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [loadingSubscribe, setLoadingSubscribe] = useState(false);
  const [loadingPay, setLoadingPay] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [stripeObj, setStripeObj] = useState<Stripe | null>(null);
  const [cardElement, setCardElement] = useState<StripeCardElement | null>(null);

  useEffect(() => { getAccountInfo().then(setInfo); }, []);

  const isPremium = info?.premium === true;

  // Mount the Stripe card element when the card step is shown
  useEffect(() => {
    if (step !== 'card') return;
    let card: StripeCardElement | null = null;

    stripePromise.then(s => {
      if (!s || !cardRef.current) return;
      const elements = s.elements();
      card = elements.create('card', {
        style: {
          base: {
            color: '#ffffff',
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            fontSize: '14px',
            '::placeholder': { color: 'rgba(255,255,255,0.35)' },
            iconColor: 'rgba(255,255,255,0.5)',
          },
          invalid: { color: '#f87171', iconColor: '#f87171' },
        },
      });
      card.mount(cardRef.current!);
      setStripeObj(s);
      setCardElement(card);
    });

    return () => {
      card?.destroy();
      setCardElement(null);
      setStripeObj(null);
    };
  }, [step]);

  async function handleGetPremium() {
    setLoadingSubscribe(true);
    setSubscribeError(null);
    const result = await createSubscription();
    setLoadingSubscribe(false);
    if (!result.ok) {
      setSubscribeError(result.error ?? 'Something went wrong');
      return;
    }
    setClientSecret(result.clientSecret!);
    setInvoiceId(result.invoiceId!);
    setCardError(null);
    setStep('card');
  }

  async function handlePay() {
    if (!stripeObj || !cardElement) return;
    setLoadingPay(true);
    setCardError(null);

    // Step 1: Confirm the SetupIntent — saves the card securely via Stripe
    const { setupIntent, error } = await stripeObj.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });

    if (error) {
      setCardError(error.message ?? 'Card declined');
      setLoadingPay(false);
      return;
    }

    const paymentMethodId = typeof setupIntent?.payment_method === 'string'
      ? setupIntent.payment_method
      : (setupIntent?.payment_method as { id?: string })?.id ?? '';

    if (!paymentMethodId) {
      setCardError('Failed to save payment method');
      setLoadingPay(false);
      return;
    }

    // Step 2: Charge the first invoice using the saved payment method
    const result = await confirmSubscriptionPayment(invoiceId, paymentMethodId);

    if (!result.ok) {
      setCardError(result.error ?? 'Payment failed');
      setLoadingPay(false);
      return;
    }

    // Step 3: Handle 3D Secure if the card requires it
    if (result.requiresAction && result.clientSecret) {
      const { error: actionError } = await stripeObj.handleCardAction(result.clientSecret);
      if (actionError) {
        setCardError(actionError.message ?? '3D Secure verification failed');
        setLoadingPay(false);
        return;
      }
    }

    setLoadingPay(false);
    setStep('success');
    getAccountInfo().then(setInfo);
  }

  function PerkCell({ val, isPremiumCol }: { val: string | null; isPremiumCol: boolean }) {
    if (val === null) {
      return (
        <span className={styles.perkX}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </span>
      );
    }
    if (val === 'check') {
      return (
        <span className={isPremiumCol ? styles.perkCheckPremium : styles.perkCheckFree}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
      );
    }
    if (val === 'included') {
      return (
        <span className={isPremiumCol ? styles.perkIncludedPremium : styles.perkIncludedFree}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 4 }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Included
        </span>
      );
    }
    if (val === 'priority') {
      return (
        <span className={styles.perkPriority}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 3 }}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
          Priority
        </span>
      );
    }
    return <span className={isPremiumCol ? styles.perkNumPremium : styles.perkNumFree}>{val}</span>;
  }

  const perksList = (
    <div className={styles.perksList}>
      <div className={styles.perkHeader}>
        <span className={styles.perkHeaderLabel} />
        <span className={styles.perkHeaderFree}>Free</span>
        <span className={styles.perkHeaderPremium}>Premium</span>
      </div>
      {PREMIUM_PERKS.map(p => (
        <div key={p.label} className={styles.perkRow}>
          <span className={styles.perkLabel}>
            {p.label}
            {p.tooltip && (
              <span className={styles.perkTooltipWrap}>
                <svg className={styles.perkInfoIcon} width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" opacity="0.15"/>
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.8"/>
                  <line x1="12" y1="11" x2="12" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="7.5" r="1.1"/>
                </svg>
                <span className={styles.perkTooltip}>{p.tooltip}</span>
              </span>
            )}
          </span>
          <span className={styles.perkColFree}><PerkCell val={p.freeVal} isPremiumCol={false} /></span>
          <span className={styles.perkColPremium}><PerkCell val={p.premiumVal} isPremiumCol={true} /></span>
        </div>
      ))}
    </div>
  );

  const isActive = isPremium || step === 'success';

  const banner = (
    <div className={`${styles.premiumBanner} ${isActive ? styles.premiumBannerActive : ''}`}>
      <div className={styles.premiumBannerIcon}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </div>
      <div className={styles.premiumBannerText}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={styles.premiumBannerTitle}>
            {isActive ? 'Zeeble Premium' : 'Upgrade to Premium'}
          </div>
          {isActive && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              background: 'rgba(74, 222, 128, 0.18)',
              color: '#4ade80',
              border: '1px solid rgba(74, 222, 128, 0.35)',
              borderRadius: 4,
              padding: '2px 7px',
            }}>Active</span>
          )}
        </div>
        <div className={styles.premiumBannerSub}>
          {isActive
            ? 'You have an active Premium subscription.'
            : 'Unlock exclusive features and support Zeeble.'}
        </div>
      </div>
    </div>
  );

  return (
    <div className={styles.tabContent}>
      {banner}

      {/* ── Already premium ── */}
      {isPremium ? (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 4 }}>Your benefits</div>
          {perksList}
        </>

      /* ── Success screen after payment ── */
      ) : step === 'success' ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Welcome to Zeeble Premium!</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 13 }}>
            Your subscription is active. Enjoy all Premium features.
          </div>
        </div>

      /* ── Card payment form ── */
      ) : step === 'card' ? (
        <div className={styles.stripeWrap}>
          <div className={styles.sectionTitle} style={{ marginBottom: 12 }}>Payment details</div>
          <div className={styles.stripeForm}>
            <div ref={cardRef} className={styles.cardElement} />
            {cardError && <div className={styles.errorMsg}>{cardError}</div>}
            <button
              className={styles.premiumUpgradeBtn}
              onClick={handlePay}
              disabled={loadingPay || !cardElement}
            >
              {loadingPay ? 'Processing…' : '✦ Pay $4.99/mo'}
            </button>
            <button
              className={styles.ghostBtn}
              onClick={() => setStep('plans')}
              style={{ marginTop: 8, width: '100%' }}
              disabled={loadingPay}
            >
              ← Back
            </button>
          </div>
        </div>

      /* ── Plans / upgrade prompt ── */
      ) : (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 20 }}>What you get</div>
          {perksList}
          {subscribeError && <div className={styles.errorMsg}>{subscribeError}</div>}
          <button
            className={styles.premiumUpgradeBtn}
            onClick={handleGetPremium}
            disabled={loadingSubscribe}
          >
            {loadingSubscribe ? 'Preparing checkout…' : '✦ Get Zeeble Premium — $4.99/mo'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Appearance tab ──────────────────────────────────────────────────────────────

const ACCENT_COLORS = [
  { name: 'Indigo',  value: '#6366f1', hover: '#4f46e5' },
  { name: 'Purple',  value: '#8b5cf6', hover: '#7c3aed' },
  { name: 'Cyan',    value: '#06b6d4', hover: '#0891b2' },
  { name: 'Green',   value: '#10b981', hover: '#059669' },
  { name: 'Pink',    value: '#ec4899', hover: '#db2777' },
  { name: 'Orange',  value: '#f59e0b', hover: '#d97706' },
  { name: 'Red',     value: '#ef4444', hover: '#dc2626' },
];

function applyAppearance(accent: string, accentH: string, fontSize: string, density: string) {
  const root = document.documentElement;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-h', accentH);
  // Build accent-glow from accent
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.25)`);

  const sizeMap: Record<string, string> = { small: '13px', normal: '14px', large: '15px' };
  root.style.setProperty('font-size', sizeMap[fontSize] ?? '14px');
  document.body.style.fontSize = sizeMap[fontSize] ?? '14px';

  if (density === 'compact') {
    root.style.setProperty('--msg-padding', '2px 0');
    root.style.setProperty('--msg-gap', '2px');
  } else {
    root.style.setProperty('--msg-padding', '6px 0');
    root.style.setProperty('--msg-gap', '4px');
  }
}

// Apply saved appearance on module load
(function initAppearance() {
  const accent = localStorage.getItem('zeeble_accent') ?? '#6366f1';
  const accentH = localStorage.getItem('zeeble_accent_h') ?? '#4f46e5';
  const fontSize = localStorage.getItem('zeeble_font_size') ?? 'normal';
  const density = localStorage.getItem('zeeble_density') ?? 'cozy';
  applyAppearance(accent, accentH, fontSize, density);
})();

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [accent, setAccent] = useState(localStorage.getItem('zeeble_accent') ?? '#6366f1');
  const [fontSize, setFontSize] = useState(localStorage.getItem('zeeble_font_size') ?? 'normal');
  const [density, setDensity] = useState(localStorage.getItem('zeeble_density') ?? 'cozy');

  function handleAccent(color: { value: string; hover: string }) {
    setAccent(color.value);
    applyAppearance(color.value, color.hover, fontSize, density);
    localStorage.setItem('zeeble_accent', color.value);
    localStorage.setItem('zeeble_accent_h', color.hover);
  }

  function handleFontSize(s: string) {
    setFontSize(s);
    const col = ACCENT_COLORS.find(c => c.value === accent) ?? ACCENT_COLORS[0];
    applyAppearance(accent, col.hover, s, density);
    localStorage.setItem('zeeble_font_size', s);
  }

  function handleDensity(d: string) {
    setDensity(d);
    const col = ACCENT_COLORS.find(c => c.value === accent) ?? ACCENT_COLORS[0];
    applyAppearance(accent, col.hover, fontSize, d);
    localStorage.setItem('zeeble_density', d);
  }

return (
  <div className={styles.tabContent}>
    {/* Theme */}
    <div className={styles.sectionTitle}>Theme</div>
    <div className={styles.appearanceGroup}>
      {(['dark', 'light', 'auto'] as Theme[]).map(t => (
        <button
          key={t}
          className={`${styles.appearancePill} ${theme === t ? styles.appearancePillActive : ''}`}
          onClick={() => setTheme(t)}
        >
          {t === 'dark' ? 'Dark' : t === 'light' ? 'Light' : 'Auto'}
        </button>
      ))}
    </div>

    {/* Accent colour */}
      <div className={styles.sectionTitle}>Accent Colour</div>
      <div className={styles.accentGrid}>
        {ACCENT_COLORS.map(c => (
          <button
            key={c.value}
            className={`${styles.accentSwatch} ${accent === c.value ? styles.accentSwatchActive : ''}`}
            style={{ background: c.value }}
            title={c.name}
            onClick={() => handleAccent(c)}
          />
        ))}
      </div>

      {/* Font size */}
      <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Font Size</div>
      <div className={styles.appearanceGroup}>
        {(['small', 'normal', 'large'] as const).map(s => (
          <button
            key={s}
            className={`${styles.appearancePill} ${fontSize === s ? styles.appearancePillActive : ''}`}
            onClick={() => handleFontSize(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Message density */}
      <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Message Density</div>
      <div className={styles.appearanceGroup}>
        {(['cozy', 'compact'] as const).map(d => (
          <button
            key={d}
            className={`${styles.appearancePill} ${density === d ? styles.appearancePillActive : ''}`}
            onClick={() => handleDensity(d)}
          >
            {d.charAt(0).toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Preview</div>
      <div className={styles.appearancePreview}>
        <div className={styles.previewMsg} style={{ padding: density === 'compact' ? '2px 0' : '6px 0' }}>
          <div className={styles.previewAvatar}>ZB</div>
          <div className={styles.previewBody}>
            <span className={styles.previewName} style={{ color: 'var(--accent)' }}>Zeeble Bot</span>
            <span className={styles.previewTime}>Today at 12:00</span>
            <div className={styles.previewText}>Welcome to Zeeble! Your accent colour is active.</div>
          </div>
        </div>
        <div className={styles.previewMsg} style={{ padding: density === 'compact' ? '2px 0' : '6px 0' }}>
          <div className={styles.previewAvatar}>ME</div>
          <div className={styles.previewBody}>
            <span className={styles.previewName} style={{ color: 'var(--accent)' }}>You</span>
            <span className={styles.previewTime}>Today at 12:01</span>
            <div className={styles.previewText}>Looks great! I love the new look.</div>
          </div>
        </div>
      </div>

    </div>
  );
}

// ── Neumorphic toggle ─────────────────────────────────────────────────────────

function NeuToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`${styles.neuToggle} ${value ? styles.neuToggleOn : ''}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
      type="button"
    >
      <span className={styles.neuToggleKnob} />
    </button>
  );
}

// ── Shared setting row ────────────────────────────────────────────────────────

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className={styles.settingRow}>
      <div className={styles.settingRowText}>
        <span className={styles.settingRowLabel}>{label}</span>
        {sub && <span className={styles.settingRowSub}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Notifications tab ─────────────────────────────────────────────────────────

function usePref(key: string, def: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useState(() => {
    const s = localStorage.getItem(key);
    return s === null ? def : s === 'true';
  });
  const set = (v: boolean) => { setVal(v); localStorage.setItem(key, String(v)); };
  return [val, set];
}

function NotificationsTab() {
  const [desktopNotifs, setDesktopNotifs] = usePref('notif_desktop', true);
  const [soundMessages, setSoundMessages] = usePref('notif_sound_msg', true);
  const [soundMentions, setSoundMentions] = usePref('notif_sound_mention', true);
  const [soundDm,       setSoundDm]       = usePref('notif_sound_dm', true);
  const [mentionBadge,  setMentionBadge]  = usePref('notif_mention_badge', true);
  const [notifDm,       setNotifDm]       = usePref('notif_dm', true);
  const [notifMention,  setNotifMention]  = usePref('notif_mention', true);
  const [notifAllMsg,   setNotifAllMsg]   = usePref('notif_all_msg', false);
  const [permState, setPermState] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (!('Notification' in window)) { setPermState('unsupported'); return; }
    setPermState(Notification.permission);
    const onFocus = () => setPermState(Notification.permission);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  async function requestPermission() {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setPermState(p);
  }

  return (
    <div className={styles.tabContent}>

      {/* Desktop notifications */}
      <div className={styles.sectionTitle}>Desktop Notifications</div>

      {permState === 'unsupported' && (
        <div className={styles.notifHint}>Desktop notifications are not supported in this browser.</div>
      )}
      {permState === 'denied' && (
        <div className={styles.notifWarn}>Notifications blocked — re-enable them in your system notification settings, then return here.</div>
      )}
      {permState === 'default' && (
        <button className={styles.notifPermBtn} onClick={requestPermission}>
          Enable Desktop Notifications
        </button>
      )}

      <SettingRow label="Desktop notifications" sub="Show a popup when you receive a message">
        <NeuToggle value={desktopNotifs && permState === 'granted'} onChange={v => { setDesktopNotifs(v); if (v) requestPermission(); }} />
      </SettingRow>
      <SettingRow label="Notify on direct message" sub="Pop up when someone DMs you">
        <NeuToggle value={notifDm} onChange={setNotifDm} />
      </SettingRow>
      <SettingRow label="Notify on mention" sub="Pop up when someone @mentions you">
        <NeuToggle value={notifMention} onChange={setNotifMention} />
      </SettingRow>
      <SettingRow label="Notify on all messages" sub="Pop up for every message (not recommended)">
        <NeuToggle value={notifAllMsg} onChange={setNotifAllMsg} />
      </SettingRow>

      <div className={styles.voiceDivider} />

      {/* Sounds */}
      <div className={styles.sectionTitle}>Sounds</div>

      <SettingRow label="Message sounds" sub="Play a sound when messages arrive">
        <NeuToggle value={soundMessages} onChange={setSoundMessages} />
      </SettingRow>
      <SettingRow label="Mention sounds" sub="Extra alert sound when you're mentioned">
        <NeuToggle value={soundMentions} onChange={setSoundMentions} />
      </SettingRow>
      <SettingRow label="DM sounds" sub="Sound for direct messages">
        <NeuToggle value={soundDm} onChange={setSoundDm} />
      </SettingRow>

      <div className={styles.voiceDivider} />

      {/* Badges */}
      <div className={styles.sectionTitle}>Badges</div>

      <SettingRow label="Mention badge" sub="Show unread mention count on server icon">
        <NeuToggle value={mentionBadge} onChange={setMentionBadge} />
      </SettingRow>

    </div>
  );
}

// ── Accessibility tab ─────────────────────────────────────────────────────────

function applyAccessibility(reduceMotion: boolean, highContrast: boolean, largeTargets: boolean) {
  const root = document.documentElement;
  root.dataset.reduceMotion = reduceMotion ? 'true' : '';
  root.dataset.highContrast = highContrast ? 'true' : '';
  root.dataset.largeTargets = largeTargets ? 'true' : '';
  if (reduceMotion) {
    root.style.setProperty('--transition-speed', '0ms');
  } else {
    root.style.removeProperty('--transition-speed');
  }
}

(function initAccessibility() {
  const rm = localStorage.getItem('a11y_reduce_motion') === 'true';
  const hc = localStorage.getItem('a11y_high_contrast') === 'true';
  const lt = localStorage.getItem('a11y_large_targets') === 'true';
  applyAccessibility(rm, hc, lt);
})();

function AccessibilityTab() {
  const [reduceMotion,  setReduceMotion]  = usePref('a11y_reduce_motion', false);
  const [highContrast,  setHighContrast]  = usePref('a11y_high_contrast', false);
  const [largeTargets,  setLargeTargets]  = usePref('a11y_large_targets', false);
  const [spellcheck,    setSpellcheck]    = usePref('a11y_spellcheck', true);
  const [showTimestamps, setShowTimestamps] = usePref('a11y_timestamps', true);
  const [gifAutoplay,   setGifAutoplay]   = usePref('a11y_gif_autoplay', true);
  const [animatedEmoji, setAnimatedEmoji] = usePref('a11y_animated_emoji', true);

  function apply(rm: boolean, hc: boolean, lt: boolean) {
    applyAccessibility(rm, hc, lt);
    localStorage.setItem('a11y_reduce_motion', String(rm));
    localStorage.setItem('a11y_high_contrast', String(hc));
    localStorage.setItem('a11y_large_targets', String(lt));
  }

  return (
    <div className={styles.tabContent}>

      <div className={styles.sectionTitle}>Motion & Animation</div>

      <SettingRow label="Reduce motion" sub="Disable transitions and animations throughout the app">
        <NeuToggle value={reduceMotion} onChange={v => { setReduceMotion(v); apply(v, highContrast, largeTargets); }} />
      </SettingRow>
      <SettingRow label="Autoplay GIFs" sub="Animate GIFs while browsing (disable to save resources)">
        <NeuToggle value={gifAutoplay} onChange={setGifAutoplay} />
      </SettingRow>
      <SettingRow label="Animated emoji" sub="Show animated versions of emoji">
        <NeuToggle value={animatedEmoji} onChange={setAnimatedEmoji} />
      </SettingRow>

      <div className={styles.voiceDivider} />

      <div className={styles.sectionTitle}>Display</div>

      <SettingRow label="High contrast" sub="Increase contrast for better readability">
        <NeuToggle value={highContrast} onChange={v => { setHighContrast(v); apply(reduceMotion, v, largeTargets); }} />
      </SettingRow>
      <SettingRow label="Larger click targets" sub="Make buttons and interactive elements bigger">
        <NeuToggle value={largeTargets} onChange={v => { setLargeTargets(v); apply(reduceMotion, highContrast, v); }} />
      </SettingRow>
      <SettingRow label="Always show timestamps" sub="Show time on every message instead of on hover">
        <NeuToggle value={showTimestamps} onChange={setShowTimestamps} />
      </SettingRow>

      <div className={styles.voiceDivider} />

      <div className={styles.sectionTitle}>Text Input</div>

      <SettingRow label="Spellcheck" sub="Underline misspelled words in the message box">
        <NeuToggle value={spellcheck} onChange={setSpellcheck} />
      </SettingRow>

    </div>
  );
}

// ── Dev tab ────────────────────────────────────────────────────────────────────

function DevTab({ onOpenDevPanel }: { onOpenDevPanel?: () => void }) {
  const [authUrl, setAuthUrl] = useState(
    localStorage.getItem('auth_server_url') || ENV_AUTH_URL
  );
  const [dmUrl, setDmUrl] = useState(
    localStorage.getItem('dm_server_url') || ENV_DM_URL
  );
  const [zcloudUrl, setZcloudUrl] = useState(
    localStorage.getItem('zcloud_url') || ENV_ZCLOUD_URL
  );
  const [saved, setSaved] = useState(false);

  function handleSave() {
    localStorage.setItem('auth_server_url', authUrl);
    localStorage.setItem('dm_server_url', dmUrl);
    localStorage.setItem('zcloud_url', zcloudUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const token = getToken();

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Server URLs</div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Auth Server</label>
        <input
          className={styles.input}
          value={authUrl}
          onChange={e => setAuthUrl(e.target.value)}
          placeholder="http://..."
          spellCheck={false}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>DM Server</label>
        <input
          className={styles.input}
          value={dmUrl}
          onChange={e => setDmUrl(e.target.value)}
          placeholder="http://..."
          spellCheck={false}
        />
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>ZCloud URL</label>
        <input
          className={styles.input}
          value={zcloudUrl}
          onChange={e => setZcloudUrl(e.target.value)}
          placeholder="http://..."
          spellCheck={false}
        />
      </div>

      <button
        className={`${styles.saveBtn} ${saved ? styles.saveBtnDone : ''}`}
        onClick={handleSave}
      >
        {saved ? 'Saved!' : 'Save'}
      </button>

      <div className={styles.sectionTitle} style={{ marginTop: 8 }}>Auth Token</div>
      <div className={styles.devTokenWrap}>
        <div className={styles.inputReadonly} style={{ fontSize: 10, wordBreak: 'break-all', userSelect: 'all' }}>
          {token || '(no token)'}
        </div>
      </div>

      {onOpenDevPanel && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 20 }}>Staff Portal</div>
          <button
            className={styles.saveBtn}
            onClick={onOpenDevPanel}
            style={{ marginTop: 0 }}
          >
            Open Dev Panel
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4 }}>
            Access is verified server-side via your signed JWT. Requires owner or staff role.
          </p>
        </>
      )}
    </div>
  );
}

// ── Neumorphic slider ─────────────────────────────────────────────────────────

function NeuSlider({
  value, min, max, onChange,
}: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging  = useRef(false);

  const pct = ((value - min) / (max - min)) * 100;

  function compute(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(Math.round(min + ratio * (max - min)));
  }

  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true;
    compute(e.clientX);
    const onMove = (ev: MouseEvent) => { if (dragging.current) compute(ev.clientX); };
    const onUp   = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onTouchStart(e: React.TouchEvent) {
    compute(e.touches[0].clientX);
    const onMove = (ev: TouchEvent) => compute(ev.touches[0].clientX);
    const onEnd  = () => { window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); };
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onEnd);
  }

  return (
    <div
      ref={trackRef}
      className={styles.neuTrack}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <div className={styles.neuFill} style={{ width: `${pct}%` }} />
      <div className={styles.neuKnob} style={{ left: `${pct}%` }} />
    </div>
  );
}

// ── Voice & Video tab ─────────────────────────────────────────────────────────

function VoiceTab() {
  const [micDevices,     setMicDevices]     = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDevices,  setCameraDevices]  = useState<MediaDeviceInfo[]>([]);

  const [selMic,     setSelMic]     = useState(localStorage.getItem('pref_mic')     ?? 'default');
  const [selSpeaker, setSelSpeaker] = useState(localStorage.getItem('pref_speaker') ?? 'default');
  const [selCamera,  setSelCamera]  = useState(localStorage.getItem('pref_camera')  ?? 'default');
  const [inputVol,   setInputVol]   = useState(Number(localStorage.getItem('pref_input_vol')  ?? 100));
  const [outputVol,  setOutputVol]  = useState(Number(localStorage.getItem('pref_output_vol') ?? 100));

  const [micLevel,   setMicLevel]   = useState(0);
  const [testing,    setTesting]    = useState(false);
  const [permErr,    setPermErr]    = useState('');

  const streamRef   = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef      = useRef<number>(0);
  const ctxRef      = useRef<AudioContext | null>(null);

  // Enumerate devices (requests permission first)
  const loadDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const all = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(    all.filter(d => d.kind === 'audioinput'));
      setSpeakerDevices(all.filter(d => d.kind === 'audiooutput'));
      setCameraDevices( all.filter(d => d.kind === 'videoinput'));
      setPermErr('');
    } catch {
      setPermErr('Microphone permission denied. Allow access to see devices.');
    }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Mic level meter
  const startTest = useCallback(async () => {
    if (testing) {
      // Stop
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      cancelAnimationFrame(rafRef.current);
      analyserRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
      setMicLevel(0);
      setTesting(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selMic === 'default' ? undefined : { exact: selMic } },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const avg = buf.reduce((a, b) => a + b, 0) / buf.length;
        setMicLevel(Math.min(100, (avg / 128) * 100 * (inputVol / 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setTesting(true);
    } catch {
      setPermErr('Could not access microphone.');
    }
  }, [testing, selMic, inputVol]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(rafRef.current);
    ctxRef.current?.close();
  }, []);

  function save(key: string, val: string | number) {
    localStorage.setItem(key, String(val));
  }

  return (
    <PermissionGate kind="microphone" onGranted={loadDevices}>
    <div className={styles.tabContent}>
      {permErr && <div className={styles.voicePermErr}>{permErr}</div>}

      {/* ── Microphone ── */}
      <div className={styles.sectionTitle}>Microphone</div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Input Device</label>
        <select
          className={styles.select}
          value={selMic}
          onChange={e => { setSelMic(e.target.value); save('pref_mic', e.target.value); }}
        >
          <option value="default">Default</option>
          {micDevices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 6)}`}</option>
          ))}
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Input Volume — {inputVol}%</label>
        <NeuSlider min={0} max={200} value={inputVol} onChange={v => { setInputVol(v); save('pref_input_vol', v); }} />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Mic Level</label>
        <div className={styles.levelBar}>
          <div className={styles.levelFill} style={{ width: `${micLevel}%` }} />
        </div>
        <button className={`${styles.testBtn} ${testing ? styles.testBtnActive : ''}`} onClick={startTest}>
          {testing ? 'Stop Test' : 'Test Mic'}
        </button>
      </div>

      <div className={styles.voiceDivider} />

      {/* ── Speaker ── */}
      <div className={styles.sectionTitle}>Speaker</div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Output Device</label>
        <select
          className={styles.select}
          value={selSpeaker}
          onChange={e => { setSelSpeaker(e.target.value); save('pref_speaker', e.target.value); }}
        >
          <option value="default">Default</option>
          {speakerDevices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 6)}`}</option>
          ))}
        </select>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Output Volume — {outputVol}%</label>
        <NeuSlider min={0} max={100} value={outputVol} onChange={v => { setOutputVol(v); save('pref_output_vol', v); }} />
      </div>

      <div className={styles.voiceDivider} />

      {/* ── Camera ── */}
      <div className={styles.sectionTitle}>Camera</div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Video Device</label>
        <select
          className={styles.select}
          value={selCamera}
          onChange={e => { setSelCamera(e.target.value); save('pref_camera', e.target.value); }}
        >
          <option value="default">Default</option>
          {cameraDevices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 6)}`}</option>
          ))}
        </select>
      </div>

      {cameraDevices.length === 0 && !permErr && (
        <p className={styles.voiceHint}>No camera detected.</p>
      )}
    </div>
    </PermissionGate>
  );
}

// ── Main AccountModal ──────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode; gold?: boolean }[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    ),
  },
  {
    id: 'security',
    label: 'Security',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
  },
  {
    id: 'friends',
    label: 'Friends',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    id: 'servers',
    label: 'Servers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
        <line x1="6" y1="6" x2="6.01" y2="6"/>
        <line x1="6" y1="18" x2="6.01" y2="18"/>
      </svg>
    ),
  },
  {
    id: 'subaccounts',
    label: 'Sub-accounts',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <line x1="19" y1="8" x2="19" y2="14"/>
        <line x1="22" y1="11" x2="16" y2="11"/>
      </svg>
    ),
  },
  {
    id: 'promo',
    label: 'Redeem Code',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 12V22H4V12"/>
        <path d="M22 7H2v5h20V7z"/>
        <path d="M12 22V7"/>
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
      </svg>
    ),
  },
  {
    id: 'premium',
    label: 'Premium',
    gold: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ),
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
  },
  {
    id: 'accessibility',
    label: 'Accessibility',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    ),
  },
  {
    id: 'voice',
    label: 'Voice & Video',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    ),
  },
  {
    id: 'dev',
    label: 'Dev',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16 18 22 12 16 6"/>
        <polyline points="8 6 2 12 8 18"/>
      </svg>
    ),
  },
];

export default function AccountModal({ onClose, onLogout, onDm, onSwitchServer, onOpenDevPanel }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const identity = getBeamIdentity();
  const [navAvatarId, setNavAvatarId] = useState<string | null>(
    identity ? (getAvatarCache(identity) ?? null) : null
  );

  useEffect(() => {
    if (!identity) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ identity: string }>).detail;
      if (detail.identity === identity) setNavAvatarId(getAvatarCache(identity));
    };
    window.addEventListener(AVATAR_CACHE_EVENT, handler);
    return () => window.removeEventListener(AVATAR_CACHE_EVENT, handler);
  }, [identity]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Left nav */}
        <div className={styles.navSidebar}>
          <div className={styles.navTop}>
            <div className={styles.navAvatar}>
              <Avatar name={identity} avatarId={navAvatarId} size={40} />
              <div className={styles.navIdentity}>{identity}</div>
            </div>
          </div>

          <nav className={styles.navList}>
            {TABS.map(t => (
              <button
                key={t.id}
                className={`${styles.navBtn} ${activeTab === t.id ? styles.navBtnActive : ''} ${t.gold ? styles.navBtnGold : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                <span className={styles.navBtnIcon}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <div className={styles.navBottom}>
            <button className={styles.logoutBtn} onClick={onLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <div className={styles.contentTitle}>
              {TABS.find(t => t.id === activeTab)?.label}
            </div>
            <button className={styles.closeBtn} onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className={styles.contentScroll}>
            {activeTab === 'profile'     && <ProfileTab />}
            {activeTab === 'security'    && <SecurityTab />}
            {activeTab === 'friends'     && <FriendsTab onDm={onDm ? b => { onDm(b); onClose(); } : undefined} />}
            {activeTab === 'servers'     && <ServersTab onSwitchServer={onSwitchServer ? (u, n) => { onSwitchServer(u, n); onClose(); } : undefined} />}
            {activeTab === 'subaccounts' && <SubaccountsTab />}
            {activeTab === 'promo'       && <PromoTab />}
            {activeTab === 'premium'     && <PremiumTab />}
            {activeTab === 'appearance'     && <AppearanceTab />}
            {activeTab === 'notifications'  && <NotificationsTab />}
            {activeTab === 'accessibility'  && <AccessibilityTab />}
            {activeTab === 'voice'          && <VoiceTab />}
            {activeTab === 'dev'            && <DevTab onOpenDevPanel={onOpenDevPanel} />}
          </div>
        </div>
      </div>
    </div>
  );
}
