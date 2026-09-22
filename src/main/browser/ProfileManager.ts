import { session, type Session } from 'electron';
import { repo } from '../db/repository.js';
import { configureUaSource, standardUa } from './ua.js';

// Lazily resolve the default UA from any live webContents (the first main
// window registers itself via bindUaSource below). Falls back to a
// version-less standard UA only if queried before any window exists — which
// cannot happen because profiles are only used by tabs inside windows.
let uaWebContents: { userAgent: string } | null = null;
export function bindUaSource(wc: { userAgent: string }) { uaWebContents = uaWebContents ?? wc; }
configureUaSource(() => uaWebContents?.userAgent ?? '');

export class ProfileManager {
  list() { return repo.listProfiles(); }
  create(input: { name: string; platform?: string; accountId?: string }) { return repo.createProfile(input); }
  getSession(profileId: string): Session {
    const profile = this.list().find(p => p.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    const ses = session.fromPartition(profile.partition, { cache: true });
    // UA hygiene: drop Electron/app tokens so manual browsing inside the
    // embedded browser presents as a plain Chrome of the REAL engine version.
    ses.setUserAgent(standardUa());
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      const safe = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen']);
      callback(safe.has(permission));
    });
    return ses;
  }
}
