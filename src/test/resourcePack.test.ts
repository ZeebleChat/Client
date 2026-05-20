import { describe, it, expect, beforeEach } from 'vitest';
import { applyPackColors, clearPackColors, type PackColors } from '../resourcePack';

const baseColors: PackColors = {
  backgrounds: { primary: '#1a1a2e', secondary: '#16213e' },
  text: { primary: '#eaeaea', secondary: '#a0a0b0' },
  accents: { primary: '#7c3aed' },
};

beforeEach(() => {
  // Reset inline styles between tests
  document.documentElement.removeAttribute('style');
});

describe('applyPackColors', () => {
  it('sets required CSS variables from backgrounds and text', () => {
    applyPackColors(baseColors);
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--bg-main')).toBe('#1a1a2e');
    expect(style.getPropertyValue('--bg-panel')).toBe('#16213e');
    expect(style.getPropertyValue('--text-1')).toBe('#eaeaea');
    expect(style.getPropertyValue('--text-2')).toBe('#a0a0b0');
    expect(style.getPropertyValue('--accent')).toBe('#7c3aed');
  });

  it('falls back --bg-dark to secondary when tertiary is absent', () => {
    applyPackColors(baseColors);
    expect(document.documentElement.style.getPropertyValue('--bg-dark')).toBe('#16213e');
  });

  it('uses tertiary for --bg-dark when provided', () => {
    applyPackColors({ ...baseColors, backgrounds: { ...baseColors.backgrounds, tertiary: '#0f3460' } });
    expect(document.documentElement.style.getPropertyValue('--bg-dark')).toBe('#0f3460');
  });

  it('derives --accent-glow as rgba from accent hex', () => {
    applyPackColors(baseColors);
    const glow = document.documentElement.style.getPropertyValue('--accent-glow');
    // #7c3aed → rgb(124, 58, 237)
    expect(glow).toBe('rgba(124, 58, 237, 0.25)');
  });

  it('sets --accent-h to secondary accent when provided', () => {
    applyPackColors({ ...baseColors, accents: { primary: '#7c3aed', secondary: '#a78bfa' } });
    expect(document.documentElement.style.getPropertyValue('--accent-h')).toBe('#a78bfa');
  });

  it('falls back --accent-h to primary when secondary is absent', () => {
    applyPackColors(baseColors);
    expect(document.documentElement.style.getPropertyValue('--accent-h')).toBe('#7c3aed');
  });

  it('sets status variables when provided', () => {
    applyPackColors({ ...baseColors, status: { online: '#22c55e', offline: '#6b7280' } });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--status-online')).toBe('#22c55e');
    expect(style.getPropertyValue('--status-offline')).toBe('#6b7280');
  });

  it('sets border variables when provided', () => {
    applyPackColors({ ...baseColors, borders: { default: '#333355', focus: '#7c3aed' } });
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--border-default')).toBe('#333355');
    expect(style.getPropertyValue('--border-focus')).toBe('#7c3aed');
  });

  it('does not set optional vars when their fields are absent', () => {
    applyPackColors(baseColors);
    expect(document.documentElement.style.getPropertyValue('--status-online')).toBe('');
    expect(document.documentElement.style.getPropertyValue('--msg-own')).toBe('');
  });
});

describe('clearPackColors', () => {
  it('removes all variables set by applyPackColors', () => {
    applyPackColors({ ...baseColors, status: { online: '#22c55e' }, borders: { default: '#333' } });
    clearPackColors();
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--bg-main')).toBe('');
    expect(style.getPropertyValue('--accent')).toBe('');
    expect(style.getPropertyValue('--accent-glow')).toBe('');
    expect(style.getPropertyValue('--status-online')).toBe('');
    expect(style.getPropertyValue('--border-default')).toBe('');
  });
});
