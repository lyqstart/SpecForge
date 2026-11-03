const fs = require('node:fs'), path = require('node:path');
const assessment = JSON.parse(fs.readFileSync(path.join(__dirname, 'scene-assessment.json'), 'utf8'));
const objects = assessment.remaining.map(v => v.git_object).filter(Boolean);
if (assessment.git_commits.length !== 1) throw Error('UNIQUE_ORIGINAL_COMMIT_NOT_PROVEN');
const commit = assessment.git_commits[0];
const treeId = /^tree ([0-9a-f]{40})$/m.exec(commit.content)?.[1];
const tree = objects.find(v => v.id === treeId && v.header.startsWith('tree '));
if (!tree) throw Error('COMMIT_TREE_MISSING');
const bytes = Buffer.from(tree.content_base64, 'base64');
const entries = [];
for (let offset = 0; offset < bytes.length;) {
  const zero = bytes.indexOf(0, offset);
  if (zero < 0 || zero + 21 > bytes.length) throw Error('TREE_ENTRY_INVALID');
  entries.push({ mode_name: bytes.subarray(offset, zero).toString(), object_id: bytes.subarray(zero + 1, zero + 21).toString('hex') });
  offset = zero + 21;
}
if (entries.length !== 1 || entries[0].mode_name !== '100644 README.md' || !assessment.matching_archived_readme_blob_ids.includes(entries[0].object_id)) throw Error('COMMIT_ARCHIVE_README_LINK_NOT_PROVEN');
const result = { run_id: assessment.run_id, utc: new Date().toISOString(), method: 'Read-only surviving loose Git object and sealed archive linkage check',
  original_commit: commit.id, tree: treeId, entries, archive_sha256: assessment.source_sha256,
  verdict: 'CONFIRMED_ORIGINAL_COMMIT_TREE_README_LINKAGE',
  limits: 'Original branch/ref/index/config bytes were not captured; only detached original-commit reconstruction is supported by this evidence.',
  expected_writes: 'git-identity-proof.json only', observed_writes: 'git-identity-proof.json only', carrier_exit_code: 0, inner_exit_code: 0 };
fs.writeFileSync(path.join(__dirname, 'git-identity-proof.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
