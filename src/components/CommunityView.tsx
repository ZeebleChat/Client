import React, { useState, useEffect, useRef } from 'react';
import jsYaml from 'js-yaml';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';
import type { UseResourcePackReturn } from '../hooks/useResourcePack';
import type { PackMeta } from '../resourcePack';
import {
  fetchMarketListings,
  uploadPack,
  type MarketPackListing,
  getAccountInfo,
  type ApiAccountInfo,
  createSubscription,
  confirmSubscriptionPayment,
  buyIchorCheckout,
  redeemIchorForPremium,
  redeemPromoCode,
} from '../api';
import styles from './CommunityView.module.css';

const stripePromise = loadStripe('pk_live_51TDqoL3D524x7zwNWBF2QWsFCixoCww15vFqIvCX6nGv0NIMw51zgM3OakA7sop5Jw6LQ3XDP8GYBftKPQc21C0500U3iLuR2O');

// ─── Types ────────────────────────────────────────────────────────────────────

type CommunityTab = 'market' | 'find-people' | 'packs' | 'my-packs' | 'shop';

type PackCategory = 'emojis' | 'server-packs' | 'stickers' | 'animated-emotes' | 'zeeble-icons' | 'account-flair' | 'theme-packs';

const PACK_CATEGORIES: { id: PackCategory; label: string }[] = [
  { id: 'theme-packs',    label: 'Theme Packs'    },
  { id: 'emojis',         label: 'Emojis'         },
  { id: 'server-packs',   label: 'Server Packs'   },
  { id: 'stickers',       label: 'Stickers'       },
  { id: 'animated-emotes',label: 'Animated Emotes'},
  { id: 'zeeble-icons',   label: 'Zeeble Icons'   },
  { id: 'account-flair',  label: 'Account Flair'  },
];

interface PackItem { name: string; sub: string; preview: string; price: number; }

const PACKS: Record<PackCategory, PackItem[]> = {
  'theme-packs':    [],
  'emojis':         [],
  'server-packs':   [],
  'stickers':       [],
  'animated-emotes':[],
  'zeeble-icons':   [],
  'account-flair':  [],
};

// ─── Built-in / owned theme packs ─────────────────────────────────────────────

interface OwnedPack {
  name: string;
  author: string;
  version: string;
  description: string;
  preview: string;
  baseUrl: string;
  price: number;
}

const BUILT_IN_PACKS: OwnedPack[] = [
  {
    name: 'Dark Midnight',
    author: 'Creeper7',
    version: '1.0.0',
    description: 'A sleek dark theme with purple accents and custom sounds',
    preview: '🌙',
    baseUrl: '/packs/dark_midnight/',
    price: 0,
  },
  {
    name: 'Monitor 1999',
    author: 'Creeper7',
    version: '1.0.0',
    description: 'Phosphor-green CRT monitor aesthetic inspired by retro terminal tech',
    preview: '🖥️',
    baseUrl: '/packs/monitor_1999/',
    price: 0,
  },
];

// ─── Market data ──────────────────────────────────────────────────────────────

type MarketCategory = 'all' | PackCategory;

interface MarketListing {
  id: string;
  name: string;
  preview: string;
  type: string;
  seller: string;
  sellerAvatar: string;
  price: number;
  sales: number;
  tags: string[];
  baseUrl?: string; // present for theme packs — triggers Load instead of Buy
}


const MARKET_FILTER_CATEGORIES: { id: MarketCategory; label: string }[] = [
  { id: 'all',             label: 'All'          },
  { id: 'theme-packs',     label: 'Themes'       },
  { id: 'emojis',          label: 'Emojis'       },
  { id: 'stickers',        label: 'Stickers'     },
  { id: 'server-packs',    label: 'Server Packs' },
  { id: 'animated-emotes', label: 'Animated'     },
  { id: 'account-flair',   label: 'Flair'        },
  { id: 'zeeble-icons',    label: 'Icons'        },
];

type SortOption = 'popular' | 'newest' | 'price-asc' | 'price-desc';

// ─── List a Pack modal ────────────────────────────────────────────────────────

