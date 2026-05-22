/**
 * Server settings modal.
 * Allows server owners to manage server name, categories, and member roles.
 * Shows read-only notice for non-owners.
 */
import { useState, useEffect, useRef } from 'react';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  patchServerSettings,
  fetchMembers,
  setMemberRole,
  fetchServerInfo,
  listInvites,
  createServerInvite,
  deleteServerInvite,
  fetchCustomRoles,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  reorderCustomRoles,
  uploadFile,
  fetchServerAttachment,
  fetchChannels,
  fetchChannelPermissions,
  setChannelPermission,
  deleteChannelPermission,
  fetchCategoryPermissions,
  setCategoryPermission,
  deleteCategoryPermission,
  fetchOwnerSettings,
  type ApiCategory,
  type ApiChannel,
  type ApiMemberGroup,
  type ApiCustomRole,
  type ServerInvite,
  type ChannelPerm,
  type CategoryPerm,
  type OwnerSettings,
} from '../api';
import { getBeamIdentity } from '../auth';
import { getServerUrl } from '../config';
import styles from './ServerSettingsModal.module.css';

interface Props {
  serverName: string;
  onClose: () => void;
  onRefresh: () => void;
  initialTab?: Tab;
}

type Tab = 'overview' | 'categories' | 'channels' | 'roles' | 'invites' | 'admin';

// ── Overview ──────────────────────────────────────────────────────────────────

function OwnerNotice() {
  return (
    <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-s)', padding: '10px 14px', fontSize: 12, color: 'var(--text-2)', marginBottom: 16 }}>
      You are not the server owner. Some settings are read-only.
    </div>
  );
}

