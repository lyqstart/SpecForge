function isPlanRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isPlanDigest(value: unknown, length: 40 | 64): value is string {
  return typeof value === 'string' && (length === 40 ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(value);
}
function validPlan(value: unknown): value is Plan {
  if (!isPlanRecord(value) || value.schema_version !== '1.0') return false;
  const keys = ['schema_version', 'project_root', 'work_item_id', 'base_branch', 'branch_name', 'expected_head', 'created_utc', 'source', 'probe_commands', 'work_item_metadata_sha256'];
  if (Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) return false;
  if (['project_root', 'work_item_id', 'base_branch', 'branch_name', 'created_utc'].some(key => typeof value[key] !== 'string' || !value[key])) return false;
  const source = value.source;
  if (!isPlanDigest(value.expected_head, 40) || !isPlanDigest(value.work_item_metadata_sha256, 64) || !isPlanRecord(source) || source.head !== value.expected_head || typeof source.refs !== 'string' || source.refs.split('\n').some(ref => ref.startsWith('refs/heads/')) || ['head_sha256', 'index_sha256', 'config_sha256'].some(key => !isPlanDigest(source[key], 64)) || !Array.isArray(source.tracked)) return false;
  if (source.tracked.some((file: unknown) => !isPlanRecord(file) || typeof file.path !== 'string' || typeof file.mode !== 'string' || !['100644', '100755'].includes(file.mode) || !isPlanDigest(file.object_id, 40) || !isPlanDigest(file.sha256, 64) || typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 0)) return false;
  return Array.isArray(value.probe_commands) && value.probe_commands.every((receipt: unknown) =>
    isPlanRecord(receipt) && Array.isArray(receipt.args) && receipt.args.every((arg: unknown) => typeof arg === 'string') && typeof receipt.cwd === 'string' && typeof receipt.inner_exit_code === 'number' && Number.isInteger(receipt.inner_exit_code) && typeof receipt.stdout === 'string' && typeof receipt.stderr === 'string' && typeof receipt.started_utc === 'string' && typeof receipt.finished_utc === 'string' && Number.isFinite(Date.parse(receipt.started_utc)) && Number.isFinite(Date.parse(receipt.finished_utc))
  );
}
