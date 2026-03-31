/**
 * Members sidebar component.
 * Displays server members grouped by status (Online/Offline) or role.
 * Clicking a member opens a popup with profile actions.
 */
import { useState } from 'react';
import type { ApiMemberGroup } from '../api';
import { getRoleColor } from '../api';
import { statusClass } from '../types';
import UserAvatar from './UserAvatar';
import UserPopup, { type UserPopupInfo, type UserPopupPos } from './UserPopup';
import styles from './Members.module.css';

interface PopupState { user: UserPopupInfo; pos: UserPopupPos; }

function shortName(beam: string) {
  const idx = beam.indexOf('»');
  return idx > 0 ? beam.slice(0, idx) : beam;
}

interface Props {
groups: ApiMemberGroup[];
onDm?: (name: string) => void;
}

export default function Members({ groups, onDm }: Props) {
  const total = groups.reduce((n, g) => n + g.users.length, 0);
  const [popup, setPopup] = useState<PopupState | null>(null);

  function handleClick(e: React.MouseEvent, user: UserPopupInfo) {
    setPopup({ user, pos: { x: e.clientX, y: e.clientY } });
  }

  return (
    <aside className={styles.members}>
      <div className={styles.memHeader}>MEMBERS — {total}</div>
      <div className={styles.memList}>
        {groups.map(group => (
          <div key={group.category}>
            <div className={styles.memCat}>{group.category} — {group.users.length}</div>
            {group.users.map(member => {
              const color = member.role ? getRoleColor(member.role) : undefined;
              const sc = statusClass(member.status);
              return (
                <button
                  key={member.name}
                  className={styles.memItem}
                  onClick={e => handleClick(e, { name: member.name, role: member.role, status: member.status })}
                >
                  <div className={styles.memAvWrap}>
                    <UserAvatar name={member.name} size={32} radius={10} color={color} className={styles.memAv} />
                    <div className={`${styles.memDot} ${styles[sc]}`} />
                  </div>
                  <div className={styles.memInfo}>
                    <div className={styles.memU} style={color ? { color } : undefined}>
                      {shortName(member.name)}
                      {member.is_owner && (
                        <span title="Server Owner" style={{ marginLeft: 4, fontSize: 11, color: '#f59e0b' }}>👑</span>
                      )}
                    </div>
                    {member.status && member.status !== 'online' && (
                      <div className={styles.memStat}>{member.status}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        {groups.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '24px 12px', textAlign: 'center' }}>
            No members loaded
          </div>
        )}
      </div>

      {popup && (
        <UserPopup
          user={popup.user}
          pos={popup.pos}
          onClose={() => setPopup(null)}
          onDm={onDm}
        />
      )}
    </aside>
  );
}
