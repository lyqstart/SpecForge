import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { executeCommand, parseReadOnlyCommand, appendShellAudit } from '../../src/tools/lib/sf_safe_bash_executor';
import { executeCommand as installedExecute } from '../../../../setup/userlevel-opencode/tools/lib/sf_safe_bash_executor';
import { safeBashExecute } from '../../src/tools/lib/sf_safe_bash_core';
import { safeBashExecute as installedCore } from '../../../../setup/userlevel-opencode/tools/lib/sf_safe_bash_core';
import { executeCommand as verifierExecute } from '../../../../setup/userlevel-opencode/tools/lib/sf_verifier_execution_core';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-safe-bash';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-shell-boundary-')); roots.push(root);
  fs.writeFileSync(path.join(root, 'input file.txt'), '原始内容\nhello\n');
  fs.writeFileSync(path.join(root, 'write.cjs'), "require('fs').writeFileSync('sentinel.txt','BAD')");
  fs.writeFileSync(path.join(root, 'child.cjs'), "require('child_process').execFileSync(process.execPath,['write.cjs'])");
  fs.writeFileSync(path.join(root, 'write.ps1'), "Set-Content sentinel.txt BAD");
  fs.writeFileSync(path.join(root, 'write.py'), "open('sentinel.txt','w').write('BAD')");
  fs.writeFileSync(path.join(root, 'write.cmd'), '@echo BAD>sentinel.txt');
  return root;
}
const commands = [
  `node -e "require('fs').writeFileSync('sentinel.txt','BAD')"`,
  'node write.cjs', 'node child.cjs', 'bun write.cjs', 'python write.py', 'py write.py',
  'powershell -File write.ps1', 'pwsh -Command "Start-Process node write.cjs"',
  'cmd /c write.cmd', './write.cmd', 'sh script.sh', 'bash -c "echo BAD > sentinel.txt"',
  'unknown-program input', 'npm test', 'bun test', 'npm run build', 'git status',
  'echo ok; node write.cjs', 'echo ok && node write.cjs', 'echo ok | node write.cjs',
  'echo $(node write.cjs)', 'echo `node write.cjs`', 'echo %COMSPEC%',
  'Get-Content "input file.txt"; node child.cjs', 'echo BAD > sentinel.txt',
  'echo BAD > .specforge/reports/result.txt; node child.cjs',
  'constructor file', '__proto__ file', 'toString file',
];
const executors = [
  ['source executor', (command: string, root: string, extra = {}) => executeCommand({ command, cwd: root, timeoutMs: 3000, outputLimit: 4096, ...extra })],
  ['template executor', (command: string, root: string, extra = {}) => installedExecute({ command, cwd: root, timeoutMs: 3000, outputLimit: 4096, ...extra })],
  ['source core', (command: string, root: string, extra = {}) => safeBashExecute({ command, ...extra }, root)],
  ['template core', (command: string, root: string, extra = {}) => installedCore({ command, ...extra }, root)],
] as const;

