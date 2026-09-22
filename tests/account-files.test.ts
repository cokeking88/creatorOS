import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { isInsideRoot, CLAUDE_MD_TEMPLATE } from '../src/main/services/accountFiles.js';

const dirs: string[] = [];
function tmpRoot() { const d = mkdtempSync(join(tmpdir(), 'creatoros-fence-ut-')); dirs.push(d); return d; }
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** isInsideRoot with the production realpath seam (accountFiles uses plain identity by default in tests). */
const fenced = (root: string, target: string) => isInsideRoot(root, target, (p) => { try { return realpathSync(p); } catch { return p; } });

describe('isInsideRoot (account directory fence)', () => {
  it('allows paths inside the root, including the root itself', () => {
    const root = tmpRoot();
    expect(fenced(root, join(root, 'drafts/a.md'))).toBe(true);
    expect(fenced(root, root)).toBe(true);
  });

  it('resolves relative paths against the root', () => {
    const root = tmpRoot();
    expect(fenced(root, 'drafts/a.md')).toBe(true);
  });

  it('rejects ../ escape (AC4)', () => {
    const root = tmpRoot();
    expect(fenced(root, join(root, '../secrets.txt'))).toBe(false);
    expect(fenced(root, '../../etc/passwd')).toBe(false);
  });

  it('rejects absolute paths outside the root (AC4)', () => {
    const root = tmpRoot();
    expect(fenced(root, '/etc/passwd')).toBe(false);
    expect(fenced(root, join(tmpdir(), 'other-file'))).toBe(false);
  });

  it('does not match a sibling directory sharing a name prefix (AC4)', () => {
    const root = join(tmpRoot(), 'vault');
    mkdirSync(root);
    const sibling = `${root}-evil`;
    mkdirSync(sibling);
    expect(fenced(root, join(sibling, 'x.md'))).toBe(false);
  });

  it('rejects symlink escape after realpath (AC4)', () => {
    const root = tmpRoot();
    const outside = tmpRoot();
    writeFileSync(join(outside, 'secret.md'), 'x');
    symlinkSync(outside, join(root, 'escape-link'));
    expect(fenced(root, join(root, 'escape-link/secret.md'))).toBe(false);
  });

  it('accepts symlinks that stay inside the root', () => {
    const root = tmpRoot();
    mkdirSync(join(root, 'drafts'));
    writeFileSync(join(root, 'drafts/a.md'), 'x');
    symlinkSync(join(root, 'drafts'), join(root, 'alias'));
    expect(fenced(root, join(root, 'alias/a.md'))).toBe(true);
  });

  it('handles non-existent targets (Write of a new file) by resolve-only', () => {
    const root = tmpRoot();
    expect(fenced(root, join(root, 'drafts/new.md'))).toBe(true);
  });
});

describe('CLAUDE.md conventions template', () => {
  it('documents the drafts/assets/data layout the agent must follow', () => {
    expect(CLAUDE_MD_TEMPLATE).toContain('drafts/');
    expect(CLAUDE_MD_TEMPLATE).toContain('assets/');
    expect(CLAUDE_MD_TEMPLATE).toContain('data/');
    expect(CLAUDE_MD_TEMPLATE).toContain('不要在本目录之外读写任何文件');
  });
});
