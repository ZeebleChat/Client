/**
 * Add server modal for joining or creating servers.
 * "Join" tab accepts invite links, validates, exchanges token, redeems invite.
 * "Create" tab creates a new ZCloud server if ZCloud URL is configured.
 */
import { useState } from 'react';
import { validateInvite, redeemInvite, addServer, createCloudServer, exchangeToken } from '../api';
import styles from './AddServerModal.module.css';

interface Props {
onClose: () => void;
onAdded: () => void;
}

type Tab = 'join' | 'create';

/**
 * Parses an invite link to extract server URL and invite code.
 * Supports formats: http://server/join/code or http://server/invites/code
 */
function parseInviteLink(raw: string): { serverUrl: string; code: string } | null {
const cleaned = raw.trim();
try {
const url = new URL(cleaned);
if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
const m = url.pathname.match(/\/(?:join|invites)\/([^/]+)/i);
if (!m) return null;
const code = m[1].toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '');
if (!code) return null;
return { serverUrl: url.origin, code };
} catch {
return null;
}
}

export default function AddServerModal({ onClose, onAdded }: Props) {
  const [tab, setTab] = useState<Tab>('join');

  // Join tab
  const [inviteLink, setInviteLink] = useState('');
  const [joinStatus, setJoinStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [joinError, setJoinError] = useState('');

  // Create tab
  const [serverName, setServerName] = useState('');
  const [about, setAbout] = useState('');
  const [createStatus, setCreateStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [createError, setCreateError] = useState('');

  async function handleJoin() {
    setJoinError('');
    const parsed = parseInviteLink(inviteLink);
    if (!parsed) {
      setJoinError('Invalid invite link. Paste a full URL like http://server/join/code');
      return;
    }
    setJoinStatus('loading');
    try {
      // 1. Validate
      const val = await validateInvite(parsed.serverUrl, parsed.code);
      if (!val.ok) {
        setJoinError('Invite not found or expired.');
        setJoinStatus('error');
        return;
      }
      // 2. Exchange token
      const ex = await exchangeToken(parsed.serverUrl);
      if (!ex.ok || !ex.token) {
        setJoinError('Failed to authenticate with that server.');
        setJoinStatus('error');
        return;
      }
      // 3. Redeem
      const redeem = await redeemInvite(parsed.serverUrl, parsed.code, ex.token);
      if (!redeem.ok) {
        setJoinError(redeem.error ?? 'Failed to redeem invite.');
        setJoinStatus('error');
        return;
      }
      // 4. Persist to auth server
      const serverName = (val.data as Record<string, string>)?.server_name ?? null;
      await addServer(parsed.serverUrl, serverName);
      setJoinStatus('idle');
      onAdded();
      onClose();
    } catch (e) {
      setJoinError((e as Error).message);
      setJoinStatus('error');
    }
  }

  async function handleCreate() {
    setCreateError('');
    if (!serverName.trim()) {
      setCreateError('Server name is required.');
      return;
    }
    setCreateStatus('loading');
    try {
      const result = await createCloudServer(serverName.trim(), about.trim());
      if (!result.ok || !result.data) {
        setCreateError(result.error ?? 'Failed to create server.');
        setCreateStatus('error');
        return;
      }
      setCreateStatus('idle');
      onAdded();
      onClose();
    } catch (e) {
      setCreateError((e as Error).message);
      setCreateStatus('error');
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>Add a Server</span>
          <button className={styles.closeBtn} onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'join' ? styles.tabActive : ''}`}
            onClick={() => setTab('join')}
          >
            Join Server
          </button>
          <button
            className={`${styles.tab} ${tab === 'create' ? styles.tabActive : ''}`}
            onClick={() => setTab('create')}
          >
            Create Server
          </button>
        </div>

        {tab === 'join' && (
          <div className={styles.body}>
            <p className={styles.hint}>Paste a full invite link to join a server.</p>
            <label className={styles.fieldLabel}>Invite Link</label>
            <input
              className={styles.input}
              value={inviteLink}
              onChange={e => setInviteLink(e.target.value)}
              placeholder="http://server/join/abc123"
              spellCheck={false}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            {joinError && <div className={styles.error}>{joinError}</div>}
            <button
              className={styles.primaryBtn}
              onClick={handleJoin}
              disabled={joinStatus === 'loading'}
            >
              {joinStatus === 'loading' ? 'Joining…' : 'Join Server'}
            </button>
          </div>
        )}

        {tab === 'create' && (
          <div className={styles.body}>
            <p className={styles.hint}>Create a new hosted Zeeble server.</p>
            <label className={styles.fieldLabel}>Server Name</label>
            <input
              className={styles.input}
              value={serverName}
              onChange={e => setServerName(e.target.value)}
              placeholder="My Awesome Server"
              autoFocus
              maxLength={64}
            />
            <label className={styles.fieldLabel}>About <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
            <input
              className={styles.input}
              value={about}
              onChange={e => setAbout(e.target.value)}
              placeholder="What's this server about?"
              maxLength={256}
            />
            {createError && <div className={styles.error}>{createError}</div>}
            <button
              className={styles.primaryBtn}
              onClick={handleCreate}
              disabled={createStatus === 'loading'}
            >
              {createStatus === 'loading' ? 'Creating…' : 'Create Server'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