for (const [name, execute] of executors) describe(name, () => {
  it.each(commands)('refuses without process/file effects: %s', async command => {
    const root = fixture(), before = fs.readFileSync(path.join(root, 'input file.txt'));
    const result = await execute(command, root);
    expect(result).toMatchObject({ success: false, rejected: true, exitCode: null, shell: null, rule: 'SHELL_EXECUTION_UNAVAILABLE' });
    expect(fs.existsSync(path.join(root, 'sentinel.txt'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.specforge/reports/result.txt'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'input file.txt'))).toEqual(before);
  });
  it('retains actual reads, hash, list, literal text and missing-file semantics', async () => {
    const root = fixture();
    for (const command of ['cat "input file.txt"', "Get-Content -LiteralPath 'input file.txt'", 'type "input file.txt"']) {
      expect(await execute(command, root)).toMatchObject({ success: true, exitCode: 0, shell: null, stdout: '原始内容\nhello\n' });
    }
    expect((await execute('Get-FileHash "input file.txt"', root)).stdout.trim()).toBe(createHash('sha256').update(fs.readFileSync(path.join(root, 'input file.txt'))).digest('hex'));
    expect((await execute('ls', root)).stdout).toContain('input file.txt');
    expect((await execute('pwd', root)).stdout.trim()).toBe(fs.realpathSync(root));
    expect((await execute('echo "literal text"', root)).stdout).toBe('literal text\n');
    expect((await execute('Test-Path absent.txt', root)).stdout).toBe('false\n');
    expect(await execute('cat absent.txt', root)).toMatchObject({ success: false, exitCode: 1 });
    expect((await execute('cat "input file.txt"', root, { outputLimit: 3 })).stdout).toBe('原始内');
  });
  it('rejects env and stdin even for harmless text and ignores no hidden fallback', async () => {
    const root = fixture();
    for (const extra of [{ env: { NODE_OPTIONS: '--require ./write.cjs' } }, { env: {} }, { stdin: 'node write.cjs' }, { stdin: '' }]) expect(await execute('echo okay', root, extra)).toMatchObject({ success: false, rejected: true });
    expect(fs.existsSync(path.join(root, 'sentinel.txt'))).toBe(false);
  });
});

describe('state, reports, observer and fallback closure', () => {
  it.each(['closed', 'implementation_running', 'created'])('handler cannot bypass via state %s', async state => {
    const root = fixture(), wi = path.join(root, '.specforge/work-items/WI-0001'); fs.mkdirSync(wi, { recursive: true });
    fs.writeFileSync(path.join(wi, 'work_item.json'), JSON.stringify({ schema_version: '1.1', work_item_id: 'WI-0001', workflow_type: 'feature_spec', code_change_allowed: true, code_permission_revoked: false, allowed_write_files: [{ path: 'sentinel.txt', operation: 'create' }] }));
    const manager = { rebuildState: async () => {}, listWorkItems: () => [{ work_item_id: 'WI-0001', current_state: state }] };
    const deps = { projectManager: { getProjectStateManager: async () => manager } };
    const handler = getHandler('sf_safe_bash')!;
    for (const command of ['node write.cjs', 'node child.cjs', 'echo BAD > .specforge/reports/result.txt; node child.cjs']) {
      const result: any = await handler({ command, work_item_id: 'WI-0001' }, { directory: root, agent: 'sf-executor' }, deps as any);
      expect(result.success).toBe(false);
      expect(fs.existsSync(path.join(root, 'sentinel.txt'))).toBe(false);
      expect(fs.existsSync(path.join(root, '.specforge/reports/result.txt'))).toBe(false);
    }
    const history = fs.readFileSync(path.join(root, '.specforge/runtime/logs/shell-history.jsonl'), 'utf8').trim().split('\n').map(s => JSON.parse(s));
    expect(history).toHaveLength(3); expect(history.every(e => e.success === false)).toBe(true);
    expect(await handler({ command: 'echo READ_OK' }, { directory: root, agent: 'sf-executor' }, deps as any)).toMatchObject({ success: true, stdout: 'READ_OK\n' });
  });
  it('does not expose the historical verifier as another executable route', async () => {
    expect(await verifierExecute({ command: 'node write.cjs', type: 'unit' })).toMatchObject({ status: 'failed', exit_code: -1 });
    expect(await verifierExecute({ command: 'echo READ_OK', type: 'unit' })).toMatchObject({ status: 'passed', exit_code: 0, stdout: 'READ_OK\n' });
  });
  it('configuration timeout and bounded output apply to internal operations', async () => {
    const root = fixture();
    expect(await executeCommand({ command: 'sleep 0.1', cwd: root, timeoutMs: 20, outputLimit: 10 })).toMatchObject({ success: false, timeout: true, exitCode: null });
    expect(await executeCommand({ command: 'sleep 0.01', cwd: root, timeoutMs: 100, outputLimit: 10 })).toMatchObject({ success: true, timeout: false });
    expect(await executeCommand({ command: 'echo hello', cwd: root, timeoutMs: NaN, outputLimit: -1 })).toMatchObject({ rejected: true });
  });
  it('observer sink cannot append to a hardlinked business file', () => {
    const root = fixture(), dir = path.join(root, '.specforge/runtime/logs'); fs.mkdirSync(dir, { recursive: true });
    fs.linkSync(path.join(root, 'input file.txt'), path.join(dir, 'shell-history.jsonl'));
    appendShellAudit(root, { success: false });
    expect(fs.readFileSync(path.join(root, 'input file.txt'), 'utf8')).toBe('原始内容\nhello\n');
  });
  it('blocks external, linked and owner-only read paths', async () => {
    const root = fixture(); fs.mkdirSync(path.join(root, '.specforge/runtime'), { recursive: true });
    fs.writeFileSync(path.join(root, '.specforge/runtime/handshake.json'), 'PRIVATE');
    fs.symlinkSync(root, path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const command of ['cat ../outside', 'cat .specforge/runtime/handshake.json', 'cat "alias/input file.txt"']) expect(await executeCommand({ command, cwd: root, timeoutMs: 1000, outputLimit: 4096 })).toMatchObject({ success: false });
  });
  it.each(['echo "x"node write.cjs', 'echo "unterminated', 'echo x\nnode write.cjs', 'pwd extra', 'ls a b'])('rejects malformed or compound syntax: %s', command => { expect(parseReadOnlyCommand(command)).toBeNull(); });
});
