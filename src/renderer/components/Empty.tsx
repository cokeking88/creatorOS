import React from 'react';

/**
 * Unified empty state (§2.4): icon + one-line title + optional hint, primary
 * action, and suggestion chips. Suggestions carry their own onPick handler
 * (the spec left the chip click target to the implementer; a handler prop is
 * the cleanest shape for both AgentPanel fill-composer and page-navigation uses).
 */
export function Empty({ icon, title, hint, action, suggestions }: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  suggestions?: Array<{ label: string; onPick: () => void }>;
}) {
  return <div className="empty">
    {icon}
    <b>{title}</b>
    {hint && <span>{hint}</span>}
    {action}
    {suggestions && suggestions.length > 0 && <div className="empty-suggest">
      {suggestions.map(s => <button key={s.label} className="btn-ghost" onClick={s.onPick}>{s.label}</button>)}
    </div>}
  </div>;
}
