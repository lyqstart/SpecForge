/**
 * v11-tool-registry-writeguard.test.ts
 *
 * Tests for:
 * 1. v1.1 tool registry: all 6 public-facing tools must be registered
 * 2. WriteGuard classification: todowrite not blocked, sf_safe_bash not bypassed
 * 3. Bash write detection: python/base64/node write patterns detected
 */
import { describe, it, expect, beforeAll } from 'vitest';

// Import to trigger handler registration
import '../../src/tools/index';
import { getHandler } from '../../src/tools/ToolDispatcher';

describe('v1.1 Tool Registry', () => {
  const REQUIRED_V11_TOOLS = [
    'sf_gate_run',
    'sf_code_permission',
    'sf_user_decision_record',
    'sf_merge_run',
    'sf_changed_files_audit',
    'sf_close_gate',
  ];

  for (const toolName of REQUIRED_V11_TOOLS) {
    it(`${toolName} must be registered and not return UNKNOWN_TOOL`, () => {
      const handler = getHandler(toolName);
      expect(handler).toBeDefined();
      expect(typeof handler).toBe('function');
    });
  }

  it('sf_v11_gate_run (internal name) must also be registered', () => {
    expect(getHandler('sf_v11_gate_run')).toBeDefined();
  });

  it('sf_v11_code_permission (internal name) must also be registered', () => {
    expect(getHandler('sf_v11_code_permission')).toBeDefined();
  });

  it('sf_v11_decision (internal name) must also be registered', () => {
    expect(getHandler('sf_v11_decision')).toBeDefined();
  });

  it('sf_v11_merge (internal name) must also be registered', () => {
    expect(getHandler('sf_v11_merge')).toBeDefined();
  });
});

describe('WriteGuard Tool Classification', () => {
  // Inline the classification logic for testing
  const NON_FILESYSTEM_PLANNING_TOOLS = new Set([
    'todowrite', 'todoread', 'todoupdate', 'tododelete',
    'todolist', 'todoadd', 'todocreate',
  ]);

  const SPECFORGE_CONTROL_TOOLS = new Set([
    'sf_gate_run', 'sf_user_decision_record', 'sf_merge_run',
    'sf_code_permission', 'sf_changed_files_audit', 'sf_close_gate',
    'sf_state_read', 'sf_state_transition', 'sf_doc_lint',
    'sf_trace_matrix', 'sf_context_build', 'sf_cost_report',
    'sf_doctor', 'sf_continuity', 'sf_knowledge_base',
    'sf_knowledge_graph', 'sf_knowledge_query', 'sf_batch_verify',
  ]);

  const SHELL_TOOLS = new Set([
    'bash', 'shell', 'execute', 'run', 'terminal', 'cmd', 'powershell',
    'sf_safe_bash',
  ]);

  function isWriteTool(toolName: string): boolean {
    const normalized = toolName.toLowerCase().replace(/[_-]/g, '');
    if (NON_FILESYSTEM_PLANNING_TOOLS.has(normalized)) return false;
    if (SPECFORGE_CONTROL_TOOLS.has(toolName)) return false;
    if (normalized.includes('write') || normalized.includes('edit')) return true;
    if (normalized.includes('patch') || normalized.includes('create')) return true;
    if (normalized.includes('delete') || normalized.includes('remove')) return true;
    return false;
  }

  function isShellTool(toolName: string): boolean {
    const normalized = toolName.toLowerCase().replace(/[_-]/g, '');
    return SHELL_TOOLS.has(toolName) || SHELL_TOOLS.has(normalized);
  }

  it('todowrite must NOT be classified as write tool', () => {
    expect(isWriteTool('todowrite')).toBe(false);
  });

  it('todo_write must NOT be classified as write tool', () => {
    expect(isWriteTool('todo_write')).toBe(false);
  });

  it('sf_safe_bash must NOT be bypassed by sf* prefix — must be shell tool', () => {
    expect(isShellTool('sf_safe_bash')).toBe(true);
    // sf_safe_bash is NOT a specforge control tool
    expect(SPECFORGE_CONTROL_TOOLS.has('sf_safe_bash')).toBe(false);
  });

  it('sf_artifact_write must NOT be in specforge control tools (it writes files)', () => {
    expect(SPECFORGE_CONTROL_TOOLS.has('sf_artifact_write')).toBe(false);
  });

  it('sf_gate_run must be classified as specforge control tool (non-filesystem)', () => {
    expect(isWriteTool('sf_gate_run')).toBe(false);
    expect(SPECFORGE_CONTROL_TOOLS.has('sf_gate_run')).toBe(true);
  });

  it('sf_code_permission must be classified as specforge control tool', () => {
    expect(isWriteTool('sf_code_permission')).toBe(false);
    expect(SPECFORGE_CONTROL_TOOLS.has('sf_code_permission')).toBe(true);
  });

  it('write_file must still be classified as write tool', () => {
    expect(isWriteTool('write_file')).toBe(true);
  });

  it('edit must still be classified as write tool', () => {
    expect(isWriteTool('edit')).toBe(true);
  });
});

