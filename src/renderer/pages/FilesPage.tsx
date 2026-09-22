import React, { useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { Tree, type TreeApi } from 'react-arborist';
import type { AppState } from '../../shared/types';

type FileNode = { name: string; path: string; kind: 'file' | 'dir'; children?: FileNode[] };

const cmExtensions = [markdown({ base: markdownLanguage, codeLanguages: languages })];

function SaveState({ dirty, saving, conflict }: { dirty: boolean; saving: boolean; conflict: boolean }) {
  if (conflict) return <span className="file-conflict">⚠ 磁盘已变更</span>;
  if (saving) return <span className="muted">保存中…</span>;
  if (dirty) return <span className="file-dirty">● 未保存</span>;
  return <span className="muted">已保存</span>;
}

export function FilesPage({ state }: { state: AppState | null }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [diskMtime, setDiskMtime] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const treeRef = useRef<TreeApi<FileNode> | null>(null);

  const accounts = state?.accounts ?? [];
  const activeAccount = accountId ?? accounts[0]?.id ?? null;

  const refreshTree = useCallback(async (id: string | null) => {
    if (!id) return;
    try { setTree(await window.creatorOS.files.list(id)); setError(null); }
    catch (e) { setError(String(e)); }
  }, []);

  useEffect(() => { void refreshTree(activeAccount); }, [activeAccount, refreshTree]);

  // Watcher: refresh tree on disk changes; if the open file changed on disk, raise a conflict
  useEffect(() => {
    const off = window.creatorOS.onFilesChanged(({ accountId: changedAccount, relPath }) => {
      if (changedAccount !== activeAccount) return;
      void refreshTree(activeAccount);
      if (selected && (relPath === null || relPath === selected)) void markConflictIfChanged();
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount, selected, diskMtime]);

  const markConflictIfChanged = async () => {
    if (!activeAccount || !selected) return;
    try {
      const disk = await window.creatorOS.files.read(activeAccount, selected);
      setConflict(disk.mtime !== diskMtime);
    } catch { /* file may have been deleted/renamed on disk */ }
  };

  async function openFile(rel: string) {
    if (!activeAccount) return;
    try {
      const f = await window.creatorOS.files.read(activeAccount, rel);
      setSelected(rel); setContent(f.content); setDiskMtime(f.mtime);
      setDirty(false); setConflict(false); setError(null);
    } catch (e) { setError(String(e)); }
  }

  async function save() {
    if (!activeAccount || !selected) return;
    setSaving(true);
    try {
      const r = await window.creatorOS.files.write(activeAccount, selected, content);
      setDiskMtime(r.mtime); setDirty(false); setConflict(false); setError(null);
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  const [creating, setCreating] = useState<{ hint: string } | null>(null);
  const [creatingValue, setCreatingValue] = useState('');
  useEffect(() => { if (creating) setCreatingValue(''); }, [creating]);
  async function commitCreating() {
    if (!creating || !activeAccount || !creatingValue.trim()) { setCreating(null); return; }
    const name = creatingValue.trim();
    const isRename = creating.hint.startsWith('重命名');
    const isDir = creating.hint.includes('目录名');
    try {
      if (isRename && selected) await window.creatorOS.files.rename(activeAccount, selected, name);
      else if (isDir) await window.creatorOS.files.mkdir(activeAccount, name);
      else await window.creatorOS.files.write(activeAccount, name, '');
      await refreshTree(activeAccount);
      if (!isRename && !isDir) await openFile(name);
      else if (isRename) { setSelected(name); setDirty(false); }
      setError(null);
    } catch (e) { setError(String(e)); }
    setCreating(null);
  }

  const treeData = tree;
  const account = accounts.find(a => a.id === activeAccount);
  const cmValue = content;

  if (!accounts.length) {
    return <div className="page"><h1>Files</h1><p className="muted">还没有运营账号。先到 <b>Accounts</b> 页创建账号，每个账号会自动拥有一个专属目录（drafts / assets / data）。</p></div>;
  }
  return <div className="page files-page">
    <h1>Files</h1>
    <div className="files-toolbar">
      <select className="field" aria-label="Account" value={activeAccount ?? ''} onChange={e => { setAccountId(e.target.value); setSelected(null); setContent(''); }}>
        {accounts.map(a => { const p = state?.platforms.find(pl => pl.id === a.platformId); return <option key={a.id} value={a.id}>{p?.name ?? ''} · {a.name}</option>; })}
      </select>
      <button onClick={() => { setCreating({ hint: '新文件名（如 drafts/新草稿.md）' }); }}>＋文件</button>
      <button onClick={() => { setCreating({ hint: '新目录名（如 drafts/topic）' }); }}>＋目录</button>
      <button disabled={!selected} onClick={() => { if (selected) setCreating({ hint: `重命名 ${selected} 为` }); }}>重命名</button>
      <span className="muted small" style={{ marginLeft: 'auto' }}>{account ? `目录：accounts/${activeAccount}` : ''}</span>
    </div>
    {creating && <div className="files-creating">
      <input className="field" autoFocus aria-label={creating.hint} placeholder={creating.hint} value={creatingValue}
        onChange={e => setCreatingValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') void commitCreating(); if (e.key === 'Escape') setCreating(null); }}
        onBlur={() => void commitCreating()} />
    </div>}
    {error && <p className="err-msg">{error}</p>}
    <div className="files-grid">
      <div className="files-tree">
        {treeData.length
          ? <Tree<FileNode> ref={treeRef} data={treeData} openByDefault={false} idAccessor={(n) => n.path} width="100%" height={600} rowHeight={28} indent={16}
              renderRow={(props) => <div className={`files-row ${selected === props.node.data.path ? 'selected' : ''}`}
                   onClick={() => { if (props.node.data.kind === 'file') void openFile(props.node.data.path); else props.node.toggle(); }}>
                <span className="files-icon">{props.node.data.kind === 'dir' ? (props.node.isOpen ? '▾' : '▸') : '📄'}</span>
                <span className="files-name">{props.node.data.name}</span>
              </div>} />
          : <p className="muted">空目录 — 用上方按钮创建第一个草稿，或让 Agent 直接在这里工作。</p>}
      </div>
      <div className="files-editor">
        {selected
          ? <>
              <div className="files-editor-top">
                <code>{selected}</code>
                <SaveState dirty={dirty} saving={saving} conflict={conflict} />
                {conflict && <button className="primary" onClick={() => { void openFile(selected); }}>重新加载磁盘版</button>}
                {conflict && dirty && <button onClick={() => { void save(); }}>用我的覆盖</button>}
                <button className="primary" disabled={!dirty || saving} onClick={() => { void save(); }}>保存</button>
              </div>
              <CodeMirror value={cmValue} height="100%" theme="dark" extensions={cmExtensions}
                onChange={(v: string) => { setContent(v); setDirty(true); }} />
            </>
          : <p className="muted">从左侧选择一个文件查看/编辑。CLAUDE.md 是给 Agent 的目录约定说明。</p>}
      </div>
    </div>
  </div>;
}
