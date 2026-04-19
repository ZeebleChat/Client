import { useState, useEffect, useCallback } from 'react';
import { getAuthAttachmentUrl } from '../api';
import {
  adminGetMe, adminGetStats, adminListUsers, adminLockUser, adminUnlockUser,
  adminListStaff, adminAddStaff, adminRemoveStaff,
  adminListPromos, adminCreatePromo, adminDeletePromo,
  adminListBans, adminListBroadcasts, adminSendBroadcast, adminListServers,
  type AdminMe, type AdminStats, type AdminUser, type StaffMember,
  type AdminPromo, type AdminBan, type AdminBroadcast, type AdminServer,
} from '../api';
import styles from './DevPanel.module.css';

// Hard-coded owner — must match the HARDCODED_OWNER constant in the Rust backend.
// Front-end check is only for UX (hiding buttons). The backend always re-verifies.
const OWNER_IDENTITY = 'creeper7»l0na6';

type Tab = 'overview' | 'promos' | 'users' | 'servers' | 'broadcasts' | 'bans' | 'staff' | 'config';

const TABS: { id: Tab; label: string; badge?: number }[] = [
  { id: 'overview',    label: 'Overview' },
  { id: 'promos',      label: 'Promo codes' },
  { id: 'users',       label: 'Users' },
  { id: 'servers',     label: 'Servers' },
  { id: 'broadcasts',  label: 'Broadcasts' },
  { id: 'bans',        label: 'Bans' },
  { id: 'staff',       label: 'Staff' },
  { id: 'config',      label: 'Config' },
];

interface Props {
  onClose: () => void;
}

// ── Avatar helper ─────────────────────────────────────────────────────────────