describe('Bash Write Detection', () => {
  function isBashReadOnly(command: string): boolean {
    const readOnlyPrefixes = [
      'cat ', 'ls ', 'dir ', 'echo ', 'printf ', 'head ', 'tail ',
      'grep ', 'rg ', 'find ', 'which ', 'where ', 'type ',
      'pwd', 'whoami', 'date', 'uname', 'env ', 'printenv',
      'git status', 'git log', 'git diff', 'git show', 'git branch',
      'git remote', 'git tag', 'npm list', 'npm ls', 'npm info',
      'yarn list', 'yarn info', 'pnpm list',
      'test ', '[ ', '[[ ',
    ];
    const trimmed = command.trim();
    if (trimmed.startsWith('python -c') || trimmed.startsWith('python3 -c') ||
        trimmed.startsWith('node -e') || trimmed.startsWith('node --eval')) {
      const hasWriteIndicators = /open\s*\(|write|makedirs|mkdir|Path\(|base64|decode|Set-Content|Out-File|New-Item|>|>>|tee\s/i.test(trimmed);
      if (hasWriteIndicators) return false;
      return true;
    }
    return readOnlyPrefixes.some(p => trimmed.startsWith(p));
  }

  function isBashWriteCommand(command: string): boolean {
    const writePatterns = [
      /\bcp\b/, /\bmv\b/, /\brm\b/, /\bmkdir\b/, /\brmdir\b/,
      /\btouch\b/, /\bchmod\b/, /\bchown\b/,
      /\bnpm install\b/, /\bnpm i\b/, /\byarn add\b/, /\bpnpm add\b/,
      /\bgit (add|commit|push|merge|rebase|reset|checkout|stash|apply)\b/,
      /\bsed\b.*-i/, /\bawk\b.*-i/,
      />/, />>/, /\btee\b/,
      /python[3]?\s+-c\s+.*\b(open|write|makedirs|Path)\b/i,
      /node\s+-e\s+.*(writeFile|appendFile|mkdirSync|createWriteStream)/i,
      /base64.*decode/i,
      /\bpowershell\b.*\b(Set-Content|Out-File|New-Item|Add-Content)\b/i,
    ];
    return writePatterns.some(p => p.test(command));
  }

  it('python -c with open() must NOT be read-only', () => {
    expect(isBashReadOnly('python -c "open(\'file.txt\',\'w\').write(\'hello\')"')).toBe(false);
  });

  it('python -c with os.makedirs must NOT be read-only', () => {
    expect(isBashReadOnly('python -c "import os; os.makedirs(\'dir\')"')).toBe(false);
  });

  it('python -c with base64 decode must NOT be read-only', () => {
    expect(isBashReadOnly('python -c "import base64; data=base64.b64decode(\'...\'); open(\'f\',\'wb\').write(data)"')).toBe(false);
  });

  it('python -c "print(1+1)" must be read-only (no write indicators)', () => {
    expect(isBashReadOnly('python -c "print(1+1)"')).toBe(true);
  });

  it('node -e with writeFileSync must NOT be read-only', () => {
    expect(isBashReadOnly('node -e "require(\'fs\').writeFileSync(\'f\',\'data\')"')).toBe(false);
  });

  it('node -e "console.log(1)" must be read-only', () => {
    expect(isBashReadOnly('node -e "console.log(1)"')).toBe(true);
  });

  it('isBashWriteCommand detects python -c open()', () => {
    expect(isBashWriteCommand('python -c "open(\'file\',\'w\').write(\'x\')"')).toBe(true);
  });

  it('isBashWriteCommand detects base64 decode', () => {
    expect(isBashWriteCommand('echo "dGVzdA==" | base64 --decode > file.txt')).toBe(true);
  });

  it('isBashWriteCommand detects node -e writeFileSync', () => {
    expect(isBashWriteCommand('node -e "require(\'fs\').writeFileSync(\'f\',\'d\')"')).toBe(true);
  });

  it('isBashWriteCommand detects powershell Set-Content', () => {
    expect(isBashWriteCommand('powershell -c "Set-Content -Path f.txt -Value hello"')).toBe(true);
  });

  it('cat file.txt must remain read-only', () => {
    expect(isBashReadOnly('cat file.txt')).toBe(true);
  });

  it('ls must remain read-only', () => {
    expect(isBashReadOnly('ls -la')).toBe(true);
  });
});
