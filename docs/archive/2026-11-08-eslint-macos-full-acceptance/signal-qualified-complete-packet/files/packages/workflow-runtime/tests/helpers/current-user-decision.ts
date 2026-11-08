export function currentUserDecision(workItemId: string, decisionStatus = 'approved'): { schema_version: string; decision_id: string; work_item_id: string; workflow_path: string; base_spec_version: string; candidate_manifest_path: string; manifest_hash: string; candidate_hash: string; gate_summary_path: string; gate_summary_hash: string; decision_status: string; decision_type: string; decided_by: string; decided_at: string; decision_scope: string; waivers: never[]; } {
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