function StaffAvatar({ name, avatarId, size = 40 }: { name: string; avatarId?: number | null; size?: number }) {
  if (avatarId) {
    return (
      <img
        src={getAuthAttachmentUrl(String(avatarId))}
        className={styles.staffAvatarImg}
        style={{ width: size, height: size }}
        alt={name}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  const initial = (name || '?').slice(0, 2).toUpperCase();
  return (
    <div className={styles.staffAvatarFallback} style={{ width: size, height: size }}>
      {initial}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <div className={styles.loading}>Loading stats…</div>;
  return (
    <div className={styles.overviewGrid}>
      <StatCard label="Total users"     value={stats.total_users.toLocaleString()} sub="+2.4% vs last week" />
      <StatCard label="Premium"         value={stats.premium_users.toLocaleString()} sub="active subscriptions" />
      <StatCard label="Servers"         value={stats.total_servers.toLocaleString()} sub="registered" />
      <StatCard label="Active bans"     value={stats.active_bans.toLocaleString()} sub="platform-level" />
      <StatCard label="Staff members"   value={stats.staff_count.toLocaleString()} sub="including owner" />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statSub}>{sub}</div>
    </div>
  );
}

// ── Staff tab ─────────────────────────────────────────────────────────────────

function StaffTab({ isOwner }: { isOwner: boolean }) {
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUid, setSearchUid] = useState('');
  const [newRole, setNewRole] = useState('moderator');
  const [newNote, setNewNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const list = await adminListStaff();
    setMembers(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!searchUid.trim()) return;
    setAdding(true);
    setAddError('');
    const ok = await adminAddStaff(searchUid.trim(), newRole, newNote || undefined);
    if (ok) {
      setSearchUid('');
      setNewNote('');
      await load();
    } else {
      setAddError('Failed — check the user ID and try again.');
    }
    setAdding(false);
  }

  async function handleRemove(uid: string) {
    if (uid === 'owner') return;
    await adminRemoveStaff(uid);
    await load();
  }

  const roleBadgeClass = (role: string) => {
    if (role === 'owner') return styles.badgeOwner;
    if (role === 'admin') return styles.badgeAdmin;
    if (role === 'moderator') return styles.badgeMod;
    return styles.badgeStaff;
  };

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Staff roster</div>
      <p className={styles.securityNote}>
        Staff access is verified server-side via signed JWT. Submitting a name alone grants no access.
      </p>

      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : (
        <div className={styles.staffList}>
          {members.map(m => (
            <div key={m.id} className={styles.staffRow}>
              <StaffAvatar name={m.display_name} avatarId={m.avatar_attachment_id} />
              <div className={styles.staffInfo}>
                <div className={styles.staffName}>{m.display_name}</div>
                <div className={styles.staffIdentity}>{m.beam_identity}</div>
                {m.staff_note && <div className={styles.staffNote}>{m.staff_note}</div>}
              </div>
              <span className={`${styles.badge} ${roleBadgeClass(m.staff_role)}`}>
                {m.staff_role}
              </span>
              {isOwner && m.id !== 'owner' && (
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemove(m.id)}
                  title="Remove staff"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isOwner && (
        <div className={styles.addStaffBox}>
          <div className={styles.sectionTitle} style={{ marginTop: 24 }}>Add staff member</div>
          <div className={styles.fieldRow}>
            <input
              className={styles.input}
              placeholder="User ID (uid from /admin/users)"
              value={searchUid}
              onChange={e => setSearchUid(e.target.value)}
              spellCheck={false}
            />
            <select
              className={styles.select}
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="support">Support</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <input
            className={styles.input}
            placeholder="Note (optional)"
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            style={{ marginTop: 8 }}
          />
          {addError && <div className={styles.errorMsg}>{addError}</div>}
          <button
            className={styles.actionBtn}
            onClick={handleAdd}
            disabled={adding || !searchUid.trim()}
            style={{ marginTop: 10 }}
          >
            {adding ? 'Adding…' : 'Add staff member'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Promo codes tab ───────────────────────────────────────────────────────────

function PromosTab() {
  const [promos, setPromos] = useState<AdminPromo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [newMax, setNewMax] = useState('');
  const [newPremium, setNewPremium] = useState(false);
  const [createErr, setCreateErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setPromos(await adminListPromos());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setCreateErr('');
    const result = await adminCreatePromo(
      newCode,
      newMax ? parseInt(newMax) : null,
      null,
      newPremium,
    );
    if (result.ok) {
      setNewCode(''); setNewMax(''); setNewPremium(false);
      await load();
    } else {
      setCreateErr(result.error ?? 'Error');
    }
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Active promo codes</div>
      {loading ? <div className={styles.loading}>Loading…</div> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Code</th><th>Uses</th><th>Premium</th><th>Created by</th><th></th>
            </tr>
          </thead>
          <tbody>
            {promos.map(p => (
              <tr key={p.code}>
                <td><code>{p.code}</code></td>
                <td>{p.uses_count}{p.uses_max != null ? ` / ${p.uses_max}` : ' / ∞'}</td>
                <td>{p.grants_premium ? <span className={styles.badgeOwner}>yes</span> : '—'}</td>
                <td className={styles.mutedTd}>{p.created_by ?? '—'}</td>
                <td>
                  <button className={styles.removeBtn} onClick={async () => {
                    await adminDeletePromo(p.code);
                    await load();
                  }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={styles.sectionTitle} style={{ marginTop: 24 }}>New promo code</div>
      <div className={styles.fieldRow}>
        <input className={styles.input} placeholder="CODE" value={newCode}
          onChange={e => setNewCode(e.target.value.toUpperCase())} spellCheck={false} />
        <input className={styles.input} placeholder="Max uses (blank = unlimited)" value={newMax}
          onChange={e => setNewMax(e.target.value)} style={{ maxWidth: 180 }} />
        <label className={styles.checkLabel}>
          <input type="checkbox" checked={newPremium} onChange={e => setNewPremium(e.target.checked)} />
          Grants premium
        </label>
      </div>
      {createErr && <div className={styles.errorMsg}>{createErr}</div>}
      <button className={styles.actionBtn} onClick={handleCreate} disabled={!newCode.trim()}
        style={{ marginTop: 10 }}>
        Create promo
      </button>
    </div>
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number, s: string) => {
    setLoading(true);
    setUsers(await adminListUsers(p, s || undefined));
    setLoading(false);
  }, []);

  useEffect(() => { load(page, search); }, [load, page, search]);

  return (
    <div className={styles.tabContent}>
      <div className={styles.searchRow}>
        <input className={styles.input} placeholder="Search users…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }} />
      </div>
      {loading ? <div className={styles.loading}>Loading…</div> : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Identity</th><th>Premium</th><th>Verified</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div>{u.display_name}</div>
                  <div className={styles.mutedTd} style={{ fontSize: 11 }}>{u.beam_identity}</div>
                </td>
                <td>{u.premium ? <span className={styles.badgeOwner}>✓</span> : '—'}</td>
                <td>{u.verified ? <span className={styles.badgeMod}>✓</span> : '—'}</td>
                <td>
                  {u.locked
                    ? <span className={styles.badgeAdmin}>banned</span>
                    : u.is_staff
                    ? <span className={styles.badgeMod}>staff</span>
                    : <span className={styles.badgeStaff}>active</span>}
                </td>
                <td>
                  {u.locked
                    ? <button className={styles.actionBtnSm} onClick={async () => {
                        await adminUnlockUser(u.id);
                        await load(page, search);
                      }}>Unban</button>
                    : <button className={styles.removeBtnSm} onClick={async () => {
                        const reason = prompt('Ban reason:') ?? 'No reason';
                        await adminLockUser(u.id, reason);
                        await load(page, search);
                      }}>Ban</button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className={styles.pagination}>
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
        <span>Page {page + 1}</span>
        <button disabled={users.length < 50} onClick={() => setPage(p => p + 1)}>Next →</button>
      </div>
    </div>
  );
}

// ── Servers tab ───────────────────────────────────────────────────────────────

function ServersTab() {
  const [servers, setServers] = useState<AdminServer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminListServers().then(s => { setServers(s); setLoading(false); });
  }, []);

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Registered servers ({servers.length})</div>
      {loading ? <div className={styles.loading}>Loading…</div> : (
        <table className={styles.table}>
          <thead><tr><th>URL</th><th>Owner</th><th>Members</th></tr></thead>
          <tbody>
            {servers.map(s => (
              <tr key={s.server_url}>
                <td><code className={styles.codeSmall}>{s.server_url}</code></td>
                <td>{s.owner}</td>
                <td>{s.member_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Broadcasts tab ────────────────────────────────────────────────────────────

function BroadcastsTab() {
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setBroadcasts(await adminListBroadcasts());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSend() {
    if (!msg.trim()) return;
    setSending(true);
    await adminSendBroadcast(msg.trim());
    setMsg('');
    await load();
    setSending(false);
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Send broadcast</div>
      <textarea className={styles.textarea} rows={3} placeholder="Message to all users…"
        value={msg} onChange={e => setMsg(e.target.value)} />
      <button className={styles.actionBtn} onClick={handleSend} disabled={sending || !msg.trim()}
        style={{ marginTop: 8 }}>
        {sending ? 'Sending…' : 'Send broadcast'}
      </button>
      <div className={styles.sectionTitle} style={{ marginTop: 24 }}>Broadcast history</div>
      {loading ? <div className={styles.loading}>Loading…</div> : (
        <div className={styles.broadcastList}>
          {broadcasts.map(b => (
            <div key={b.id} className={styles.broadcastRow}>
              <div className={styles.broadcastMsg}>{b.message}</div>
              <div className={styles.broadcastMeta}>{b.sent_by} · {new Date(parseInt(b.sent_at) * 1000).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bans tab ──────────────────────────────────────────────────────────────────

function BansTab() {
  const [bans, setBans] = useState<AdminBan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setBans(await adminListBans());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Platform bans ({bans.length})</div>
      {loading ? <div className={styles.loading}>Loading…</div> : (
        <table className={styles.table}>
          <thead><tr><th>User</th><th>Reason</th><th>Banned by</th><th>Expires</th><th></th></tr></thead>
          <tbody>
            {bans.map(b => (
              <tr key={b.id}>
                <td>{b.beam_identity}</td>
                <td>{b.reason}</td>
                <td className={styles.mutedTd}>{b.banned_by}</td>
                <td>{b.expires_at ? new Date(b.expires_at * 1000).toLocaleDateString() : 'Permanent'}</td>
                <td>
                  <button className={styles.actionBtnSm} onClick={async () => {
                    await adminUnlockUser(b.user_id);
                    await load();
                  }}>Unban</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Config tab ────────────────────────────────────────────────────────────────

function ConfigTab() {
  return (
    <div className={styles.tabContent}>
      <div className={styles.sectionTitle}>Platform config</div>
      <div className={styles.configNote}>
        Runtime config is managed via environment variables on the zbeam server.
        Restart required after changes.
      </div>
      <div className={styles.configRow}>
        <span className={styles.configKey}>HARDCODED_OWNER</span>
        <code className={styles.configVal}>{OWNER_IDENTITY}</code>
      </div>
      <div className={styles.configRow}>
        <span className={styles.configKey}>AUTH_RATE_LIMIT_REQUESTS</span>
        <code className={styles.configVal}>10 / 60s (default)</code>
      </div>
      <div className={styles.configRow}>
        <span className={styles.configKey}>ACCESS_TOKEN_EXPIRY</span>
        <code className={styles.configVal}>86400s (24h)</code>
      </div>
    </div>
  );
}

// ── Main DevPanel component ───────────────────────────────────────────────────

export default function DevPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [me, setMe] = useState<AdminMe | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    Promise.all([adminGetMe(), adminGetStats()]).then(([meData, statsData]) => {
      setMe(meData);
      setStats(statsData);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.panel} onClick={e => e.stopPropagation()}>
          <div className={styles.loading} style={{ margin: 'auto' }}>Verifying access…</div>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.panel} onClick={e => e.stopPropagation()}>
          <div className={styles.accessDenied}>
            <div className={styles.accessDeniedTitle}>Access denied</div>
            <div className={styles.accessDeniedSub}>Your account does not have staff or owner access.</div>
            <button className={styles.actionBtn} onClick={onClose} style={{ marginTop: 16 }}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = me.is_owner;
  const tabsWithBadges = TABS.map(t => ({
    ...t,
    badge: t.id === 'bans' ? stats?.active_bans : undefined,
  }));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Title bar */}
        <div className={styles.titleBar}>
          <div className={styles.titleBarLeft}>
            <span className={styles.titleBarName}>Dev</span>
            <span className={`${styles.roleBadge} ${isOwner ? styles.roleBadgeOwner : styles.roleBadgeStaff}`}>
              {isOwner ? 'OWNER' : 'STAFF'}
            </span>
            <span className={styles.titleBarEnv}>zeeble.xyz · production</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Top nav tabs */}
        <nav className={styles.tabNav}>
          {tabsWithBadges.map(t => (
            <button
              key={t.id}
              className={`${styles.tabBtn} ${tab === t.id ? styles.tabBtnActive : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span className={styles.tabBadge}>{t.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className={styles.content}>
          {tab === 'overview'   && <OverviewTab stats={stats} />}
          {tab === 'promos'     && <PromosTab />}
          {tab === 'users'      && <UsersTab />}
          {tab === 'servers'    && <ServersTab />}
          {tab === 'broadcasts' && <BroadcastsTab />}
          {tab === 'bans'       && <BansTab />}
          {tab === 'staff'      && <StaffTab isOwner={isOwner} />}
          {tab === 'config'     && <ConfigTab />}
        </div>
      </div>
    </div>
  );
}
