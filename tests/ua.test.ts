import { describe, expect, it } from 'vitest';
import { chromiumVersionFromUa, standardChromeUa, standardUa, configureUaSource } from '../src/main/browser/ua.js';

const ELECTRON_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Electron/44.4.0 Safari/537.36 CreatorOS/0.3.0';

describe('standardChromeUa', () => {
  it('darwin builds the mac Chrome token', () => {
    expect(standardChromeUa('152.0.6834.83', 'darwin'))
      .toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.6834.83 Safari/537.36');
  });
  it('win32 builds the windows Chrome token', () => {
    expect(standardChromeUa('120.0.0.0', 'win32'))
      .toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  });
  it('linux builds the x11 Chrome token', () => {
    expect(standardChromeUa('120.0.0.0', 'linux'))
      .toBe('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  });
  it('never carries Electron or app tokens, on any platform', () => {
    for (const p of ['darwin', 'win32', 'linux'] as const) {
      const ua = standardChromeUa('152.0.0.0', p);
      expect(ua).not.toContain('Electron');
      expect(ua).not.toContain('creatoros');
      expect(ua).not.toContain('CreatorOS');
    }
  });
  it('empty version falls back to a placeholder instead of a malformed UA', () => {
    expect(standardChromeUa('')).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/0.0.0.0 Safari/537.36');
  });
});

describe('chromiumVersionFromUa', () => {
  it('extracts the full Chromium version from the Electron default UA', () => {
    expect(chromiumVersionFromUa(ELECTRON_UA)).toBe('152.0.0.0');
  });
  it('returns empty string for a UA without a Chrome token', () => {
    expect(chromiumVersionFromUa('Mozilla/5.0 (Macintosh) Firefox/121.0')).toBe('');
  });
});

describe('standardUa', () => {
  it('combines the real engine version with the current platform, dropping Electron tokens', () => {
    configureUaSource(() => ELECTRON_UA);
    const ua = standardUa();
    expect(ua).toContain('Chrome/152.0.0.0');
    expect(ua).not.toContain('Electron');
    expect(ua).not.toContain('CreatorOS');
    expect(ua).toContain('Macintosh'); // darwin test runner
  });
  it('falls back to the placeholder version when no source is bound yet', () => {
    configureUaSource(() => '');
    const ua = standardUa();
    expect(ua).toContain('Chrome/0.0.0.0');
    expect(ua).not.toContain('Electron');
  });
});
