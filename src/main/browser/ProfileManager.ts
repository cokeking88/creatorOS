import { session, type Session } from 'electron';
import { repo } from '../db/repository.js';

export class ProfileManager {
  list() { return repo.listProfiles(); }
  create(input: { name: string; platform?: string; accountId?: string }) { return repo.createProfile(input); }
  getSession(profileId: string): Session {
    const profile = this.list().find(p => p.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    const ses = session.fromPartition(profile.partition, { cache: true });
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      const safe = new Set(['clipboard-sanitized-write', 'notifications', 'fullscreen']);
      callback(safe.has(permission));
    });
    return ses;
  }
}