type ListStep = 'pick' | 'details';

function ListPackModal({ onClose, onListed }: { onClose: () => void; onListed: () => void }) {
  const folderInputRef              = useRef<HTMLInputElement>(null);
  const [step, setStep]             = useState<ListStep>('pick');
  const [files, setFiles]           = useState<File[]>([]);
  const [parsedMeta, setParsedMeta] = useState<PackMeta | null>(null);
  const [name, setName]             = useState('');
  const [category, setCategory]     = useState<PackCategory>('theme-packs');
  const [price, setPrice]           = useState('');
  const [preview, setPreview]       = useState('');
  const [desc, setDesc]             = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  async function handleFolderSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const allFiles = Array.from(fileList);

    // Find pack.yaml — strip the root folder prefix from webkitRelativePath
    const packYamlFile = allFiles.find(f => {
      const parts = f.webkitRelativePath.split('/');
      return parts.slice(1).join('/') === 'pack.yaml';
    });

    if (!packYamlFile) {
      setError('No pack.yaml found in the selected folder.');
      return;
    }

    let meta: PackMeta;
    try {
      const text = await packYamlFile.text();
      meta = jsYaml.load(text) as PackMeta;
    } catch {
      setError('Could not parse pack.yaml.');
      return;
    }

    if (meta.id) {
      setError('This is a purchased pack and cannot be relisted.');
      return;
    }

    setFiles(allFiles);
    setParsedMeta(meta);
    setName(meta.name || '');
    setDesc(meta.description || '');
    setPreview('📦');
    setCategory('theme-packs');
    setStep('details');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;
    setSubmitting(true);
    setError('');

    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('category', category);
    formData.append('price_ichor', String(parseInt(price, 10) || 0));
    if (desc.trim()) formData.append('description', desc.trim());
    if (preview.trim()) formData.append('preview_emoji', preview.trim());

    for (const file of files) {
      // Strip the root folder name: "my_pack/colors.yaml" → "colors.yaml"
      const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
      if (relativePath) formData.append('files', file, relativePath);
    }

    const result = await uploadPack(formData);
    setSubmitting(false);
    if (result.ok) {
      onListed();
      onClose();
    } else {
      setError(result.error ?? 'Something went wrong');
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>List a Pack</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {step === 'pick' ? (
          <div className={styles.modalForm}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              Select your pack folder. Packs with a market ID (purchased packs) cannot be relisted.
            </p>
            <input
              ref={folderInputRef}
              type="file"
              style={{ display: 'none' }}
              // @ts-expect-error webkitdirectory is not in React's typings
              webkitdirectory=""
              multiple
              onChange={handleFolderSelect}
            />
            <button className={styles.btnPrimary} onClick={() => folderInputRef.current?.click()}>
              Select Pack Folder
            </button>
            {error && <p className={styles.formError} style={{ marginTop: 12 }}>{error}</p>}
          </div>
        ) : (
          <form className={styles.modalForm} onSubmit={handleSubmit}>
            {parsedMeta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '8px 12px', background: 'var(--bg-elevated, #252525)', borderRadius: 8 }}>
                <span style={{ fontSize: 22 }}>{preview}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{parsedMeta.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{files.length} files selected</div>
                </div>
              </div>
            )}
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Pack Name</label>
              <input className={styles.formInput} value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Category</label>
              <select className={styles.formSelect} value={category} onChange={e => setCategory(e.target.value as PackCategory)}>
                {PACK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Preview Emoji</label>
              <input className={styles.formInput} placeholder="📦" value={preview} onChange={e => setPreview(e.target.value)} />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Price (Ichor)</label>
              <div className={styles.priceInputWrap}>
                <span className={styles.priceIcon}>◈</span>
                <input className={`${styles.formInput} ${styles.priceInput}`} placeholder="0" type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} required />
              </div>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Description <span className={styles.formOptional}>(optional)</span></label>
              <textarea className={styles.formTextarea} placeholder="Describe what's in the pack..." value={desc} onChange={e => setDesc(e.target.value)} rows={3} />
            </div>
            {error && <p className={styles.formError}>{error}</p>}
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnGhost} onClick={() => setStep('pick')} disabled={submitting}>Back</button>
              <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                {submitting ? 'Uploading…' : 'List Pack'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Market tab ───────────────────────────────────────────────────────────────

function marketListingFromApi(l: MarketPackListing): MarketListing {
  return {
    id: l.id,
    name: l.name,
    preview: l.preview_emoji,
    type: l.category,
    seller: l.author_display_name,
    sellerAvatar: l.author_display_name.charAt(0).toUpperCase(),
    price: l.price_ichor,
    sales: l.sales,
    tags: [l.category],
    baseUrl: l.pack_url ?? undefined,
  };
}

function MarketTab({ resourcePack }: { resourcePack: UseResourcePackReturn }) {
  const [filter, setFilter]       = useState<MarketCategory>('all');
  const [sort, setSort]           = useState<SortOption>('popular');
  const [search, setSearch]       = useState('');
  const [showList, setShowList]   = useState(false);
  const [listings, setListings]   = useState<MarketListing[]>([]);
  const [fetching, setFetching]   = useState(true);
  const { activePack, loading, loadPack } = resourcePack;

  const ichor = 0;

  async function loadListings() {
    setFetching(true);
    const raw = await fetchMarketListings();
    setListings(raw.map(marketListingFromApi));
    setFetching(false);
  }

  useEffect(() => { loadListings(); }, []);

  const filtered = listings
    .filter(l => filter === 'all' || l.tags.includes(filter))
    .filter(l => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.seller.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'popular')    return b.sales - a.sales;
      if (sort === 'price-asc')  return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return 0;
    });

  return (
    <div className={styles.tabContent}>
      <div className={styles.marketHeader}>
        <div className={styles.marketTitleGroup}>
          <h1 className={styles.tabTitle}>Community Market</h1>
          <p className={styles.tabSubtitle}>Buy and sell packs made by the community</p>
        </div>
        <div className={styles.marketHeaderRight}>
          <div className={styles.ichorBadge}>
            <span className={styles.ichorIcon}>◈</span>
            <span className={styles.ichorValue}>{ichor.toLocaleString()}</span>
            <span className={styles.ichorLabel}>Ichor</span>
          </div>
          <button className={styles.btnPrimary} onClick={() => setShowList(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            List a Pack
          </button>
        </div>
      </div>

      <div className={styles.marketControls}>
        <div className={styles.marketSearchWrap}>
          <svg className={styles.marketSearchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input className={styles.marketSearch} placeholder="Search packs or sellers…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={styles.sortSelect} value={sort} onChange={e => setSort(e.target.value as SortOption)}>
          <option value="popular">Most Popular</option>
          <option value="newest">Newest</option>
          <option value="price-asc">Price: Low → High</option>
          <option value="price-desc">Price: High → Low</option>
        </select>
      </div>

      <div className={styles.packCategoryBar}>
        {MARKET_FILTER_CATEGORIES.map(c => (
          <button key={c.id} className={`${styles.packCategoryBtn} ${filter === c.id ? styles.packCategoryBtnActive : ''}`} onClick={() => setFilter(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {fetching ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>Loading listings…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>🔍</span>
          <p className={styles.emptyText}>No listings match your search.</p>
        </div>
      ) : (
        <div className={styles.marketGrid}>
          {filtered.map(listing => {
            const isActive = listing.baseUrl && activePack?.baseUrl === listing.baseUrl;
            const isTheme  = !!listing.baseUrl;
            return (
              <div key={listing.id} className={styles.marketCard}>
                <div className={styles.marketCardPreview}>{listing.preview}</div>
                <div className={styles.marketCardName}>{listing.name}</div>
                <div className={styles.marketCardType}>{listing.type}</div>
                <div className={styles.marketCardSeller}>
                  <span className={styles.marketSellerAvatar}>{listing.sellerAvatar}</span>
                  <span className={styles.marketSellerName}>{listing.seller}</span>
                </div>
                <div className={styles.marketCardFooter}>
                  <div className={styles.marketCardPrice}>
                    {listing.price === 0
                      ? <span className={styles.freeLabel}>Free</span>
                      : <><span className={styles.ichorIconSm}>◈</span>{listing.price.toLocaleString()}</>
                    }
                  </div>
                  {isTheme ? (
                    isActive ? (
                      <button className={`${styles.marketCardBtn} ${styles.marketCardBtnActive}`} disabled>Active</button>
                    ) : (
                      <button
                        className={styles.marketCardBtn}
                        disabled={loading}
                        onClick={() => loadPack(listing.baseUrl!)}
                      >
                        {loading ? '…' : 'Load'}
                      </button>
                    )
                  ) : (
                    <button className={styles.marketCardBtn}>Buy</button>
                  )}
                </div>
                {listing.sales > 0 && <div className={styles.marketCardSales}>{listing.sales} sold</div>}
              </div>
            );
          })}
        </div>
      )}

      {showList && <ListPackModal onClose={() => setShowList(false)} onListed={loadListings} />}
    </div>
  );
}

// ─── My Packs tab ─────────────────────────────────────────────────────────────

interface LocalPackInfo {
  folderName: string;
  baseUrl: string;
  meta?: { name: string; author: string; version: string; description?: string };
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function MyPacksTab({ resourcePack }: { resourcePack: UseResourcePackReturn }) {
  const { activePack, loading, loadPack, unloadPack } = resourcePack;
  const [localPacks, setLocalPacks]   = useState<LocalPackInfo[]>([]);
  const [packsDir, setPacksDir]       = useState('');
  const [scanDone, setScanDone]       = useState(false);

  async function scanLocalPacks() {
    if (!isTauri) { setScanDone(true); return; }
    try {
      const [names, dir] = await Promise.all([
        invoke<string[]>('list_local_packs'),
        invoke<string>('get_packs_dir'),
      ]);
      setPacksDir(dir);
      const infos = await Promise.all(names.map(async (folderName): Promise<LocalPackInfo> => {
        const baseUrl = `packs://localhost/${folderName}/`;
        try {
          const res = await fetch(`${baseUrl}pack.yaml`);
          const text = await res.text();
          const meta = jsYaml.load(text) as { name: string; author: string; version: string; description?: string };
          return { folderName, baseUrl, meta };
        } catch {
          return { folderName, baseUrl };
        }
      }));
      setLocalPacks(infos);
    } catch { /* not in Tauri or command missing */ }
    setScanDone(true);
  }

  useEffect(() => { scanLocalPacks(); }, []);

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h1 className={styles.tabTitle}>My Packs</h1>
        <p className={styles.tabSubtitle}>Your owned and installed theme packs</p>
      </div>

      {activePack && (
        <div className={styles.activePackBanner}>
          <div className={styles.activePackInfo}>
            <span className={styles.activeDot} />
            <div>
              <div className={styles.activePackName}>{activePack.meta.name}</div>
              <div className={styles.activePackMeta}>by {activePack.meta.author} · v{activePack.meta.version}</div>
            </div>
          </div>
          <button className={styles.btnGhost} onClick={unloadPack}>Unload</button>
        </div>
      )}

      {/* ── Built-in packs ── */}
      <div className={styles.packGrid}>
        {BUILT_IN_PACKS.map(pack => {
          const isActive = activePack?.baseUrl === pack.baseUrl;
          return (
            <div key={pack.baseUrl} className={`${styles.packCard} ${isActive ? styles.packCardActive : ''}`}>
              <div className={styles.packCardPreview}>{pack.preview}</div>
              <div className={styles.packCardName}>{pack.name}</div>
              <div className={styles.packCardSub}>by {pack.author}</div>
              <div className={styles.packCardSub} style={{ fontSize: 11, marginTop: 2 }}>{pack.description}</div>
              <div className={styles.packCardPrice}><span className={styles.freeLabel}>Built-in</span></div>
              {isActive ? (
                <button className={`${styles.packCardBtn} ${styles.packCardBtnActive}`} onClick={unloadPack}>Active — Unload</button>
              ) : (
                <button className={styles.packCardBtn} disabled={loading} onClick={() => loadPack(pack.baseUrl)}>
                  {loading ? 'Loading…' : 'Load'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Local packs ── */}
      {isTauri && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Local Packs</div>
              {packsDir && (
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>{packsDir}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 16 }}>
              <button className={styles.btnGhost} onClick={scanLocalPacks} style={{ fontSize: 12 }}>Refresh</button>
              {packsDir && (
                <button className={styles.btnGhost} onClick={() => revealItemInDir(packsDir).catch(() => {})} style={{ fontSize: 12 }}>Open Folder</button>
              )}
            </div>
          </div>

          {scanDone && localPacks.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📦</div>
              <p className={styles.emptyText}>
                Drop pack folders here to install them. Each folder needs a <code>pack.yaml</code>.
              </p>
            </div>
          ) : (
            <div className={styles.packGrid}>
              {localPacks.map(pack => {
                const isActive = activePack?.baseUrl === pack.baseUrl;
                return (
                  <div key={pack.folderName} className={`${styles.packCard} ${isActive ? styles.packCardActive : ''}`}>
                    <div className={styles.packCardPreview}>📦</div>
                    <div className={styles.packCardName}>{pack.meta?.name ?? pack.folderName}</div>
                    <div className={styles.packCardSub}>{pack.meta ? `by ${pack.meta.author}` : pack.folderName}</div>
                    {pack.meta?.description && (
                      <div className={styles.packCardSub} style={{ fontSize: 11, marginTop: 2 }}>{pack.meta.description}</div>
                    )}
                    <div className={styles.packCardPrice}><span className={styles.freeLabel}>Local</span></div>
                    {isActive ? (
                      <button className={`${styles.packCardBtn} ${styles.packCardBtnActive}`} onClick={unloadPack}>Active — Unload</button>
                    ) : (
                      <button className={styles.packCardBtn} disabled={loading} onClick={() => loadPack(pack.baseUrl)}>
                        {loading ? 'Loading…' : 'Load'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Packs tab ────────────────────────────────────────────────────────────────

function PacksTab({ resourcePack }: { resourcePack: UseResourcePackReturn }) {
  const [category, setCategory] = useState<PackCategory>('theme-packs');
  const { activePack, loading, loadPack } = resourcePack;

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h1 className={styles.tabTitle}>Packs</h1>
        <p className={styles.tabSubtitle}>Emojis, stickers, server themes, and more for your Zeeble experience</p>
      </div>

      <div className={styles.packCategoryBar}>
        {PACK_CATEGORIES.map(c => (
          <button key={c.id} className={`${styles.packCategoryBtn} ${category === c.id ? styles.packCategoryBtnActive : ''}`} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className={styles.packGrid}>
        {PACKS[category].map(pack => {
          // Theme packs in this tab get the real load button from BUILT_IN_PACKS if available
          const owned = category === 'theme-packs'
            ? BUILT_IN_PACKS.find(b => b.name === pack.name)
            : undefined;
          const isActive = owned && activePack?.baseUrl === owned.baseUrl;

          return (
            <div key={pack.name} className={`${styles.packCard} ${isActive ? styles.packCardActive : ''}`}>
              <div className={styles.packCardPreview}>{pack.preview}</div>
              <div className={styles.packCardName}>{pack.name}</div>
              <div className={styles.packCardSub}>{pack.sub}</div>
              <div className={styles.packCardPrice}>
                {pack.price === 0
                  ? <span className={styles.freeLabel}>Free</span>
                  : <><span className={styles.ichorIconSm}>◈</span>{pack.price.toLocaleString()}</>
                }
              </div>
              {owned ? (
                isActive ? (
                  <button className={`${styles.packCardBtn} ${styles.packCardBtnActive}`} onClick={() => resourcePack.unloadPack()}>
                    Active — Unload
                  </button>
                ) : (
                  <button className={styles.packCardBtn} disabled={loading} onClick={() => loadPack(owned.baseUrl)}>
                    {loading ? 'Loading…' : 'Load Theme'}
                  </button>
                )
              ) : (
                <button className={styles.packCardBtn}>Get Pack</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Find Servers tab ─────────────────────────────────────────────────────────

function FindPeopleTab() {
  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h1 className={styles.tabTitle}>Find Servers</h1>
        <p className={styles.tabSubtitle}>Discover public Zeeble servers to join</p>
      </div>
      <div className={styles.comingSoon}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.comingSoonIcon}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span className={styles.comingSoonLabel}>Coming Soon</span>
        <p className={styles.comingSoonDesc}>Server discovery is on the way.</p>
      </div>
    </div>
  );
}

// ─── Shop tab ─────────────────────────────────────────────────────────────────

type PayStep = 'plans' | 'card' | 'success';

const PREMIUM_PERKS: { label: string; free: string | null; premium: string | null }[] = [
  { label: 'Join server limit',               free: '100',       premium: '200'    },
  { label: 'Zeeble cloud servers (create)',   free: '10',        premium: '30'     },
  { label: 'Sub-accounts',                    free: '10',        premium: '20'     },
  { label: 'Message search',                  free: '✓',         premium: '✓'      },
  { label: 'Custom beam tag',                 free: null,        premium: '✓'      },
  { label: 'Profile banner & animated avatar',free: null,        premium: '✓'      },
  { label: 'Monthly boosts',                  free: null,        premium: '5'      },
];

function ShopTab() {
  const [info, setInfo]                           = useState<ApiAccountInfo | null>(null);
  const [step, setStep]                           = useState<PayStep>('plans');
  const [clientSecret, setClientSecret]           = useState('');
  const [invoiceId, setInvoiceId]                 = useState('');
  const [stripeObj, setStripeObj]                 = useState<Stripe | null>(null);
  const [cardElement, setCardElement]             = useState<StripeCardElement | null>(null);
  const cardRef                                   = useRef<HTMLDivElement>(null);
  const [loadingSubscribe, setLoadingSubscribe]   = useState(false);
  const [loadingPay, setLoadingPay]               = useState(false);
  const [subscribeError, setSubscribeError]       = useState<string | null>(null);
  const [cardError, setCardError]                 = useState<string | null>(null);
  const [loadingIchorPremium, setLoadingIchorPremium] = useState(false);
  const [ichorPremiumError, setIchorPremiumError] = useState<string | null>(null);
  const [loadingBuyIchor, setLoadingBuyIchor]     = useState(false);
  const [code, setCode]                           = useState('');
  const [codeLoading, setCodeLoading]             = useState(false);
  const [codeStatus, setCodeStatus]               = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { getAccountInfo().then(setInfo); }, []);

  const isPremium    = info?.premium === true;
  const ichorBalance = info?.ichor_balance ?? 0;
  const isActive     = isPremium || step === 'success';

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
    return () => { card?.destroy(); setCardElement(null); setStripeObj(null); };
  }, [step]);

  async function handleGetPremium() {
    setLoadingSubscribe(true);
    setSubscribeError(null);
    const result = await createSubscription();
    setLoadingSubscribe(false);
    if (!result.ok) { setSubscribeError(result.error ?? 'Something went wrong'); return; }
    setClientSecret(result.clientSecret!);
    setInvoiceId(result.invoiceId!);
    setCardError(null);
    setStep('card');
  }

  async function handlePay() {
    if (!stripeObj || !cardElement) return;
    setLoadingPay(true);
    setCardError(null);
    const { setupIntent, error } = await stripeObj.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement },
    });
    if (error) { setCardError(error.message ?? 'Card declined'); setLoadingPay(false); return; }
    const paymentMethodId = typeof setupIntent?.payment_method === 'string'
      ? setupIntent.payment_method
      : (setupIntent?.payment_method as { id?: string })?.id ?? '';
    if (!paymentMethodId) { setCardError('Failed to save payment method'); setLoadingPay(false); return; }
    const result = await confirmSubscriptionPayment(invoiceId, paymentMethodId);
    if (!result.ok) { setCardError(result.error ?? 'Payment failed'); setLoadingPay(false); return; }
    if (result.requiresAction && result.clientSecret) {
      const { error: actionError } = await stripeObj.handleCardAction(result.clientSecret);
      if (actionError) { setCardError(actionError.message ?? '3D Secure failed'); setLoadingPay(false); return; }
    }
    setLoadingPay(false);
    setStep('success');
    getAccountInfo().then(setInfo);
  }

  async function handleIchorPremium() {
    setLoadingIchorPremium(true);
    setIchorPremiumError(null);
    const result = await redeemIchorForPremium();
    setLoadingIchorPremium(false);
    if (!result.ok) { setIchorPremiumError(result.error ?? 'Something went wrong'); return; }
    setStep('success');
    getAccountInfo().then(setInfo);
  }

  async function handleBuyIchor() {
    setLoadingBuyIchor(true);
    const result = await buyIchorCheckout();
    setLoadingBuyIchor(false);
    if (!result.ok || !result.url) return;
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  async function handleRedeem() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setCodeLoading(true);
    setCodeStatus(null);
    const result = await redeemPromoCode(trimmed);
    setCodeLoading(false);
    setCodeStatus({ ok: result.ok, msg: result.ok ? (result.message ?? 'Code redeemed!') : (result.error ?? 'Failed to redeem.') });
    if (result.ok) setCode('');
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.tabHeader}>
        <h2 className={styles.tabTitle}>Shop</h2>
        <p className={styles.tabSubtitle}>Premium, Ichor, and more</p>
      </div>

      <div style={{ maxWidth: 560, width: '100%' }}>

      {/* Premium banner */}
      <div style={{
        background: isActive
          ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))'
          : 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12))',
        border: `1px solid ${isActive ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.25)'}`,
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        marginBottom: 24,
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill={isActive ? '#a78bfa' : 'rgba(167,139,250,0.5)'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{isActive ? 'Zeeble Premium' : 'Upgrade to Premium'}</span>
            {isActive && (
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', background: 'rgba(74,222,128,0.18)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.35)', borderRadius: 4, padding: '2px 7px' }}>Active</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
            {isActive ? 'You have an active Premium subscription.' : 'Unlock exclusive features and support Zeeble.'}
          </div>
        </div>
      </div>

      {/* Perks table */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', gap: '0', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)', background: 'rgba(255,255,255,0.04)' }} />
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-2)', background: 'rgba(255,255,255,0.04)', textAlign: 'center' }}>Free</div>
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: '#a78bfa', background: 'rgba(99,102,241,0.12)', textAlign: 'center' }}>Premium</div>
          {PREMIUM_PERKS.map((p, i) => (
            <React.Fragment key={i}>
              <div style={{ padding: '9px 12px', fontSize: 13, color: 'var(--text-1)', borderTop: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>{p.label}</div>
              <div style={{ padding: '9px 12px', fontSize: 13, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', color: p.free ? 'var(--text-1)' : 'rgba(255,255,255,0.25)' }}>{p.free ?? '—'}</div>
              <div style={{ padding: '9px 12px', fontSize: 13, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.1)', color: p.premium ? '#c4b5fd' : 'rgba(255,255,255,0.25)', fontWeight: p.premium ? 600 : 400 }}>{p.premium ?? '—'}</div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Buy Premium / card step / success */}
      {step === 'success' ? (
        <div style={{ textAlign: 'center', padding: '20px 0 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Welcome to Zeeble Premium!</div>
          <div style={{ color: 'var(--text-2)', marginTop: 6, fontSize: 13 }}>Your subscription is active.</div>
        </div>
      ) : step === 'card' ? (
        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Payment details</div>
          <div ref={cardRef} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }} />
          {cardError && <div style={{ fontSize: 13, color: '#f87171', marginBottom: 10 }}>{cardError}</div>}
          <button className={styles.btnPrimary} onClick={handlePay} disabled={loadingPay || !cardElement} style={{ width: '100%', marginBottom: 8 }}>
            {loadingPay ? 'Processing…' : '✦ Pay $4.99/mo'}
          </button>
          <button className={styles.btnGhost} onClick={() => setStep('plans')} disabled={loadingPay} style={{ width: '100%' }}>← Back</button>
        </div>
      ) : !isPremium ? (
        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          {subscribeError && <div style={{ fontSize: 13, color: '#f87171', marginBottom: 10 }}>{subscribeError}</div>}
          {ichorPremiumError && <div style={{ fontSize: 13, color: '#f87171', marginBottom: 10 }}>{ichorPremiumError}</div>}
          <button className={styles.btnPrimary} onClick={handleGetPremium} disabled={loadingSubscribe || loadingIchorPremium} style={{ width: '100%', marginBottom: 8 }}>
            {loadingSubscribe ? 'Preparing checkout…' : '✦ Subscribe — $4.99/mo'}
          </button>
          <button
            className={styles.btnPrimary}
            onClick={handleIchorPremium}
            disabled={loadingIchorPremium || loadingSubscribe || ichorBalance < 500}
            title={ichorBalance < 500 ? `Need 500 ◈ — you have ${ichorBalance.toLocaleString()}` : undefined}
            style={{ width: '100%', opacity: ichorBalance < 500 ? 0.5 : 1 }}
          >
            {loadingIchorPremium ? 'Redeeming…' : `◈ Get Premium with Ichor — 500 ◈`}
          </button>
        </div>
      ) : null}

      {/* Ichor */}
      <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Ichor</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 22, color: '#f0c040' }}>◈</span>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{ichorBalance.toLocaleString()}</span>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>ichor</span>
        </div>
        <button className={styles.btnPrimary} onClick={handleBuyIchor} disabled={loadingBuyIchor} style={{ width: '100%', marginBottom: 6 }}>
          {loadingBuyIchor ? 'Opening checkout…' : '◈ Buy 500 Ichor — $5'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 0' }}>Use ichor to get Premium or spend it in the Market.</p>
      </div>

      {/* Promo code */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Redeem Code</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={styles.marketSearch}
            placeholder="Enter promo code"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && !codeLoading && handleRedeem()}
            maxLength={32}
            spellCheck={false}
            style={{ flex: 1 }}
          />
          <button className={styles.btnPrimary} onClick={handleRedeem} disabled={codeLoading || !code.trim()}>
            {codeLoading ? '…' : 'Redeem'}
          </button>
        </div>
        {codeStatus && (
          <p style={{ fontSize: 13, marginTop: 8, color: codeStatus.ok ? '#4ade80' : '#f87171' }}>{codeStatus.msg}</p>
        )}
      </div>

      </div>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

interface Props {
  resourcePack: UseResourcePackReturn;
}

export default function CommunityView({ resourcePack }: Props) {
  const [tab, setTab] = useState<CommunityTab>('market');

  return (
    <div className={styles.communityView}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>Community</div>
        <nav className={styles.nav}>
          <button className={`${styles.navItem} ${tab === 'market' ? styles.navItemActive : ''}`} onClick={() => setTab('market')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Market
          </button>
          <button className={`${styles.navItem} ${tab === 'packs' ? styles.navItemActive : ''}`} onClick={() => setTab('packs')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
            </svg>
            Packs
          </button>
          <button className={`${styles.navItem} ${tab === 'my-packs' ? styles.navItemActive : ''}`} onClick={() => setTab('my-packs')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12V22H4V12"/>
              <path d="M22 7H2v5h20V7z"/>
              <path d="M12 22V7"/>
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
            My Packs
            {resourcePack.activePack && <span className={styles.navActiveDot} />}
          </button>
          <button className={`${styles.navItem} ${tab === 'find-people' ? styles.navItemActive : ''}`} onClick={() => setTab('find-people')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Find Servers
          </button>
          <button className={`${styles.navItem} ${tab === 'shop' ? styles.navItemActive : ''}`} onClick={() => setTab('shop')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Shop
          </button>
        </nav>
      </div>

      <div className={styles.main}>
        {tab === 'market'      && <MarketTab resourcePack={resourcePack} />}
        {tab === 'packs'       && <PacksTab resourcePack={resourcePack} />}
        {tab === 'my-packs'    && <MyPacksTab resourcePack={resourcePack} />}
        {tab === 'find-people' && <FindPeopleTab />}
        {tab === 'shop'        && <ShopTab />}
      </div>
    </div>
  );
}
