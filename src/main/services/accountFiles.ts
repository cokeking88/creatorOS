import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { app } from 'electron';

/**
 * Account directory layout (Obsidian-vault style: disk is the truth, no central index).
 * <accountRoot>/drafts  — markdown content drafts
 * <accountRoot>/assets  — images/attachments
 * <accountRoot>/data    — structured data (json/csv)
 * <accountRoot>/CLAUDE.md — directory conventions; the agent subprocess loads it from cwd
 */
export const CLAUDE_MD_TEMPLATE = `# 账号运营目录

这是该运营账号的专属目录，由 CreatorOS 管理并供 Agent 读写。

## 目录约定

- \`drafts/\` — 内容草稿与成稿（markdown 为主）
- \`assets/\` — 图片、附件等素材
- \`data/\` — 结构化数据（json/csv，如采集的指标）

## 约定

- 新草稿放 \`drafts/\`，文件名用 kebab-case 或中文名
- 数据文件写 \`data/\`，不要把草稿和数据混放
- 不要在本目录之外读写任何文件
- 修改文件前先 Read，保持 frontmatter（title/status/platform 等）完整
`;

/** Pure path-fence check (unit-tested): target must resolve inside root after realpath. */
export function isInsideRoot(root: string, target: string, realpath: (p: string) => string = (p) => p): boolean {
  const absRoot = resolve(root);
  const absTarget = resolve(root, target);
  // Normalize both sides through realpath when the path exists (symlink escape
  // guard). Non-existent targets (e.g. Write of a new file) fall back to the
  // pre-realpath path — both sides must use the SAME base so /var vs
  // /private/var (macOS tmp symlink) can never produce a false escape.
  const norm = (p: string) => { try { return realpath(p); } catch { return p; } };
  const realRoot = norm(absRoot);
  // If the root realpathed, apply the same normalization depth to the target:
  // a non-existent target inherits the root's realpathed prefix.
  const targetBase = realRoot;
  const realTarget = norm(absTarget) === absTarget && realRoot !== absRoot
    ? resolve(targetBase, relative(absRoot, absTarget))
    : norm(absTarget);
  const rel = relative(realRoot, realTarget);
  return rel === '' || (!rel.startsWith('..') && !rel.split('/')[0]?.includes('..'));
}

export type FileNode = { name: string; path: string; kind: 'file' | 'dir'; children?: FileNode[] };

/** Root directory of an account's files (userData/accounts/<accountId>). */
export function accountRoot(accountId: string): string {
  return join(app.getPath('userData'), 'accounts', accountId);
}

/** Create the account dir + conventions. Idempotent (AC1). */
export function ensureAccountDir(accountId: string): string {
  const root = accountRoot(accountId);
  mkdirSync(join(root, 'drafts'), { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  mkdirSync(join(root, 'data'), { recursive: true });
  const md = join(root, 'CLAUDE.md');
  if (!existsSync(md)) writeFileSync(md, CLAUDE_MD_TEMPLATE);
  return root;
}

function listRecursive(absDir: string, displayRoot: string, depth = 0): FileNode[] {
  if (depth > 6) return []; // guard against pathological nesting/symlink loops
  const out: FileNode[] = [];
  let entries: import('node:fs').Dirent[];
  try { entries = readdirSync(absDir, { withFileTypes: true }); } catch { return out; }
  entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1));
  for (const e of entries) {
    if (e.name === '.DS_Store') continue;
    const abs = join(absDir, e.name);
    const display = join(displayRoot, e.name);
    if (e.isDirectory()) out.push({ name: e.name, path: display, kind: 'dir', children: listRecursive(abs, display, depth + 1) });
    else if (e.isFile()) out.push({ name: e.name, path: display, kind: 'file' });
  }
  return out;
}

/** Fenced operations: every path is validated against the account root before fs access. */
export class AccountFilesService {
  constructor(private accountId: string) {}

  private root() { return ensureAccountDir(this.accountId); }
  /** Resolve a display path (relative to account root) to an absolute path, or throw if it escapes. */
  private safe(relativeOrAbsolute: string): string {
    const root = this.root();
    const abs = resolve(root, relativeOrAbsolute);
    if (!isInsideRoot(root, abs)) throw new Error(`Path escapes account directory: ${relativeOrAbsolute}`);
    return abs;
  }

  list(): FileNode[] { return listRecursive(this.root(), ''); }

  read(rel: string): { content: string; size: number; mtime: number } {
    const abs = this.safe(rel);
    const st = statSync(abs);
    if (!st.isFile()) throw new Error(`Not a file: ${rel}`);
    return { content: readFileSync(abs, 'utf8'), size: st.size, mtime: st.mtimeMs };
  }

  write(rel: string, content: string): { mtime: number } {
    const abs = this.safe(rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    return { mtime: statSync(abs).mtimeMs };
  }

  mkdir(rel: string): void { mkdirSync(this.safe(rel), { recursive: true }); }

  rename(fromRel: string, toRel: string): void {
    const from = this.safe(fromRel); const to = this.safe(toRel);
    if (!existsSync(from)) throw new Error(`No such file: ${fromRel}`);
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
  }
}

/** Test seam: the fs realpath used by isInsideRoot in production. */
export const fsRealpath: (p: string) => string = (p) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { realpathSync } = require('node:fs') as typeof import('node:fs');
  try { return realpathSync(p); } catch { return p; }
};
