import React from 'react';

/**
 * Unified empty state (§2.4): icon + one-line title + optional hint, primary
 * action, and suggestion chips. Suggestions carry their own onPick handler
 * (the spec left the chip click target to the implementer; a handler prop is
 * the cleanest shape for both AgentPanel fill-composer and page-navigation uses).
 *
 * agent-capabilities §12.2 adds `suggestGroups` (backward-compatible): when
 * present the chips render as labelled groups inside the same .empty-suggest
 * container — the AgentPanel empty state shows 通用指令 + 运行技能 as two
 * visually separated rows. Plain `suggestions` keeps working unchanged.
 */
export type EmptySuggestion = { label: string; onPick: () => void; title?: string };

export function Empty({ icon, title, hint, action, suggestions, suggestGroups }: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  suggestions?: EmptySuggestion[];
  suggestGroups?: Array<{ label?: string; items: EmptySuggestion[] }>;
}) {
  return <div className="empty">
    {icon}
    <b>{title}</b>
    {hint && <span>{hint}</span>}
    {action}
    {suggestGroups && suggestGroups.length > 0 && <div className="empty-suggest">
      {suggestGroups.map((g, i) => <div key={i} className="empty-suggest-group">
        {g.label && <span className="empty-suggest-label">{g.label}</span>}
        {g.items.map(s => <button key={s.label} className="btn-ghost" title={s.title} onClick={s.onPick}>{s.label}</button>)}
      </div>)}
    </div>}
    {!suggestGroups && suggestions && suggestions.length > 0 && <div className="empty-suggest">
      {suggestions.map(s => <button key={s.label} className="btn-ghost" onClick={s.onPick}>{s.label}</button>)}
    </div>}
  </div>;
}
