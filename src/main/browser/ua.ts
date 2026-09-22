/**
 * Standard-browser user-agent hygiene for the embedded WebContentsView sessions.
 *
 * Electron's default UA leaks `Electron/<ver>` (and after packaging, the app
 * name) into every request of pages the USER browses manually. Embedded
 * products (Slack, Notion, VS Code webviews) present a plain browser UA
 * instead. This module builds that standard UA.
 *
 * Scope guard: this is presentation hygiene, NOT fingerprint spoofing. The
 * Chromium version in the UA is the REAL engine version — the engine's actual
 * capabilities must stay consistent with what the UA claims (see
 * docs/SECURITY.md). No canvas/WebGL/audio noise, no automation-trace hiding.
 */

/** Extract the real Chromium version from Electron's UA token (`Chrome/<major>.<build>`). */
export function chromiumVersionFromUa(userAgent: string): string {
  const m = /Chrome\/([\d.]+)/.exec(userAgent);
  return m ? m[1] : '';
}

/**
 * Build a standard Chrome UA for the embedded session.
 * Keeps the REAL engine version (no version forging) and the REAL platform
 * token; drops Electron/app tokens.
 */
export function standardChromeUa(version: string, platform: NodeJS.Platform = 'darwin'): string {
  const ver = version || '0.0.0.0';
  switch (platform) {
    case 'win32':
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`;
    case 'linux':
      return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`;
    case 'darwin':
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`;
    default:
      return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver} Safari/537.36`;
  }
}

/** Indirection seam for the process's current UA (main-process webContents.userAgent; injectable in tests). */
let currentUa: () => string = () => {
  throw new Error('UA provider not configured — call configureUaSource() in the main process');
};
export function configureUaSource(provider: () => string) { currentUa = provider; }

/** The standard UA for this build: real Chromium version, real platform, no Electron tokens. */
export function standardUa(): string {
  return standardChromeUa(chromiumVersionFromUa(currentUa()), process.platform);
}
