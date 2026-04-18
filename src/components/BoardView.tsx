import { useState, useEffect, useRef } from 'react';
import type { ApiMessage } from '../api';
import { fetchBoardPosts, fetchPostReplies } from '../api';
import { formatTime } from '../types';
import UserAvatar from './UserAvatar';
import { getRoleColor } from '../api';
import styles from './BoardView.module.css';

interface Props {
  channelId: string | number;
  channelName: string;
  // live messages pushed from WS (new posts + replies land here)
  liveMessages: ApiMessage[];
  onCreatePost: (title: string, content: string) => void;
  onReply: (content: string, replyTo: string | number) => void;
  roleMap?: Record<string, string | null | undefined>;
}

function timeAgo(raw: number | string): string {
  const ms = typeof raw === 'number' ? raw * 1000 : new Date(raw).getTime();
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function getColor(beamIdentity: string, roleMap?: Record<string, string | null | undefined>) {
  return getRoleColor(roleMap?.[beamIdentity]);
}

// ── New Post Modal ────────────────────────────────────────────────────────────

function NewPostModal({ onSubmit, onClose }: { onSubmit: (title: string, content: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  function submit() {
    const t = title.trim();
    const c = content.trim();
    if (!t) return;
    onSubmit(t, c);
    onClose();
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={styles.modalBackdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>New Post</span>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <label className={styles.label}>Title</label>
          <input
            className={styles.titleInput}
            placeholder="Give your post a title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
            maxLength={200}
          />
          <label className={styles.label}>Content <span className={styles.optional}>(optional)</span></label>
          <textarea
            className={styles.contentInput}
            placeholder="What's on your mind?"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={5}
          />
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button className={styles.submitBtn} onClick={submit} disabled={!title.trim()}>Post</button>
        </div>
      </div>
    </div>
  );
}

// ── Thread View ───────────────────────────────────────────────────────────────

function ThreadView({
  post,
  channelId,
  liveMessages,
  onReply,
  onBack,
  roleMap,
}: {
  post: ApiMessage;
  channelId: string | number;
  liveMessages: ApiMessage[];
  onReply: (content: string, replyTo: string | number) => void;
  onBack: () => void;
  roleMap?: Record<string, string | null | undefined>;
}) {
  const [replies, setReplies] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetchPostReplies(channelId, post.id).then(r => {
      setReplies(r);
      setLoading(false);
    });
  }, [channelId, post.id]);

  // merge live replies as they arrive (skip optimistic opt-xxx IDs)
  useEffect(() => {
    const live = liveMessages.filter(
      m => String(m.reply_to) === String(post.id) &&
           !String(m.id).startsWith('opt-') &&
           !replies.some(r => String(r.id) === String(m.id))
    );
    if (live.length) setReplies(prev => [...prev, ...live]);
  }, [liveMessages, post.id, replies]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [replies]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    onReply(text, post.id);
    setInput('');
  }

  const postColor = getColor(post.beam_identity, roleMap);
  const authorName = post.beam_identity.split('»')[0] || post.beam_identity;

  return (
    <div className={styles.thread}>
      {/* Header */}
      <div className={styles.threadHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to posts
        </button>
      </div>

      <div className={styles.threadBody}>
        {/* Original post */}
        <div className={styles.postCard} style={{ marginBottom: 24 }}>
          {post.title && <h2 className={styles.postTitle}>{post.title}</h2>}
          <div className={styles.postMeta}>
            <UserAvatar name={post.beam_identity} size={28} radius={8} color={postColor} />
            <span className={styles.postAuthor} style={{ color: postColor }}>{authorName}</span>
            <span className={styles.postTime}>{formatTime(post.created_at)}</span>
          </div>
          {post.content && <p className={styles.postContent}>{post.content}</p>}
        </div>

        <div className={styles.replyDivider}>
          <span>{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
        </div>

        {/* Replies */}
        {loading && <div className={styles.empty}>Loading replies…</div>}
        {!loading && replies.length === 0 && <div className={styles.empty}>No replies yet. Be the first!</div>}
        <div className={styles.replies}>
          {replies.map(r => {
            const color = getColor(r.beam_identity, roleMap);
            const name = r.beam_identity.split('»')[0] || r.beam_identity;
            return (
              <div key={String(r.id)} className={styles.replyRow}>
                <UserAvatar name={r.beam_identity} size={32} radius={10} color={color} />
                <div className={styles.replyContent}>
                  <div className={styles.replyMeta}>
                    <span className={styles.replyAuthor} style={{ color }}>{name}</span>
                    <span className={styles.replyTime}>{timeAgo(r.created_at)}</span>
                  </div>
                  <p className={styles.replyText}>{r.content}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Reply input */}
      <div className={styles.replyInputArea}>
        <div className={styles.replyInputCapsule}>
          <input
            className={styles.replyInput}
            placeholder="Write a reply…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button className={styles.replySendBtn} onClick={handleSend} disabled={!input.trim()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(45)">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Board Post List ───────────────────────────────────────────────────────────

export default function BoardView({ channelId, channelName, liveMessages, onCreatePost, onReply, roleMap }: Props) {
  const [posts, setPosts] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewPost, setShowNewPost] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ApiMessage | null>(null);

  useEffect(() => {
    setSelectedPost(null);
    setLoading(true);
    fetchBoardPosts(channelId).then(p => {
      setPosts(p);
      setLoading(false);
    });
  }, [channelId]);

  // merge new top-level posts that arrive live (skip optimistic opt-xxx IDs)
  useEffect(() => {
    const newPosts = liveMessages.filter(
      m => m.channel_id != null &&
           String(m.channel_id) === String(channelId) &&
           (m.reply_to == null) &&
           !String(m.id).startsWith('opt-') &&
           !posts.some(p => String(p.id) === String(m.id))
    );
    if (newPosts.length) setPosts(prev => [...newPosts.reverse(), ...prev]);
  }, [liveMessages, channelId, posts]);

  if (selectedPost) {
    return (
      <ThreadView
        post={selectedPost}
        channelId={channelId}
        liveMessages={liveMessages}
        onReply={onReply}
        onBack={() => setSelectedPost(null)}
        roleMap={roleMap}
      />
    );
  }

  return (
    <div className={styles.board}>
      {/* Header */}
      <div className={styles.boardHeader}>
        <div className={styles.boardHeaderLeft}>
          <svg className={styles.boardIcon} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span className={styles.boardName}>{channelName}</span>
        </div>
        <button className={styles.newPostBtn} onClick={() => setShowNewPost(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Post
        </button>
      </div>

      {/* Post list */}
      <div className={styles.postList}>
        {loading && <div className={styles.empty}>Loading posts…</div>}
        {!loading && posts.length === 0 && (
          <div className={styles.emptyBoard}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-3)', marginBottom: 12 }}>
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            <p>No posts yet.</p>
            <button className={styles.newPostBtn} onClick={() => setShowNewPost(true)}>Create the first post</button>
          </div>
        )}
        {posts.map(post => {
          const color = getColor(post.beam_identity, roleMap);
          const name = post.beam_identity.split('»')[0] || post.beam_identity;
          const replyCount = liveMessages.filter(m => String(m.reply_to) === String(post.id)).length;
          return (
            <button key={String(post.id)} className={styles.postCard} onClick={() => setSelectedPost(post)}>
              <div className={styles.postCardTop}>
                <h3 className={styles.postCardTitle}>{post.title || post.content}</h3>
              </div>
              {post.title && post.content && (
                <p className={styles.postCardPreview}>{post.content.slice(0, 120)}{post.content.length > 120 ? '…' : ''}</p>
              )}
              <div className={styles.postCardMeta}>
                <UserAvatar name={post.beam_identity} size={20} radius={6} color={color} />
                <span className={styles.postCardAuthor} style={{ color }}>{name}</span>
                <span className={styles.postCardTime}>{timeAgo(post.created_at)}</span>
                {replyCount > 0 && (
                  <span className={styles.postCardReplies}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    {replyCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {showNewPost && (
        <NewPostModal
          onSubmit={(title, content) => { onCreatePost(title, content); }}
          onClose={() => setShowNewPost(false)}
        />
      )}
    </div>
  );
}
