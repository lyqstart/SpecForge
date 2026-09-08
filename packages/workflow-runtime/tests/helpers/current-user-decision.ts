export function currentUserDecision(workItemId: string, decisionStatus = 'approved') {
  return {
    schema_version: '1.0',
    decision_id: `UD-${workItemId}-fixture`,
    work_item_id: workItemId,
    workflow_path: 'requirement_change_path',
    base_spec_version: 'PSV-0001',
    candidate_manifest_path: 'candidate_manifest.json',
    manifest_hash: 'sha256:manifest-fixture',
    candidate_hash: 'sha256:candidate-fixture',
    gate_summary_path: 'gate_summary.md',
    gate_summary_hash: 'sha256:gate-fixture',
    decision_status: decisionStatus,
    decision_type: decisionStatus === 'rejected' ? 'rejected' : 'user_approved',
    decided_by: 'user',
    decided_at: '2026-09-08T00:00:00.000Z',
    decision_scope: 'full',
    waivers: [],
  };
}
