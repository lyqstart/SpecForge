import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { planDetachedGitBootstrap, executeDetachedGitBootstrap } from '../../../packages/daemon-core/src/tools/lib/git-detached-bootstrap';
import { freezeValidationContract, evaluateValidationContract } from '../../../scripts/validation-contract-kernel';

const sha = (raw: Buffer) => createHash('sha256').update(raw).digest('hex');
if (process.argv[2] === 'child') {
  const payload = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const result = process.argv[4] === 'plan' ? await planDetachedGitBootstrap(payload.input)
    : await executeDetachedGitBootstrap(payload.execute, { onCheckpoint: async stage => { if (stage === payload.crash_at) process.exit(37); } });
  console.log(JSON.stringify(result));
} else {
  const suffix = process.argv[2] || 'initial'; if (!/^[a-z0-9-]+$/.test(suffix)) throw Error('INVALID_PROBE_SUFFIX');
  const output = path.join(import.meta.dir, 'process-crash-proof-' + suffix); fs.mkdirSync(output);
  const results = [];
  for (const stage of ['head_lease_acquired', 'refs_created', 'refs_and_head_bound', 'context_bound']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-detached-crash-'));
    const receipts: any[] = [];
    const command = (exe: string, args: string[], cwd = root) => {
      const started = new Date().toISOString(); const r = spawnSync(exe, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      receipts.push({ exe, args, cwd, started_utc: started, finished_utc: new Date().toISOString(), inner_exit_code: Number.isInteger(r.status) ? r.status : 1, stdout: r.stdout, stderr: r.stderr,
        input_payload: args[1] === 'child' ? { sha256: sha(fs.readFileSync(args[2])), bytes_base64: fs.readFileSync(args[2]).toString('base64') } : undefined });
      return r;
    };
    const git = (...args: string[]) => { const r = command('git', args); if (r.status !== 0) throw Error('FIXTURE_GIT_FAILED:' + r.stderr); return r.stdout.trim(); };
    git('init', '-b', 'seed'); git('config', 'user.name', 'Crash Fixture'); git('config', 'user.email', 'fixture@example.invalid');
    fs.writeFileSync(path.join(root, 'README.md'), '# owned crash fixture\n'); git('add', '--', 'README.md'); git('commit', '-m', 'fixture baseline');
    const head = git('rev-parse', 'HEAD'); git('switch', '--detach', head); git('branch', '-D', 'seed');
    const wi = path.join(root, '.specforge/work-items/WI-0001'); fs.mkdirSync(wi, { recursive: true });
    fs.writeFileSync(path.join(wi, 'work_item.json'), JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001', workflow_type: 'feature_spec', code_change_allowed: false, allowed_write_files: [] }));
    const baseline = { index: sha(fs.readFileSync(path.join(root, '.git/index'))), readme: sha(fs.readFileSync(path.join(root, 'README.md'))) };
    const assertions = { CRASH_EXIT: 37, RESUME_EXIT: 0, INDEX_SAME: true, README_SAME: true, HEAD_SAME: true, BRANCH: 'codex/crash-wi-0001', DEAD_LEASE_RETAINED: true, HEAD_LOCK_RELEASED: true };
    const contract = freezeValidationContract({ validator_id: 'detached-bootstrap-process-crash', validation_target: stage, validation_contract_id: 'DETACHED-GIT-BOOTSTRAP-PROCESS-001',
      contract_source: 'SPS §9.2; DETACHED-GIT-BOOTSTRAP-001', truth_source: 'actual child process exit + original fixture Git/filesystem', baseline_source: head,
      baseline_freshness: 'Captured immediately before child launch; only owned temporary fixture', assertions: Object.entries(assertions).map(([id, expected]) => ({ assertion_id: id,
        assertion_type: 'IMMUTABLE_EVIDENCE' as const, comparator: 'EQUALS' as const, baseline_mode: 'ABSOLUTE' as const, expected,
        truth_source: 'child receipt and independent fixture observation', contract_source: 'SPS §9.2', blocking: true })) });
    fs.writeFileSync(path.join(output, stage + '.contract.json'), JSON.stringify(contract, null, 2));
    const input = { projectRoot: root, workItemId: 'WI-0001', baseBranch: 'main', branchName: 'codex/crash-wi-0001', expectedHead: head };
    const planPayload = path.join(output, stage + '.plan-input.json'); fs.writeFileSync(planPayload, JSON.stringify({ input }), { flag: 'wx' });
    const planRun = command(process.execPath, [process.argv[1], 'child', planPayload, 'plan']); if (planRun.status !== 0) throw Error('PLAN_FAILED:' + planRun.stderr);
    const plan = JSON.parse(planRun.stdout), execute = { ...input, planSha256: plan.bootstrap_plan_sha256, confirmationQuote: '采用 main + codex/crash-wi-0001' };
    const payloadFile = path.join(output, stage + '.crash-input.json'); fs.writeFileSync(payloadFile, JSON.stringify({ input, execute, crash_at: stage }), { flag: 'wx' });
    const crashed = command(process.execPath, [process.argv[1], 'child', payloadFile, 'crash']);
    const leaseDir = path.join(root, '.git/specforge-branch-leases');
    const deadLeases = fs.readdirSync(leaseDir).map(name => ({ name, sha256: sha(fs.readFileSync(path.join(leaseDir, name))) }));
    const beforeResume = { head: git('rev-parse', 'HEAD'), refs: git('for-each-ref', '--format=%(refname) %(objectname)'), head_lock_present: fs.existsSync(path.join(root, '.git/HEAD.lock')), context_present: fs.existsSync(path.join(wi, 'git_context.json')) };
    const resumePayload = path.join(output, stage + '.resume.json'); fs.writeFileSync(resumePayload, JSON.stringify({ input, execute }));
    const resumed = command(process.execPath, [process.argv[1], 'child', resumePayload, 'resume']);
    const observed = { CRASH_EXIT: crashed.status, RESUME_EXIT: resumed.status, INDEX_SAME: sha(fs.readFileSync(path.join(root, '.git/index'))) === baseline.index,
      README_SAME: sha(fs.readFileSync(path.join(root, 'README.md'))) === baseline.readme, HEAD_SAME: git('rev-parse', 'HEAD') === head,
      BRANCH: git('branch', '--show-current'), DEAD_LEASE_RETAINED: deadLeases.length > 0 && deadLeases.every(lease => fs.existsSync(path.join(leaseDir, lease.name)) && sha(fs.readFileSync(path.join(leaseDir, lease.name))) === lease.sha256),
      HEAD_LOCK_RELEASED: !fs.existsSync(path.join(root, '.git/HEAD.lock')) };
    const validation = evaluateValidationContract(contract, observed);
    const result = { utc: new Date().toISOString(), stage, root, baseline, beforeResume, deadLeases, observed, validation, receipts, fixtures_retained: true };
    fs.writeFileSync(path.join(output, stage + '.result.json'), JSON.stringify(result, null, 2) + '\n'); results.push({ stage, validation: validation.validation_result, observed });
    if (validation.validation_result !== 'PASS') throw Error('PROCESS_CRASH_VALIDATION_FAILED:' + stage);
  }
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ utc: new Date().toISOString(), results, inner_exit_code: 0 }, null, 2) + '\n');
  console.log(JSON.stringify({ results, inner_exit_code: 0 }));
}
