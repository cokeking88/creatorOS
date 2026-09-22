import React, { useState } from 'react';
import { IcTrash } from './icons';

/**
 * Two-step destructive confirm (§12.4 extraction 2, generalized from
 * AutomationPage's DeleteJobButton): first click turns the trash icon into
 * 「确认删除？」 (auto-reverts after 3s); the second click runs onConfirm.
 * The aria-label/title template `删除{kindLabel}` is a hard e2e contract —
 * automation-delete.spec.ts locates the button via
 * `aria-label="删除任务 {name}"`, so callers must pass the exact same label
 * the old per-page components produced. onArmedChange lets the caller react to
 * the armed state (skills page shows the bound-jobs hint while armed).
 */
export function ConfirmButton({ kindLabel, onConfirm, onArmedChange }: { kindLabel: string; onConfirm: () => void; onArmedChange?: (armed: boolean) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const arm = (v: boolean) => { setConfirming(v); onArmedChange?.(v); };
  const click = () => {
    if (!confirming) { arm(true); setTimer(setTimeout(() => arm(false), 3000)); return; }
    if (timer) clearTimeout(timer);
    arm(false);
    onConfirm();
  };
  return <button className="btn-danger" aria-label={`删除${kindLabel}`} title={`删除${kindLabel}`} onClick={click}>{confirming ? '确认删除？' : <IcTrash />}</button>;
}