function OverviewTab({ serverName, onRefresh, isOwner }: { serverName: string; onRefresh: () => void; isOwner: boolean }) {
  const [name, setName] = useState(serverName);
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState('');

  // Icon state
  const [iconUrl,       setIconUrl]       = useState<string | null>(null);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconErr,       setIconErr]       = useState('');
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Banner state
  const [bannerUrl,       setBannerUrl]       = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerErr,       setBannerErr]       = useState('');
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Load current icon and banner on mount
  useEffect(() => {
    fetchServerInfo(getServerUrl()).then(async info => {
      if (info?.logo_attachment_id) {
        const res = await fetchServerAttachment(getServerUrl(), info.logo_attachment_id);
        if (res.ok) setIconUrl(URL.createObjectURL(await res.blob()));
      }
      if (info?.banner_attachment_id) {
        const res = await fetchServerAttachment(getServerUrl(), info.banner_attachment_id);
        if (res.ok) setBannerUrl(URL.createObjectURL(await res.blob()));
      }
    });
  }, []);

  async function handleSave() {
    if (!name.trim()) return;
    setStatus('saving');
    const res = await patchServerSettings({ name: name.trim() });
    if (res.ok) {
      setStatus('ok');
      onRefresh();
      setTimeout(() => setStatus('idle'), 1800);
    } else {
      setErrMsg(res.error ?? 'Failed to save');
      setStatus('err');
      setTimeout(() => setStatus('idle'), 2500);
    }
  }

  async function handleIconFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setIconErr('Must be an image file'); return; }
    if (file.size > 4 * 1024 * 1024) { setIconErr('Image must be under 4 MB'); return; }
    setIconErr('');
    setIconUploading(true);

    // Preview immediately
    const reader = new FileReader();
    reader.onload = ev => setIconUrl(ev.target?.result as string);
    reader.readAsDataURL(file);

    const up = await uploadFile(file);
    if (!up.ok || up.id == null) {
      setIconErr(up.error ?? 'Upload failed');
      setIconUploading(false);
      return;
    }
    const patch = await patchServerSettings({ logo_attachment_id: String(up.id) });
    setIconUploading(false);
    if (!patch.ok) {
      setIconErr(patch.error ?? 'Failed to set icon');
    } else {
      fetchServerAttachment(getServerUrl(), up.id).then(async r => {
        if (r.ok) setIconUrl(URL.createObjectURL(await r.blob()));
      });
      onRefresh();
    }
    // Reset input so same file can be re-selected
    if (iconInputRef.current) iconInputRef.current.value = '';
  }

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setBannerErr('Must be an image file'); return; }
    if (file.size > 8 * 1024 * 1024) { setBannerErr('Image must be under 8 MB'); return; }
    setBannerErr('');
    setBannerUploading(true);

    const reader = new FileReader();
    reader.onload = ev => setBannerUrl(ev.target?.result as string);
    reader.readAsDataURL(file);

    const up = await uploadFile(file);
    if (!up.ok || up.id == null) {
      setBannerErr(up.error ?? 'Upload failed');
      setBannerUploading(false);
      return;
    }
    const patch = await patchServerSettings({ banner_attachment_id: String(up.id) });
    setBannerUploading(false);
    if (!patch.ok) {
      setBannerErr(patch.error ?? 'Failed to set banner');
    } else {
      onRefresh();
    }
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  }

  const initials = serverName.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={styles.content}>
      {!isOwner && <OwnerNotice />}

      {/* Server Icon */}
      <div className={styles.sectionTitle}>Server Icon</div>
      <div className={styles.iconRow}>
        <div
          className={`${styles.iconPreview} ${isOwner ? styles.iconPreviewClickable : ''}`}
          onClick={() => isOwner && iconInputRef.current?.click()}
          title={isOwner ? 'Click to upload icon' : undefined}
        >
          {iconUrl ? (
            <img src={iconUrl} alt="Server icon" className={styles.iconImg} />
          ) : (
            <span className={styles.iconInitials}>{initials}</span>
          )}
          {isOwner && (
            <div className={styles.iconOverlay}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              <span>{iconUploading ? 'Uploading…' : 'Change Icon'}</span>
            </div>
          )}
        </div>
        <div className={styles.iconHints}>
          <p>Recommended: 512×512 px</p>
          <p>PNG, JPG, GIF, WebP</p>
          <p>Max 4 MB</p>
          {iconErr && <p className={styles.iconErrHint}>{iconErr}</p>}
        </div>
      </div>
      <input
        ref={iconInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleIconFile}
      />

      <div style={{ height: 20 }} />

      {/* Server Banner */}
      <div className={styles.sectionTitle}>Server Banner</div>
      <div
        className={`${styles.bannerPreview} ${isOwner ? styles.bannerPreviewClickable : ''}`}
        onClick={() => isOwner && bannerInputRef.current?.click()}
        title={isOwner ? 'Click to upload banner' : undefined}
      >
        {bannerUrl ? (
          <img src={bannerUrl} alt="Server banner" className={styles.bannerImg} />
        ) : (
          <span className={styles.bannerPlaceholder}>No banner set</span>
        )}
        {isOwner && (
          <div className={styles.bannerOverlay}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span>{bannerUploading ? 'Uploading…' : 'Change Banner'}</span>
          </div>
        )}
      </div>
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleBannerFile}
      />
      {bannerErr && <p style={{ color: 'var(--red, #e94560)', fontSize: 12, margin: '4px 0 0' }}>{bannerErr}</p>}

      <div style={{ height: 20 }} />

      {/* Server Name */}
      <div className={styles.sectionTitle}>Server Name</div>
      <input
        className={styles.input}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && isOwner && handleSave()}
        spellCheck={false}
        disabled={!isOwner}
      />
      {isOwner && (
        <div className={styles.rowEnd}>
          {status === 'ok' && <span className={styles.feedbackOk}>Saved!</span>}
          {status === 'err' && <span className={styles.feedbackErr}>{errMsg}</span>}
          <button
            className={`${styles.btn} ${styles.btnAccent} ${status === 'saving' ? styles.btnDisabled : ''}`}
            onClick={handleSave}
            disabled={status === 'saving'}
          >
            {status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────

// ── Category permission panel ─────────────────────────────────────────────────

function CategoryPermPanel({ categoryId, roles, isOwner }: {
  categoryId: number;
  roles: ApiCustomRole[];
  isOwner: boolean;
}) {
  const [perms, setPerms] = useState<CategoryPerm[]>([]);

  async function load() {
    fetchCategoryPermissions(categoryId).then(setPerms);
  }

  useEffect(() => { load(); }, [categoryId]);

  async function handleCycle(roleName: string) {
    if (!isOwner) return;
    const existing = perms.find(p => p.role_name === roleName);
    const allow = { ...(existing?.allow ?? {}) };
    const deny = { ...(existing?.deny ?? {}) };
    const current = permStateFromMaps('view_channel', allow, deny);
    const next = cycleState(current);
    delete allow['view_channel'];
    delete deny['view_channel'];
    if (next === 'allow') allow['view_channel'] = true;
    if (next === 'deny') deny['view_channel'] = true;
    const allNeutral = Object.keys(allow).length === 0 && Object.keys(deny).length === 0;
    if (allNeutral) {
      await deleteCategoryPermission(categoryId, roleName);
    } else {
      await setCategoryPermission(categoryId, roleName, { allow, deny });
    }
    load();
  }

  if (roles.length === 0) return <div className={styles.emptyHint}>No custom roles to configure.</div>;

  return (
    <div className={styles.permGroupContainer}>
      <div className={styles.permToggleRow}>
        <span className={styles.permToggleLabel}>View Category</span>
        <div className={styles.permToggleBtns}>
          {roles.map(role => {
            const p = perms.find(x => x.role_name === role.name);
            const state = permStateFromMaps('view_channel', p?.allow ?? {}, p?.deny ?? {});
            return (
              <button
                key={role.name}
                title={role.name}
                className={`${styles.permToggleBtn} ${state === 'allow' ? styles.permToggleAllow : state === 'deny' ? styles.permToggleDeny : styles.permToggleNeutral}`}
                onClick={() => handleCycle(role.name)}
                disabled={!isOwner}
              >
                <span className={styles.permToggleDot} style={{ background: role.color }} />
                {state === 'allow' ? '✓' : state === 'deny' ? '✗' : '—'}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.permToggleLegend}>
        {roles.map(role => (
          <span key={role.name} className={styles.permToggleLegendItem}>
            <span className={styles.permToggleDot} style={{ background: role.color }} />
            {role.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryRow({
  cat,
  onUpdated,
  onDeleted,
  isOwner,
  roles,
}: {
  cat: ApiCategory;
  onUpdated: () => void;
  onDeleted: () => void;
  isOwner: boolean;
  roles: ApiCustomRole[];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(cat.name);
  const [showPerms, setShowPerms] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function commitEdit() {
    setEditing(false);
    const trimmed = value.trim();
    if (!trimmed || trimmed === cat.name) return;
    await updateCategory(cat.id, { name: trimmed });
    onUpdated();
  }

  async function handleDelete() {
    if (!window.confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return;
    await deleteCategory(cat.id);
    onDeleted();
  }

  return (
    <div className={styles.roleDefRow}>
      <div className={styles.roleViewRow}>
        {editing ? (
          <input
            ref={inputRef}
            className={`${styles.input} ${styles.inputInline}`}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') { setValue(cat.name); setEditing(false); }
            }}
            onBlur={commitEdit}
          />
        ) : (
          <span className={styles.catName}>{cat.name}</span>
        )}
        <div className={styles.catActions}>
          <button
            className={`${styles.permsToggle} ${showPerms ? styles.permsToggleOpen : ''}`}
            onClick={() => setShowPerms(p => !p)}
          >
            Permissions
          </button>
          <button
            className={`${styles.iconBtn} ${editing ? styles.iconBtnActive : ''}`}
            title="Rename"
            onClick={() => isOwner && setEditing(e => !e)}
            disabled={!isOwner}
            style={{ opacity: isOwner ? 1 : 0.3, cursor: isOwner ? 'pointer' : 'not-allowed' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
            title="Delete"
            onClick={handleDelete}
            disabled={!isOwner}
            style={{ opacity: isOwner ? 1 : 0.3, cursor: isOwner ? 'pointer' : 'not-allowed' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/>
              <path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        </div>
      </div>
      {showPerms && (
        <CategoryPermPanel categoryId={Number(cat.id)} roles={roles} isOwner={isOwner} />
      )}
    </div>
  );
}

function CategoriesTab({ onRefresh, isOwner }: { onRefresh: () => void; isOwner: boolean }) {
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [roles, setRoles] = useState<ApiCustomRole[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const [cats, rls] = await Promise.all([fetchCategories(), fetchCustomRoles()]);
    setCategories(cats);
    setRoles(rls);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    await createCategory(trimmed, categories.length);
    setNewName('');
    setAdding(false);
    await load();
    onRefresh();
  }

  async function handleMutation() {
    await load();
    onRefresh();
  }

  return (
    <div className={styles.content}>
      {!isOwner && <OwnerNotice />}
      <div className={styles.sectionTitle}>Categories</div>
      {loading ? (
        <div className={styles.emptyHint}>Loading…</div>
      ) : categories.length === 0 ? (
        <div className={styles.emptyHint}>No categories yet.</div>
      ) : (
        <div className={styles.roleDefList}>
          {categories.map(cat => (
            <CategoryRow
              key={String(cat.id)}
              cat={cat}
              onUpdated={handleMutation}
              onDeleted={handleMutation}
              isOwner={isOwner}
              roles={roles}
            />
          ))}
        </div>
      )}
      {isOwner && (
        <div className={styles.addRow}>
          <input
            className={`${styles.input} ${styles.inputGrow}`}
            placeholder="New category name…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            className={`${styles.btn} ${styles.btnAccent} ${adding ? styles.btnDisabled : ''}`}
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Channels tab ─────────────────────────────────────────────────────────────

function ChannelPermPanel({ channelId, roles, isOwner }: {
  channelId: string;
  roles: ApiCustomRole[];
  isOwner: boolean;
}) {
  const [perms, setPerms] = useState<ChannelPerm[]>([]);

  async function load() {
    fetchChannelPermissions(channelId).then(setPerms);
  }

  useEffect(() => { load(); }, [channelId]);

  async function handleCycle(roleName: string, key: string) {
    if (!isOwner) return;
    const existing = perms.find(p => p.role_name === roleName);
    const allow = { ...(existing?.allow ?? {}) };
    const deny = { ...(existing?.deny ?? {}) };
    const current = permStateFromMaps(key, allow, deny);
    const next = cycleState(current);
    delete allow[key];
    delete deny[key];
    if (next === 'allow') allow[key] = true;
    if (next === 'deny') deny[key] = true;
    const allNeutral = Object.keys(allow).length === 0 && Object.keys(deny).length === 0;
    if (allNeutral) {
      await deleteChannelPermission(channelId, roleName);
    } else {
      await setChannelPermission(channelId, roleName, { allow, deny });
    }
    load();
  }

  if (roles.length === 0) return <div className={styles.emptyHint}>No custom roles to configure.</div>;

  return (
    <div className={styles.permGroupContainer}>
      {CHANNEL_PERM_GROUPS.map(group => (
        <div key={group.label}>
          <div className={styles.permGroupLabel}>{group.label}</div>
          <div className={styles.permToggleGrid}>
            {group.keys.map(key => (
              <div key={key} className={styles.permToggleRow}>
                <span className={styles.permToggleLabel}>{CHANNEL_PERM_LABELS[key]}</span>
                <div className={styles.permToggleBtns}>
                  {roles.map(role => {
                    const p = perms.find(x => x.role_name === role.name);
                    const state = permStateFromMaps(key, p?.allow ?? {}, p?.deny ?? {});
                    return (
                      <button
                        key={role.name}
                        title={role.name}
                        className={`${styles.permToggleBtn} ${state === 'allow' ? styles.permToggleAllow : state === 'deny' ? styles.permToggleDeny : styles.permToggleNeutral}`}
                        onClick={() => handleCycle(role.name, key)}
                        disabled={!isOwner}
                      >
                        <span className={styles.permToggleDot} style={{ background: role.color }} />
                        {state === 'allow' ? '✓' : state === 'deny' ? '✗' : '—'}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className={styles.permToggleLegend}>
        {roles.map(role => (
          <span key={role.name} className={styles.permToggleLegendItem}>
            <span className={styles.permToggleDot} style={{ background: role.color }} />
            {role.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChannelRow({ channel, roles, isOwner }: {
  channel: ApiChannel;
  roles: ApiCustomRole[];
  isOwner: boolean;
}) {
  const [showPerms, setShowPerms] = useState(false);
  const isVoice = channel.type === 'voice';

  return (
    <div className={styles.roleDefRow}>
      <div className={styles.roleViewRow}>
        <span style={{ color: 'var(--text-3)', fontSize: 12, flexShrink: 0 }}>{isVoice ? '🔊' : '#'}</span>
        <span className={styles.catName}>{channel.name}</span>
        <button
          className={`${styles.permsToggle} ${showPerms ? styles.permsToggleOpen : ''}`}
          onClick={() => setShowPerms(p => !p)}
        >
          Permissions
        </button>
      </div>
      {showPerms && (
        <ChannelPermPanel channelId={String(channel.id)} roles={roles} isOwner={isOwner} />
      )}
    </div>
  );
}

function ChannelsTab({ isOwner }: { isOwner: boolean }) {
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [roles, setRoles] = useState<ApiCustomRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [chs, cats, rls] = await Promise.all([fetchChannels(), fetchCategories(), fetchCustomRoles()]);
      setChannels(chs);
      setCategories(cats);
      setRoles(rls);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className={styles.content}><div className={styles.emptyHint}>Loading…</div></div>;

  const grouped = categories.map(cat => ({
    cat,
    chs: channels.filter(ch => ch.category_id === cat.id),
  })).filter(g => g.chs.length > 0);

  const uncategorized = channels.filter(ch => ch.category_id === null || ch.category_id === undefined);

  return (
    <div className={styles.content}>
      {!isOwner && <OwnerNotice />}
      {grouped.map(({ cat, chs }) => (
        <div key={cat.id}>
          <div className={styles.sectionTitle}>{cat.name}</div>
          <div className={styles.roleDefList}>
            {chs.map(ch => <ChannelRow key={ch.id} channel={ch} roles={roles} isOwner={isOwner} />)}
          </div>
        </div>
      ))}
      {uncategorized.length > 0 && (
        <div>
          <div className={styles.sectionTitle}>Uncategorized</div>
          <div className={styles.roleDefList}>
            {uncategorized.map(ch => <ChannelRow key={ch.id} channel={ch} roles={roles} isOwner={isOwner} />)}
          </div>
        </div>
      )}
      {channels.length === 0 && <div className={styles.emptyHint}>No channels found.</div>}
    </div>
  );
}

// ── Roles ─────────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const PERM_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  manage_server: 'Manage Server',
  manage_roles: 'Manage Roles',
  manage_channels: 'Manage Channels',
  manage_nicknames: 'Manage Nicknames',
  change_nickname: 'Change Nickname',
  kick_members: 'Kick Members',
  ban_members: 'Ban Members',
  create_invites: 'Create Invites',
  manage_invites: 'Manage Invites',
  manage_messages: 'Manage Messages',
};

const PERM_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'General', keys: ['administrator', 'manage_server', 'manage_roles', 'manage_channels', 'manage_nicknames', 'change_nickname'] },
  { label: 'Members', keys: ['kick_members', 'ban_members'] },
  { label: 'Content', keys: ['create_invites', 'manage_invites', 'manage_messages'] },
];

const CHANNEL_PERM_LABELS: Record<string, string> = {
  view_channel: 'View Channel',
  send_messages: 'Send Messages',
  read_message_history: 'Read History',
  embed_links: 'Embed Links',
  attach_files: 'Attach Files',
  add_reactions: 'Add Reactions',
  mention_everyone: 'Mention @everyone',
  manage_messages: 'Manage Messages',
  connect: 'Connect',
  speak: 'Speak',
  video: 'Video',
  mute_members: 'Mute Members',
  move_members: 'Move Members',
};

const CHANNEL_PERM_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Text', keys: ['view_channel', 'send_messages', 'read_message_history', 'embed_links', 'attach_files', 'add_reactions', 'mention_everyone', 'manage_messages'] },
  { label: 'Voice', keys: ['connect', 'speak', 'video', 'mute_members', 'move_members'] },
];

type OverrideState = 'neutral' | 'allow' | 'deny';

function cycleState(s: OverrideState): OverrideState {
  return s === 'neutral' ? 'allow' : s === 'allow' ? 'deny' : 'neutral';
}

function permStateFromMaps(key: string, allow: Record<string, boolean>, deny: Record<string, boolean>): OverrideState {
  if (allow[key]) return 'allow';
  if (deny[key]) return 'deny';
  return 'neutral';
}

function RolesTab({ isOwner }: { isOwner: boolean }) {
  const [customRoles, setCustomRoles] = useState<ApiCustomRole[]>([]);
  const [groups, setGroups] = useState<ApiMemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Create role form
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#6366f1');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Edit role state
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Expanded permissions
  const [expandedPerms, setExpandedPerms] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const [roles, members] = await Promise.all([fetchCustomRoles(), fetchMembers()]);
    setCustomRoles(roles);
    setGroups(members);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleRoleChange(memberName: string, value: string) {
    const roleValue = value === '' ? null : value;
    setPending(prev => new Set(prev).add(memberName));
    await setMemberRole(memberName, roleValue);
    setGroups(prev =>
      prev.map(g => ({
        ...g,
        users: g.users.map(u => u.name === memberName ? { ...u, role: roleValue } : u),
      }))
    );
    setPending(prev => { const n = new Set(prev); n.delete(memberName); return n; });
  }

  async function handleCreate() {
    const name = newRoleName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError('');
    const res = await createCustomRole(name, newRoleColor);
    if (res.ok) {
      setNewRoleName('');
      setNewRoleColor('#6366f1');
      await load();
    } else {
      setCreateError(res.error ?? 'Failed to create role');
    }
    setCreating(false);
  }

  function startEdit(role: ApiCustomRole) {
    setEditingRole(role.name);
    setEditName(role.name);
    setEditColor(role.color);
  }

  async function handleSaveEdit() {
    if (!editingRole) return;
    setEditSaving(true);
    const updates: { name?: string; color?: string } = {};
    if (editName.trim() !== editingRole) updates.name = editName.trim();
    if (editColor !== customRoles.find(r => r.name === editingRole)?.color) updates.color = editColor;
    await updateCustomRole(editingRole, updates);
    setEditingRole(null);
    setEditSaving(false);
    await load();
  }

  async function handleDeleteRole(name: string) {
    await deleteCustomRole(name);
    await load();
  }

  async function handleToggleHoist(role: ApiCustomRole) {
    await updateCustomRole(role.name, { hoist: !role.hoist });
    setCustomRoles(prev => prev.map(r => r.name === role.name ? { ...r, hoist: !r.hoist } : r));
  }

  async function handleTogglePerm(role: ApiCustomRole, key: string) {
    const newPerms = { ...role.permissions, [key]: !role.permissions[key] };
    await updateCustomRole(role.name, { permissions: newPerms });
    setCustomRoles(prev => prev.map(r => r.name === role.name ? { ...r, permissions: newPerms } : r));
  }

  function togglePermsExpanded(name: string) {
    setExpandedPerms(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  }

  async function handleDrop(toIdx: number) {
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const reordered = [...customRoles];
    const [removed] = reordered.splice(dragIdx, 1);
    reordered.splice(toIdx, 0, removed);
    setCustomRoles(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
    await reorderCustomRoles(reordered.map(r => r.name));
  }

  return (
    <div className={styles.content}>
      {!isOwner && <OwnerNotice />}

      {/* Role Definitions */}
      <div className={styles.sectionTitle}>Role Definitions</div>
      {isOwner && <div className={styles.emptyHint} style={{ marginBottom: 4 }}>Drag rows to reorder hierarchy (top = highest)</div>}
      {loading ? (
        <div className={styles.emptyHint}>Loading…</div>
      ) : (
        <div className={styles.roleDefList}>
          {customRoles.map((role, idx) => {
            const isEveryone = role.name === '@everyone';
            return (
            <div
              key={role.name}
              className={`${styles.roleDefRow} ${dragOverIdx === idx && dragIdx !== idx ? styles.roleDefRowDragOver : ''}`}
              draggable={isOwner && !isEveryone}
              onDragStart={() => { if (!isEveryone) { setDragIdx(idx); setDragOverIdx(null); } }}
              onDragOver={e => { e.preventDefault(); setDragOverIdx(idx); }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
            >
              {editingRole === role.name ? (
                <div className={styles.roleEditRow}>
                  <input
                    type="color"
                    value={editColor}
                    onChange={e => setEditColor(e.target.value)}
                    className={styles.colorPicker}
                  />
                  <input
                    className={styles.roleNameInput}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingRole(null); }}
                  />
                  <button className={styles.saveBtn} onClick={handleSaveEdit} disabled={editSaving}>
                    {editSaving ? '…' : 'Save'}
                  </button>
                  <button className={styles.cancelBtn} onClick={() => setEditingRole(null)}>✕</button>
                </div>
              ) : (
                <div className={styles.roleViewRow}>
                  {isOwner && !isEveryone && <span className={styles.dragHandle} title="Drag to reorder">⠿</span>}
                  <span className={styles.roleColorDot} style={{ background: role.color }} />
                  <span className={styles.roleDefName}>{role.name}</span>
                  {!isEveryone && (
                    <button
                      className={`${styles.hoistBtn} ${role.hoist ? styles.hoistBtnActive : ''}`}
                      onClick={() => isOwner && handleToggleHoist(role)}
                      title={role.hoist ? 'Hoisted (click to un-hoist)' : 'Not hoisted (click to hoist)'}
                      disabled={!isOwner}
                    >
                      {role.hoist ? '▲ Hoisted' : '▲'}
                    </button>
                  )}
                  <button
                    className={`${styles.permsToggle} ${expandedPerms.has(role.name) ? styles.permsToggleOpen : ''}`}
                    onClick={() => togglePermsExpanded(role.name)}
                    title="Permissions"
                  >
                    Perms
                  </button>
                  {isOwner && !isEveryone && (
                    <>
                      <button className={styles.editBtn} onClick={() => startEdit(role)} title="Rename / recolor">✎</button>
                      <button className={styles.dangerBtn} onClick={() => handleDeleteRole(role.name)} title="Delete role">🗑</button>
                    </>
                  )}
                </div>
              )}
              {expandedPerms.has(role.name) && (
                <div className={styles.permsPanel}>
                  {PERM_GROUPS.map(group => (
                    <div key={group.label}>
                      <div className={styles.permGroupLabel}>{group.label}</div>
                      {group.keys.map(key => (
                        <label key={key} className={styles.permRow}>
                          <input
                            type="checkbox"
                            checked={!!role.permissions[key]}
                            onChange={() => isOwner && handleTogglePerm(role, key)}
                            disabled={!isOwner}
                            className={styles.permCheck}
                          />
                          <span className={styles.permLabel}>{PERM_LABELS[key]}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ); })}
        </div>
      )}

      {/* Create new role */}
      {isOwner && (
        <div className={styles.createRoleRow}>
          <input
            type="color"
            value={newRoleColor}
            onChange={e => setNewRoleColor(e.target.value)}
            className={styles.colorPicker}
            title="Role color"
          />
          <input
            className={styles.roleNameInput}
            placeholder="New role name…"
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            maxLength={32}
          />
          <button className={styles.saveBtn} onClick={handleCreate} disabled={creating || !newRoleName.trim()}>
            {creating ? '…' : 'Create'}
          </button>
          {createError && <span className={styles.errorHint}>{createError}</span>}
        </div>
      )}

      {/* Member Assignments */}
      <div className={styles.sectionTitle} style={{ marginTop: 24 }}>Member Assignments</div>
      {loading ? null : groups.length === 0 ? (
        <div className={styles.emptyHint}>No members found.</div>
      ) : (
        <div className={styles.memberList}>
          {groups.map(group => (
            <div key={group.category} className={styles.memberGroup}>
              <div className={styles.groupLabel}>{group.category}</div>
              {group.users.map(user => (
                <div key={user.name} className={styles.memberRow}>
                  <div className={styles.memberAvatar}>{getInitials(user.name)}</div>
                  <span className={styles.memberName}>{user.name}</span>
                  <span
                    className={styles.roleBadge}
                    style={user.role
                      ? { color: customRoles.find(r => r.name === user.role)?.color ?? 'var(--text-3)', background: 'rgba(0,0,0,0.15)', border: '1px solid currentColor' }
                      : { color: 'var(--text-3)', background: 'rgba(92,99,112,0.12)', border: '1px solid rgba(92,99,112,0.2)' }
                    }
                  >
                    {user.role ?? 'None'}
                  </span>
                  <select
                    className={`${styles.roleSelect} ${pending.has(user.name) ? styles.roleSelectPending : ''}`}
                    value={user.role ?? ''}
                    onChange={e => handleRoleChange(user.name, e.target.value)}
                    disabled={pending.has(user.name) || !isOwner}
                  >
                    <option value="">None</option>
                    {customRoles.map(r => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Invites ───────────────────────────────────────────────────────────────────

function formatExpiry(expires_at: number | string | null): string {
  if (!expires_at) return '';
  const ms = typeof expires_at === 'number' ? expires_at * 1000 : new Date(expires_at).getTime();
  return ` · expires ${new Date(ms).toLocaleDateString()}`;
}

function InvitesTab({ isOwner }: { isOwner: boolean }) {
  const serverUrl = getServerUrl();
  const [invites, setInvites] = useState<ServerInvite[]>([]);
  const [listForbidden, setListForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newInvite, setNewInvite] = useState<{ url?: string; code?: string } | null>(null);

  async function load() {
    setLoading(true);
    const result = await listInvites(serverUrl);
    setInvites(result.invites);
    setListForbidden(result.forbidden);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setCreating(true);
    setNewInvite(null);
    const res = await createServerInvite(serverUrl);
    if (res.ok) {
      setNewInvite({ url: res.url, code: res.code });
      await load();
    }
    setCreating(false);
  }

  async function handleDelete(code: string) {
    await deleteServerInvite(serverUrl, code);
    await load();
  }

  function copyLink(url: string, code: string) {
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const myIdentity = getBeamIdentity();

  return (
    <div className={styles.content}>
      <div className={styles.sectionTitle}>Invite Links</div>

      {newInvite?.url && (
        <div style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 'var(--radius-s)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <div style={{ color: 'var(--text-2)', marginBottom: 6 }}>Invite created! Share this link:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ flex: 1, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{newInvite.url}</code>
            <button className={`${styles.btn} ${styles.btnAccent}`} style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => copyLink(newInvite.url!, newInvite.code!)}>
              {copiedCode === newInvite.code ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <button
        className={`${styles.btn} ${styles.btnAccent} ${creating ? styles.btnDisabled : ''}`}
        onClick={handleCreate}
        disabled={creating}
        style={{ marginBottom: 20 }}
      >
        {creating ? 'Creating…' : '+ Create Invite'}
      </button>

      {loading ? (
        <div className={styles.emptyHint}>Loading…</div>
      ) : listForbidden ? (
        <div className={styles.emptyHint}>Only the server owner can view all invites.</div>
      ) : invites.length === 0 ? (
        <div className={styles.emptyHint}>No active invites.</div>
      ) : (
        <div className={styles.catList}>
          {invites.map(inv => (
            <div key={inv.code} className={styles.catRow}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)', fontFamily: 'monospace' }}>{inv.code}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  by {inv.created_by} · {inv.use_count}{inv.max_uses != null ? `/${inv.max_uses}` : ''} uses
                  {formatExpiry(inv.expires_at)}
                </div>
              </div>
              <div className={styles.catActions}>
                <button
                  className={styles.iconBtn}
                  title={copiedCode === inv.code ? 'Copied!' : 'Copy link'}
                  onClick={() => copyLink(`${serverUrl}/join/${inv.code}`, inv.code)}
                >
                  {copiedCode === inv.code ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  )}
                </button>
                {(isOwner || inv.created_by === myIdentity) && (
                  <button
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    title="Delete invite"
                    onClick={() => handleDelete(inv.code)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

// ── Shared mini-components ────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, padding: 0, border: 'none',
        background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', flexShrink: 0, transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: 8, background: '#fff',
        transition: 'left 0.2s', display: 'block',
      }} />
    </button>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

type SaveState = 'idle' | 'saving' | 'ok' | 'err';

function SaveRow({ state, err, onSave, disabled }: { state: SaveState; err: string; onSave: () => void; disabled?: boolean }) {
  return (
    <div className={styles.rowEnd} style={{ marginTop: 10 }}>
      {state === 'ok'  && <span className={styles.feedbackOk}>Saved!</span>}
      {state === 'err' && <span className={styles.feedbackErr}>{err}</span>}
      <button
        className={`${styles.btn} ${styles.btnAccent} ${(state === 'saving' || disabled) ? styles.btnDisabled : ''}`}
        onClick={onSave}
        disabled={state === 'saving' || disabled}
      >
        {state === 'saving' ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

// ── Admin Tab ─────────────────────────────────────────────────────────────────

function AdminTab({ isOwner }: { isOwner: boolean }) {
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState('');

  // ── Server Info ───────────────────────────────────────────────────────────
  const [about,     setAbout]     = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [infoSave,  setInfoSave]  = useState<SaveState>('idle');
  const [infoErr,   setInfoErr]   = useState('');

  // ── Members ───────────────────────────────────────────────────────────────
  const [allowNewMembers,      setAllowNewMembers]      = useState(true);
  const [maxMembers,           setMaxMembers]           = useState('0');
  const [minAccountAgeDays,    setMinAccountAgeDays]    = useState('0');
  const [requireEmailVerified, setRequireEmailVerified] = useState(false);
  const [requirePhoneVerified, setRequirePhoneVerified] = useState(false);
  const [memberSave, setMemberSave] = useState<SaveState>('idle');
  const [memberErr,  setMemberErr]  = useState('');

  // ── Content ───────────────────────────────────────────────────────────────
  const [maxMessageLength, setMaxMessageLength] = useState('4000');
  const [maxUploadSize,    setMaxUploadSize]    = useState('8MB');
  const [allowBots,        setAllowBots]        = useState(true);
  const [contentSave, setContentSave] = useState<SaveState>('idle');
  const [contentErr,  setContentErr]  = useState('');

  // ── Invites ───────────────────────────────────────────────────────────────
  const [invitesAnyoneCanCreate,    setInvitesAnyoneCanCreate]    = useState(true);
  const [defaultInviteExpiryHours,  setDefaultInviteExpiryHours]  = useState('0');
  const [defaultInviteMaxUses,      setDefaultInviteMaxUses]      = useState('0');
  const [inviteSave, setInviteSave] = useState<SaveState>('idle');
  const [inviteErr,  setInviteErr]  = useState('');

  // ── Access Control ────────────────────────────────────────────────────────
  const [requireAge18,          setRequireAge18]          = useState(false);
  const [requireAgeGmail,       setRequireAgeGmail]       = useState(false);
  const [requireAgeId,          setRequireAgeId]          = useState(false);
  const [requirePhoneAccess,    setRequirePhoneAccess]    = useState(false);
  const [identityWhitelist,     setIdentityWhitelist]     = useState('');
  const [identityBlacklist,     setIdentityBlacklist]     = useState('');
  const [allowedEmailDomains,   setAllowedEmailDomains]   = useState('');
  const [accessSave, setAccessSave] = useState<SaveState>('idle');
  const [accessErr,  setAccessErr]  = useState('');

  useEffect(() => {
    fetchOwnerSettings().then((s: OwnerSettings | null) => {
      if (!s) { setLoadErr('Could not load settings. Are you the server owner?'); setLoading(false); return; }
      setAbout(s.about ?? '');
      setPublicUrl(s.public_url);
      setAllowNewMembers(s.allow_new_members);
      setMaxMembers(String(s.max_members));
      setMinAccountAgeDays(String(s.min_account_age_days));
      setRequireEmailVerified(s.require_email_verified);
      setRequirePhoneVerified(s.require_phone_verified);
      setMaxMessageLength(String(s.max_message_length));
      setMaxUploadSize(s.max_upload_size);
      setAllowBots(s.allow_bots);
      setInvitesAnyoneCanCreate(s.invites_anyone_can_create);
      setDefaultInviteExpiryHours(String(s.default_invite_expiry_hours));
      setDefaultInviteMaxUses(String(s.default_invite_max_uses));
      setRequireAge18(s.require_age_18_plus);
      setRequireAgeGmail(s.age_proof_methods.includes('gmail'));
      setRequireAgeId(s.age_proof_methods.includes('id'));
      setRequirePhoneAccess(s.require_phone_verified);
      setIdentityWhitelist(s.identity_whitelist.join('\n'));
      setIdentityBlacklist(s.identity_blacklist.join('\n'));
      setAllowedEmailDomains(s.allowed_email_domains.join('\n'));
      setLoading(false);
    });
  }, []);

  async function save(
    patch: Record<string, unknown>,
    setSave: (s: SaveState) => void,
    setErr: (e: string) => void,
  ) {
    setSave('saving');
    const res = await patchServerSettings(patch);
    if (res.ok) {
      setSave('ok');
      setTimeout(() => setSave('idle'), 1800);
    } else {
      setErr(res.error ?? 'Failed to save');
      setSave('err');
      setTimeout(() => setSave('idle'), 2500);
    }
  }

  function parseList(text: string): string[] {
    return text.split('\n').map(s => s.trim()).filter(Boolean);
  }

  if (loading)  return <div className={styles.content}><div className={styles.emptyHint}>Loading settings…</div></div>;
  if (loadErr)  return <div className={styles.content}><div className={styles.emptyHint} style={{ color: 'var(--red)' }}>{loadErr}</div></div>;

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box' };
  const textareaStyle: React.CSSProperties = { ...inputStyle, height: 130, resize: 'vertical', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14 };
  const numberInputStyle: React.CSSProperties = { width: 140, textAlign: 'right' };

  return (
    <div className={styles.content}>
      {!isOwner && <OwnerNotice />}

      {/* ── Server Info ── */}
      <div className={styles.sectionTitle}>Server Info</div>

      <SettingRow label="About" hint="Short description shown on the server info page">
        <span />
      </SettingRow>
      <textarea
        className={styles.input}
        style={textareaStyle}
        value={about}
        onChange={e => setAbout(e.target.value)}
        placeholder="A chill place to hang out."
        disabled={!isOwner}
      />

      <SettingRow label="Public URL" hint="The URL clients use to reach this server (used in invites and CORS)">
        <span />
      </SettingRow>
      <input
        className={styles.input}
        style={inputStyle}
        value={publicUrl}
        onChange={e => setPublicUrl(e.target.value)}
        placeholder="https://yourdomain.com"
        disabled={!isOwner}
      />

      {isOwner && (
        <SaveRow
          state={infoSave}
          err={infoErr}
          onSave={() => save({ about: about.trim() || null, public_url: publicUrl.trim() }, setInfoSave, setInfoErr)}
        />
      )}

      <div style={{ height: 8 }} />

      {/* ── Members ── */}
      <div className={styles.sectionTitle}>Members</div>

      <SettingRow label="Allow new members" hint="Turn off to prevent anyone from joining">
        <Toggle checked={allowNewMembers} onChange={setAllowNewMembers} disabled={!isOwner} />
      </SettingRow>

      <SettingRow label="Max members" hint="Maximum number of members (0 = unlimited)">
        <input
          className={styles.input}
          style={numberInputStyle}
          type="number" min={0}
          value={maxMembers}
          onChange={e => setMaxMembers(e.target.value)}
          disabled={!isOwner}
        />
      </SettingRow>

      <SettingRow label="Minimum account age (days)" hint="Reject accounts younger than this (0 = no requirement)">
        <input
          className={styles.input}
          style={numberInputStyle}
          type="number" min={0}
          value={minAccountAgeDays}
          onChange={e => setMinAccountAgeDays(e.target.value)}
          disabled={!isOwner}
        />
      </SettingRow>

      <SettingRow label="Require verified email" hint="Only allow users with a verified email address">
        <Toggle checked={requireEmailVerified} onChange={setRequireEmailVerified} disabled={!isOwner} />
      </SettingRow>

      {isOwner && (
        <SaveRow
          state={memberSave}
          err={memberErr}
          onSave={() => save({
            allow_new_members:      allowNewMembers,
            max_members:            Number(maxMembers)         || 0,
            min_account_age_days:   Number(minAccountAgeDays)  || 0,
            require_email_verified: requireEmailVerified,
          }, setMemberSave, setMemberErr)}
        />
      )}

      <div style={{ height: 8 }} />

      {/* ── Content & Limits ── */}
      <div className={styles.sectionTitle}>Content & Limits</div>

      <SettingRow label="Max message length (characters)">
        <input
          className={styles.input}
          style={numberInputStyle}
          type="number" min={1}
          value={maxMessageLength}
          onChange={e => setMaxMessageLength(e.target.value)}
          disabled={!isOwner}
        />
      </SettingRow>

      <SettingRow label="Max upload size" hint='e.g. "8MB", "500KB", "2GB"'>
        <input
          className={styles.input}
          style={{ width: 115, textAlign: 'right' }}
          value={maxUploadSize}
          onChange={e => setMaxUploadSize(e.target.value)}
          placeholder="8MB"
          disabled={!isOwner}
        />
      </SettingRow>

      <SettingRow label="Allow bots" hint="Let bot accounts connect using bot tokens">
        <Toggle checked={allowBots} onChange={setAllowBots} disabled={!isOwner} />
      </SettingRow>

      {isOwner && (
        <SaveRow
          state={contentSave}
          err={contentErr}
          onSave={() => save({
            max_message_length: Number(maxMessageLength) || 4000,
            max_upload_size:    maxUploadSize.trim(),
            allow_bots:         allowBots,
          }, setContentSave, setContentErr)}
        />
      )}

      <div style={{ height: 8 }} />

      {/* ── Invite Defaults ── */}
      <div className={styles.sectionTitle}>Invite Defaults</div>

      <SettingRow label="Anyone can create invites" hint="When off, only the owner can create invite links">
        <Toggle checked={invitesAnyoneCanCreate} onChange={setInvitesAnyoneCanCreate} disabled={!isOwner} />
      </SettingRow>

      <SettingRow label="Default expiry (hours)" hint="0 = never expires">
        <input
          className={styles.input}
          style={numberInputStyle}
          type="number" min={0}
          value={defaultInviteExpiryHours}
          onChange={e => setDefaultInviteExpiryHours(e.target.value)}
          disabled={!isOwner}
        />
      </SettingRow>

      <SettingRow label="Default max uses" hint="0 = unlimited uses">
        <input
          className={styles.input}
          style={numberInputStyle}
          type="number" min={0}
          value={defaultInviteMaxUses}
          onChange={e => setDefaultInviteMaxUses(e.target.value)}
          disabled={!isOwner}
        />
      </SettingRow>

      {isOwner && (
        <SaveRow
          state={inviteSave}
          err={inviteErr}
          onSave={() => save({
            invites_anyone_can_create:   invitesAnyoneCanCreate,
            default_invite_expiry_hours: Number(defaultInviteExpiryHours) || 0,
            default_invite_max_uses:     Number(defaultInviteMaxUses)     || 0,
          }, setInviteSave, setInviteErr)}
        />
      )}

      <div style={{ height: 8 }} />

      {/* ── Access Control ── */}
      <div className={styles.sectionTitle}>Access Control</div>

      <SettingRow label="18+ server" hint="Require users to confirm they are 18 or older to join">
        <Toggle checked={requireAge18} onChange={setRequireAge18} disabled={!isOwner} />
      </SettingRow>

      <SettingRow label="Require 18+ Gmail verification" hint="Only allow users whose age (18+) was verified via their Google account">
        <Toggle checked={requireAgeGmail} onChange={setRequireAgeGmail} disabled={!isOwner} />
      </SettingRow>

      <SettingRow label="Require 18+ ID verification" hint="Only allow users whose age (18+) was verified with a government-issued ID">
        <Toggle checked={requireAgeId} onChange={setRequireAgeId} disabled={!isOwner} />
      </SettingRow>

      <SettingRow label="Require phone verification" hint="Only allow users with a verified phone number linked to their account">
        <Toggle checked={requirePhoneAccess} onChange={setRequirePhoneAccess} disabled={!isOwner} />
      </SettingRow>

      <SettingRow label="Allowed email domains" hint="One domain per line — empty = any domain. Requires verified email.">
        <span />
      </SettingRow>
      <textarea
        className={styles.input}
        style={textareaStyle}
        value={allowedEmailDomains}
        onChange={e => setAllowedEmailDomains(e.target.value)}
        placeholder={"example.com\nmyschool.edu"}
        disabled={!isOwner}
      />

      <SettingRow label="Identity whitelist" hint="One beam identity per line — only these users can join (leave empty for open)">
        <span />
      </SettingRow>
      <textarea
        className={styles.input}
        style={textareaStyle}
        value={identityWhitelist}
        onChange={e => setIdentityWhitelist(e.target.value)}
        placeholder={"alice»ab12\nbob»cd34"}
        disabled={!isOwner}
      />

      <SettingRow label="Identity blacklist" hint="One beam identity per line — these users are always denied, even with an invite">
        <span />
      </SettingRow>
      <textarea
        className={styles.input}
        style={textareaStyle}
        value={identityBlacklist}
        onChange={e => setIdentityBlacklist(e.target.value)}
        placeholder={"spammer»xx99"}
        disabled={!isOwner}
      />

      {isOwner && (
        <SaveRow
          state={accessSave}
          err={accessErr}
          onSave={() => {
            const ageMethods: string[] = [];
            if (requireAgeGmail) ageMethods.push('gmail');
            if (requireAgeId)    ageMethods.push('id');
            save({
              require_age_18_plus:    requireAge18,
              require_phone_verified: requirePhoneAccess,
              age_proof_methods:      ageMethods,
              allowed_email_domains:  parseList(allowedEmailDomains),
              identity_whitelist:     parseList(identityWhitelist),
              identity_blacklist:     parseList(identityBlacklist),
            }, setAccessSave, setAccessErr);
          }}
        />
      )}

      <div style={{ height: 16 }} />
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ServerSettingsModal({ serverName, onClose, onRefresh, initialTab }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    const me = getBeamIdentity();
    fetchServerInfo(getServerUrl()).then(info => {
      if (info && me) {
        const ownerField = info.owner_beam_identity ?? info.owner;
        setIsOwner(!!ownerField && ownerField === me);
      }
    });
  }, []);

  const NAV_ITEMS: { id: Tab; label: string; ownerOnly?: boolean }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'categories', label: 'Categories' },
    { id: 'channels',   label: 'Channels' },
    { id: 'roles',      label: 'Roles' },
    { id: 'invites',    label: 'Invites' },
    { id: 'admin',      label: 'Admin Settings', ownerOnly: true },
  ].filter(item => !item.ownerOnly || isOwner);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {/* Left nav */}
        <nav className={styles.sidebar}>
          <div className={styles.sidebarServerName}>{serverName}</div>
          <div className={styles.navList}>
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`${styles.navItem} ${tab === item.id ? styles.navItemActive : ''}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Right content */}
        <div className={styles.main}>
          <div className={styles.mainHeader}>
            <span className={styles.mainTitle}>
              {NAV_ITEMS.find(n => n.id === tab)?.label}
            </span>
            <button className={styles.closeBtn} onClick={onClose}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {tab === 'overview' && (
            <OverviewTab serverName={serverName} onRefresh={onRefresh} isOwner={isOwner} />
          )}
          {tab === 'categories' && (
            <CategoriesTab onRefresh={onRefresh} isOwner={isOwner} />
          )}
          {tab === 'channels' && (
            <ChannelsTab isOwner={isOwner} />
          )}
          {tab === 'roles' && (
            <RolesTab isOwner={isOwner} />
          )}
          {tab === 'invites' && (
            <InvitesTab isOwner={isOwner} />
          )}
          {tab === 'admin' && (
            <AdminTab isOwner={isOwner} />
          )}
        </div>
      </div>
    </div>
  );
}
