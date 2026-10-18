import { expect } from 'vitest';

/** Exercise the actual owners instead of writing a fabricated zero-denial PASS fixture. */
export async function resolveAuditProbes(workItemId: string, invoke: (tool: string, args: Record<string, unknown>) => Promise<any>) {
  const args = { work_item_id: workItemId };
  const first = await invoke('sf_changed_files_audit', args);
  expect(first.passed, JSON.stringify(first)).toBe(false);
  expect(first.hard_stop).toBe(true);
  const resolution = await invoke('sf_hard_stop_resolve', { ...args,
    resolution_type: 'prohibited_action_replaced', blocked_action_disposition: 'abandon', retry_original_action: false,
    reason: 'Abandon the negative-test writes recorded by the audit; no protected target was changed.',
    evidence: ['write_guard_log.jsonl: expected denial probes retained'], safe_alternative_tool: 'sf_changed_files_audit',
    allowed_next_action: 'audit and verify permitted files without retrying blocked writes', resume_from_step: 'audit',
  });
  expect(resolution.success, JSON.stringify(resolution)).toBe(true);
  const audit = await invoke('sf_changed_files_audit', args);
  expect(audit.passed, JSON.stringify(audit)).toBe(true);
  expect(audit.blocked_write_attempts).toBeGreaterThan(0);
  expect(audit.unresolved_blocked_write_attempts).toBe(0);
}
