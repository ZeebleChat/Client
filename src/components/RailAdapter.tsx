/**
 * Rail adapter - adapts API server format for the legacy Rail component.
 * Renders server list with initials derived from server names.
 * Supports right-click context menu for server actions (leave server).
 */
import { useState, useEffect, type MouseEvent } from 'react';
import type { ApiServer } from '../api';
import { getServerAttachmentUrl } from '../api';
import { getChatToken } from '../auth';
import styles from './Rail.module.css';
import railStyles from './RailAdapter.module.css';

interface Props {
  servers: ApiServer[];
  activeServerUrl: string;
  view: 'server' | 'home';
  onSelectServer: (url: string, name: string) => void;
  onLogout: () => void;
  onAddServer?: () => void;
  onHome?: () => void;
  onOpenAccount?: () => void;
  onLeaveServer?: (serverUrl: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  serverUrl: string;
  serverName: string;
}

/** Returns up to 2 initials from a server name */
function serverInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Map of serverUrl → icon src (data URL or attachment URL), null if none */
const _iconCache = new Map<string, string | null>();

export default function RailAdapter({ servers, activeServerUrl, view, onSelectServer, onHome, onLeaveServer, onAddServer }: Props) {
  const [icons, setIcons] = useState<Record<string, string | null>>({});

  // Fetch server icons from /server/info for each server
  useEffect(() => {
    let alive = true;
    async function loadIcons() {
      const updates: Record<string, string | null> = {};
      await Promise.all(servers.map(async (server) => {
        if (_iconCache.has(server.server_url)) {
          updates[server.server_url] = _iconCache.get(server.server_url) ?? null;
          return;
        }
        try {
          const res = await fetch(`${server.server_url}/server/info`, { signal: AbortSignal.timeout(4000) });
          if (!res.ok) { _iconCache.set(server.server_url, null); updates[server.server_url] = null; return; }
          const info = await res.json();
          if (info.logo_attachment_id) {
            const url = getServerAttachmentUrl(server.server_url, info.logo_attachment_id);
            _iconCache.set(server.server_url, url);
            updates[server.server_url] = url;
          } else {
            _iconCache.set(server.server_url, null);
            updates[server.server_url] = null;
          }
        } catch {
          _iconCache.set(server.server_url, null);
          updates[server.server_url] = null;
        }
      }));
      if (alive) setIcons(prev => ({ ...prev, ...updates }));
    }
    loadIcons();
    return () => { alive = false; };
  }, [servers]);

  // Invalidate icon cache for active server when chat token changes (after exchange)
  useEffect(() => {
    if (activeServerUrl) _iconCache.delete(activeServerUrl);
  }, [activeServerUrl, getChatToken(activeServerUrl)]);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    serverUrl: '',
    serverName: '',
  });

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu.visible) return;
    function handleClick() {
      setContextMenu(prev => ({ ...prev, visible: false }));
    }
    // Delay to avoid immediate close on right-click
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [contextMenu.visible]);

  // Close context menu on Escape key
  useEffect(() => {
    if (!contextMenu.visible) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu.visible]);

  function handleContextMenu(e: MouseEvent, server: ApiServer) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      serverUrl: server.server_url,
      serverName: server.server_name,
    });
  }

  function handleLeaveServer() {
    if (contextMenu.serverUrl && onLeaveServer) {
      onLeaveServer(contextMenu.serverUrl);
    }
    setContextMenu(prev => ({ ...prev, visible: false }));
  }

  return (
    <nav className={styles.rail} role="navigation" aria-label="Server navigation">
      {/* Z button - always opens home/friends view */}
      <button
        className={styles.brand}
        onClick={onHome}
        title="Friends List"
        aria-label="Open friends list"
        style={{ cursor: 'pointer' }}
      >
        Z
      </button>
      <div className={styles.sep} />

      {servers.map(server => {
        const isActive = view === 'server' && server.server_url === activeServerUrl;
        const iconUrl = icons[server.server_url];
        return (
          <button
            key={server.server_url}
            className={`${styles.node} ${isActive ? styles.active : ''} ${iconUrl ? railStyles.nodeWithIcon : ''}`}
            title={server.server_name}
            onClick={() => onSelectServer(server.server_url, server.server_name)}
            onContextMenu={(e) => handleContextMenu(e, server)}
            aria-label={`Select ${server.server_name} server`}
          >
            {iconUrl ? (
              <img
                src={iconUrl}
                alt={server.server_name}
                className={railStyles.serverIcon}
                onError={() => {
                  _iconCache.set(server.server_url, null);
                  setIcons(prev => ({ ...prev, [server.server_url]: null }));
                }}
              />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {serverInitials(server.server_name)}
              </span>
            )}
          </button>
        );
      })}

      {servers.length === 0 && (
        <button className={styles.node} title="Add Server" onClick={onAddServer} aria-label="Add server">
          <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
        </button>
      )}

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          aria-label="Server actions"
        >
          <button
            className={styles.contextMenuItem}
            onClick={handleLeaveServer}
            role="menuitem"
          >
            Leave Server
          </button>
        </div>
      )}
    </nav>
  );
}
