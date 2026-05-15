// ─── Pack Types ───────────────────────────────────────────────────────────────

export interface PackColors {
  backgrounds: {
    primary: string;
    secondary: string;
    tertiary?: string;
    elevated?: string;
    hover?: string;
    selected?: string;
    input?: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted?: string;
    link?: string;
    placeholder?: string;
  };
  accents: {
    primary: string;
    secondary?: string;
    danger?: string;
    success?: string;
    warning?: string;
    info?: string;
  };
  borders?: {
    default?: string;
    focus?: string;
    divider?: string;
  };
  status?: {
    online?: string;
    idle?: string;
    dnd?: string;
    offline?: string;
  };
  message?: {
    own_bubble?: string;
    other_bubble?: string;
    mention_bg?: string;
    mention_border?: string;
  };
  components?: Record<string, string>;
}

export interface PackSounds {
  message_send?: string;
  message_receive?: string;
  notification?: string;
  user_join?: string;
  user_leave?: string;
  voice_connect?: string;
  voice_disconnect?: string;
  mute?: string;
  unmute?: string;
  deafen?: string;
}

export interface PackImages {
  logo?: string;
  background_chat?: string;
  background_sidebar?: string;
  splash_screen?: string;
}

export interface PackGifs {
  loading?: string;
  typing_indicator?: string;
}

export interface PackAnimations {
  message_send_effect?: string;
  reaction_burst?: string;
}

export interface PackEmojisConfig {
  pack_path?: string;
  manifest?: string;
}

export interface PackAssets {
  colors: string;
  css?: string;
  sounds?: PackSounds;
  images?: PackImages;
  gifs?: PackGifs;
  animations?: PackAnimations;
  emojis?: PackEmojisConfig;
}

export interface PackFeatures {
  custom_sounds?: boolean;
  animated_backgrounds?: boolean;
  custom_emojis?: boolean;
  message_animations?: boolean;
}

export interface PackMeta {
  id?: string;
  name: string;
  author: string;
  version: string;
  description?: string;
  price?: number;
  assets: PackAssets;
  features?: PackFeatures;
}

export interface EmojiEntry {
  name: string;
  shortcode: string;
  file: string;
  category?: string;
  tags?: string[];
  animated?: boolean;
}

export interface EmojiManifest {
  pack_name: string;
  version: string;
  emojis: EmojiEntry[];
  categories: string[];
}

export interface LoadedPack {
  meta: PackMeta;
  colors: PackColors;
  baseUrl: string;
  emojiManifest?: EmojiManifest;
}

// ─── CSS Variable Mapping ─────────────────────────────────────────────────────

// Maps pack color values onto the app's existing CSS custom properties.
// Extra pack-only vars are set with their own names for component use.
export function applyPackColors(colors: PackColors): void {
  const root = document.documentElement;
  const set = (v: string, val?: string) => { if (val) root.style.setProperty(v, val); };

  set('--bg-main',   colors.backgrounds.primary);
  set('--bg-panel',  colors.backgrounds.secondary);
  set('--bg-dark',   colors.backgrounds.tertiary ?? colors.backgrounds.secondary);
  set('--bg-elevated',  colors.backgrounds.elevated);
  set('--bg-hover',     colors.backgrounds.hover);
  set('--bg-selected',  colors.backgrounds.selected);
  set('--input-bg',     colors.backgrounds.input);

  set('--text-1', colors.text.primary);
  set('--text-2', colors.text.secondary);
  set('--text-3', colors.text.muted);
  set('--link',         colors.text.link);
  set('--placeholder',  colors.text.placeholder);

  set('--accent',   colors.accents.primary);
  set('--accent-h', colors.accents.secondary ?? colors.accents.primary);
  set('--red',   colors.accents.danger);
  set('--green', colors.accents.success);
  set('--gold',  colors.accents.warning);

  if (colors.accents.primary) {
    // Derive a glow from the primary accent (keep alpha at ~25%)
    root.style.setProperty('--accent-glow', hexToRgba(colors.accents.primary, 0.25));
  }

  if (colors.borders) {
    set('--border-default', colors.borders.default);
    set('--border-focus',   colors.borders.focus);
    if (colors.borders.default) {
      root.style.setProperty('--border-soft', `1px solid ${colors.borders.default}`);
    }
  }

  if (colors.status) {
    set('--status-online',  colors.status.online);
    set('--status-idle',    colors.status.idle);
    set('--status-dnd',     colors.status.dnd);
    set('--status-offline', colors.status.offline);
  }

  if (colors.message) {
    set('--msg-own',         colors.message.own_bubble);
    set('--msg-other',       colors.message.other_bubble);
    set('--mention-bg',      colors.message.mention_bg);
    set('--mention-border',  colors.message.mention_border);
  }
}

export function clearPackColors(): void {
  const root = document.documentElement;
  const vars = [
    '--bg-main', '--bg-panel', '--bg-dark', '--bg-elevated', '--bg-hover',
    '--bg-selected', '--input-bg',
    '--text-1', '--text-2', '--text-3', '--link', '--placeholder',
    '--accent', '--accent-h', '--accent-glow', '--red', '--green', '--gold',
    '--border-default', '--border-focus', '--border-soft',
    '--status-online', '--status-idle', '--status-dnd', '--status-offline',
    '--msg-own', '--msg-other', '--mention-bg', '--mention-border',
  ];
  for (const v of vars) root.style.removeProperty(v);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
