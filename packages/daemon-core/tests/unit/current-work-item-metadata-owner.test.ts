import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-v11-work-item-create';
import '../../src/tools/handlers/sf-v11-code-permission';
import '../../src/tools/handlers/sf-v11-close-gate';
import '../../src/tools/handlers/sf-v11-rollback';
import '../../src/tools/handlers/sf-state-transition';
import '../../src/tools/handlers/sf-artifact-write';
import '../../src/tools/handlers/sf-v11-gate-run';
import '../../src/tools/handlers/sf-changed-files-audit';
import '../../src/tools/handlers/sf-v11-decision';
import '../../src/tools/handlers/sf-v11-merge';
import '../../src/tools/handlers/sf-semantic-closure-run';
import '../../src/tools/handlers/sf-safe-bash';
import { validateWorkItemJson } from '../../src/tools/lib/artifact-schema-validation';
import { createWorkItem } from '../../src/tools/lib/work-item-lifecycle-v11';
import {
  enforceRuntimeWriteGuardForShell,
  extractShellWriteTargets,
} from '../../src/tools/lib/write-guard-runtime-v12';
import * as stateMachine from '../../src/tools/lib/state-machine-v11';
import { HTTPServer } from '../../src/http/HTTPServer';
import { DaemonConfig } from '../../src/daemon/DaemonConfig';
import { EventBus } from '../../src/event-bus/EventBus';

const roots: string[] = [];

async function makeProjectRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-current-wi-owner-'));
  roots.push(root);
  const projectDir = path.join(root, '.specforge', 'project');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'spec_manifest.json'),
    JSON.stringify({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      modules: [],
    }, null, 2) + '\n',
    'utf8',
  );
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('current Work Item metadata owner', () => {
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler('sf_v11_work_item_create')!;
    expect(handler).toBeDefined();
  });

  it('rejects a non-current Work Item metadata schema', () => {
    const result = validateWorkItemJson(
      JSON.stringify({ schema_version: '1.0', work_item_id: 'WI-0001' }),
      'WI-0001',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'WORK_ITEM_SCHEMA_VERSION_UNSUPPORTED: expected "1.1", got "1.0"',
    );
  });

  it('does not expose the legacy work_item.json status resume reader', () => {
    expect(stateMachine).not.toHaveProperty('performResumeCheck');
  });

  it('creates schema 1.1 metadata without a shadow lifecycle status', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = await createWorkItem({
      projectRoot,
      workItemId: 'WI-0001',
      userRequest: 'Create current Work Item metadata.',
      workflowType: 'feature_spec',
      workflowPath: 'requirement_change_path',
    });

    const content = await fs.readFile(path.join(workItemDir, 'work_item.json'), 'utf8');
    const metadata = JSON.parse(content);
    expect(metadata.schema_version).toBe('1.1');
    expect(metadata).not.toHaveProperty('status');
    expect(metadata.workflow_type).toBe('feature_spec');
    expect(metadata.workflow_path).toBe('requirement_change_path');
    expect(validateWorkItemJson(content, 'WI-0001')).toEqual({ valid: true, errors: [] });
  });

  it('persists workflow metadata while advancing lifecycle only through StateManager', async () => {
    const projectRoot = await makeProjectRoot();
    const transition = vi.fn().mockResolvedValue(undefined);
    const result = await handler(
      {
        work_item_id: 'WI-0002',
        user_request: 'Create a governed feature Work Item.',
        classification: {
          requirement_changed: true,
          design_changed: false,
          architecture_changed: false,
          unknowns: [],
        },
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      { projectManager: { getProjectStateManager: vi.fn().mockResolvedValue({ transition }) } },
    );

    expect(result.success).toBe(true);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      'WI-0002',
      '',
      'intake_ready',
      'sf-orchestrator',
      'feature_spec',
      { workflow_path: 'requirement_change_path' },
    );

    const content = await fs.readFile(
      path.join(projectRoot, '.specforge', 'work-items', 'WI-0002', 'work_item.json'),
      'utf8',
    );
    const metadata = JSON.parse(content);
    expect(metadata).not.toHaveProperty('status');
    expect(metadata.workflow_type).toBe('feature_spec');
    expect(metadata.workflow_path).toBe('requirement_change_path');
    expect(validateWorkItemJson(content, 'WI-0002')).toEqual({ valid: true, errors: [] });
  });

  it('allocates identity and preserves the original request in the single create owner', async () => {
    const projectRoot = await makeProjectRoot();
    const transition = vi.fn().mockResolvedValue(undefined);
    const originalRequest = 'Preserve this exact user request in the governed intake.';

    const result = await handler(
      {
        user_request: originalRequest,
        classification: {
          requirement_changed: false,
          design_changed: false,
          architecture_changed: false,
          unknowns: [],
        },
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      { projectManager: { getProjectStateManager: vi.fn().mockResolvedValue({ transition }) } },
    );

    expect(result).toMatchObject({
      success: true,
      work_item_id: 'WI-0001',
      status: 'intake_ready',
    });
    expect(transition).toHaveBeenCalledWith(
      'WI-0001',
      '',
      'intake_ready',
      'sf-orchestrator',
      expect.any(String),
      expect.any(Object),
    );
    await expect(fs.readFile(
      path.join(projectRoot, '.specforge', 'work-items', 'WI-0001', 'intake.md'),
      'utf8',
    )).resolves.toContain(originalRequest);
  });

  it('fails closed instead of overwriting an existing Work Item directory', async () => {
    const projectRoot = await makeProjectRoot();
    const firstDir = await createWorkItem({
      projectRoot,
      workItemId: 'WI-0003',
      userRequest: 'Original request that must be preserved.',
      workflowType: 'quick_change',
      workflowPath: 'code_only_fast_path',
    });
    const intakePath = path.join(firstDir, 'intake.md');
    const originalIntake = await fs.readFile(intakePath, 'utf8');

    await expect(createWorkItem({
      projectRoot,
      workItemId: 'WI-0003',
      userRequest: 'Replacement request must be rejected.',
      workflowType: 'quick_change',
      workflowPath: 'code_only_fast_path',
    })).rejects.toThrow('WORK_ITEM_ALREADY_EXISTS: WI-0003');
    await expect(fs.readFile(intakePath, 'utf8')).resolves.toBe(originalIntake);
  });

  it('keeps state transition from acting as a second Work Item creation owner', async () => {
    const projectRoot = await makeProjectRoot();
    const transitionHandler = getHandler('sf_state_transition')!;
    const transition = vi.fn().mockResolvedValue(undefined);

    const result = await transitionHandler(
      {
        work_item_id: 'WI-0009',
        from_state: '',
        to_state: 'created',
        workflow_type: 'quick_change',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({ transition }),
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      code: 'WORK_ITEM_CREATE_TOOL_REQUIRED',
    });
    expect(transition).not.toHaveBeenCalled();
    await expect(fs.access(
      path.join(projectRoot, '.specforge', 'work-items', 'WI-0009'),
    )).rejects.toBeTruthy();
  });

  it('does not let code permission synthesize an unknown Work Item', async () => {
    const projectRoot = await makeProjectRoot();
    const permissionHandler = getHandler('sf_v11_code_permission')!;
    const result = await permissionHandler(
      {
        work_item_id: 'WI-0004',
        action: 'release',
        allowed_write_files: [{ path: 'src/current.ts', operation: 'modify' }],
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({
            getState: vi.fn().mockResolvedValue({ current_state: 'implementation_ready' }),
            transition: vi.fn().mockResolvedValue(undefined),
          }),
        },
      },
    );

    expect(result).toMatchObject({
      success: false,
      error: 'WORK_ITEM_NOT_FOUND: WI-0004',
    });
    await expect(fs.access(
      path.join(projectRoot, '.specforge', 'work-items', 'WI-0004'),
    )).rejects.toBeTruthy();
  });

  it('makes code permission fail closed on non-current metadata without rewriting it', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0007');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0007',
      workflow_type: 'contract_change',
      workflow_path: 'contract_change_path',
      code_change_allowed: false,
      allowed_write_files: [],
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const permissionHandler = getHandler('sf_v11_code_permission')!;
    const result = await permissionHandler(
      {
        work_item_id: 'WI-0007',
        action: 'release',
        allowed_write_files: [{ path: 'src/current.ts', operation: 'modify' }],
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({
            getState: vi.fn().mockResolvedValue({ current_state: 'implementation_ready' }),
            transition: vi.fn().mockResolvedValue(undefined),
          }),
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0007');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
  });

  it('makes close fail at its first read on non-current metadata without rewriting it', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0008');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0008',
      workflow_type: 'quick_change',
      workflow_path: 'code_only_fast_path',
      code_change_allowed: false,
      allowed_write_files: [],
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const closeHandler = getHandler('sf_close_gate')!;
    const result = await closeHandler(
      { work_item_id: 'WI-0008' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({
            rebuildFromEventsFile: vi.fn().mockResolvedValue(undefined),
            getState: vi.fn().mockResolvedValue({ current_state: 'verification_done' }),
          }),
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0008');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
  });

  it('makes artifact write fail before its first metadata read on a non-current Work Item', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0010');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0010',
      workflow_type: 'quick_change',
      workflow_path: 'code_only_fast_path',
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const artifactHandler = getHandler('sf_artifact_write')!;
    const result = await artifactHandler(
      {
        work_item_id: 'WI-0010',
        file_type: 'intake',
        content: '# Intake\n\nMust not be written from invalid metadata.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0010');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
    await expect(fs.access(path.join(workItemDir, 'intake.md'))).rejects.toBeTruthy();
  });

  it('makes gate run fail before workflow inference on non-current Work Item metadata', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0011');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0011',
      workflow_type: 'quick_change',
      workflow_path: 'code_only_fast_path',
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const gateHandler = getHandler('sf_v11_gate_run')!;
    const result = await gateHandler(
      { work_item_id: 'WI-0011', gate_ids: ['entry_gate'] },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({
            rebuildFromEventsFile: vi.fn().mockResolvedValue(undefined),
            getState: vi.fn().mockResolvedValue({ current_state: 'candidate_preparing' }),
          }),
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0011');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
    await expect(fs.access(path.join(workItemDir, 'gates'))).rejects.toBeTruthy();
  });

  it('makes changed-files audit reject non-current metadata without creating a HardStop', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0012');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0012',
      workflow_type: 'quick_change',
      workflow_path: 'code_only_fast_path',
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const auditHandler = getHandler('sf_changed_files_audit')!;
    const result = await auditHandler(
      { work_item_id: 'WI-0012', actual_changed_files: [] },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0012');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
    await expect(fs.access(path.join(workItemDir, 'hard_stop.json'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(workItemDir, 'changed_files_audit.md'))).rejects.toBeTruthy();
  });

  it('makes user decision reject non-current metadata before recording a decision', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0013');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0013',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const decisionHandler = getHandler('sf_v11_decision')!;
    const result = await decisionHandler(
      {
        work_item_id: 'WI-0013',
        decision_status: 'rejected',
        decision_type: 'rejected',
        comments: 'Reject invalid metadata fixture.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({
            rebuildFromEventsFile: vi.fn().mockResolvedValue(undefined),
            getState: vi.fn().mockResolvedValue({ current_state: 'approval_required' }),
          }),
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0013');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
    await expect(fs.access(path.join(workItemDir, 'user_decision.json'))).rejects.toBeTruthy();
  });

  it('makes merge reject non-current metadata before merge preflight or evidence writes', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0014');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0014',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const mergeHandler = getHandler('sf_v11_merge')!;
    const result = await mergeHandler(
      { work_item_id: 'WI-0014' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0014');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
    await expect(fs.access(path.join(workItemDir, 'merge_report.md'))).rejects.toBeTruthy();
  });

  it('makes semantic closure reject non-current metadata before reading verification inputs', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0015');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0015',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const closureHandler = getHandler('sf_v11_semantic_closure_run')!;
    const result = await closureHandler(
      { work_item_id: 'WI-0015' },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({
            rebuildFromEventsFile: vi.fn().mockResolvedValue(undefined),
            getState: vi.fn().mockResolvedValue({ current_state: 'implementation_done' }),
          }),
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0015');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
    await expect(fs.access(path.join(workItemDir, '.semantic_closure.json'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(workItemDir, 'semantic_closure_report.md'))).rejects.toBeTruthy();
  });

  it('makes safe bash reject non-current metadata before authorization or shell execution', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0016');
    await fs.mkdir(workItemDir, { recursive: true });
    const metadataPath = path.join(workItemDir, 'work_item.json');
    const original = JSON.stringify({
      schema_version: '1.0',
      work_item_id: 'WI-0016',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      code_change_allowed: true,
      allowed_write_files: [{ path: 'src/current.ts', operation: 'modify' }],
    }, null, 2) + '\n';
    await fs.writeFile(metadataPath, original, 'utf8');

    const safeBashHandler = getHandler('sf_safe_bash')!;
    const result = await safeBashHandler(
      {
        work_item_id: 'WI-0016',
        command: 'Set-Content -Path src/current.ts -Value value',
      },
      { directory: projectRoot, agent: 'sf-executor' },
      {},
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('WORK_ITEM_METADATA_INVALID: WI-0016');
    await expect(fs.readFile(metadataPath, 'utf8')).resolves.toBe(original);
    await expect(fs.access(path.join(workItemDir, 'hard_stop.json'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(workItemDir, 'write_guard_log.jsonl'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(projectRoot, 'src', 'current.ts'))).rejects.toBeTruthy();
  });

  it('makes the runtime write guard fail closed on non-current metadata without side effects', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0017');
    await fs.mkdir(workItemDir, { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.specforge', 'runtime'), { recursive: true });
    await fs.writeFile(
      path.join(workItemDir, 'work_item.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0017',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/current.ts', operation: 'modify' }],
      }, null, 2) + '\n',
      'utf8',
    );
    await fs.writeFile(
      path.join(projectRoot, '.specforge', 'runtime', 'state.json'),
      JSON.stringify({
        workItems: [{ work_item_id: 'WI-0017', current_state: 'implementation_running' }],
      }, null, 2) + '\n',
      'utf8',
    );

    const command = 'Set-Content -Path src/current.ts -Value value';
    expect(extractShellWriteTargets(command)).toEqual([
      { path: 'src/current.ts', operation: 'create' },
    ]);
    const result = enforceRuntimeWriteGuardForShell({
      projectRoot,
      workItemId: 'WI-0017',
      command,
      callerRole: 'executor',
      tool: 'sf_safe_bash',
    });

    expect(result.checked).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.violations.join('; ')).toContain('WORK_ITEM_METADATA_INVALID: WI-0017');
    expect(result.hard_stop).toBe(false);
    await expect(fs.access(path.join(workItemDir, 'hard_stop.json'))).rejects.toBeTruthy();
    await expect(fs.access(path.join(workItemDir, 'write_guard_log.jsonl'))).rejects.toBeTruthy();
  });

  it('keeps HTTP WriteGuard context from projecting non-current metadata as an active WI', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0018');
    await fs.mkdir(workItemDir, { recursive: true });
    await fs.writeFile(
      path.join(workItemDir, 'work_item.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0018',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/current.ts', operation: 'modify' }],
      }, null, 2) + '\n',
      'utf8',
    );

    const server = new HTTPServer({
      config: new DaemonConfig([]),
      eventBus: new EventBus(),
      stateManager: {} as any,
      wal: {} as any,
      projectManager: {
        getProjectStateManager: vi.fn().mockResolvedValue({
          rebuildFromEventsFile: vi.fn().mockResolvedValue(undefined),
          getState: vi.fn().mockResolvedValue({ current_state: 'implementation_running' }),
        }),
      },
    } as any);
    const context = await (server as any).loadWriteGuardContext(projectRoot, 'agent');

    expect(context.hasActiveWI).toBe(false);
    expect(context.workItem).toBeUndefined();
    expect(context.metadata_error).toContain('WORK_ITEM_METADATA_INVALID: WI-0018');
    await expect(fs.access(path.join(workItemDir, 'write_guard_log.jsonl'))).rejects.toBeTruthy();
  });

  it('makes every HTTP WriteGuard entry fail closed on non-current active metadata', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', 'WI-0019');
    await fs.mkdir(workItemDir, { recursive: true });
    await fs.writeFile(
      path.join(workItemDir, 'work_item.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0019',
        code_change_allowed: true,
        allowed_write_files: [{ path: 'src/current.ts', operation: 'modify' }],
      }, null, 2) + '\n',
      'utf8',
    );

    const server = new HTTPServer({
      config: new DaemonConfig([]),
      eventBus: new EventBus(),
      stateManager: {} as any,
      wal: {} as any,
      projectManager: {
        getProjectStateManager: vi.fn().mockResolvedValue({
          rebuildFromEventsFile: vi.fn().mockResolvedValue(undefined),
          getState: vi.fn().mockResolvedValue({ current_state: 'implementation_running' }),
        }),
      },
    } as any);
    const invoke = async (handlerName: string, body: Record<string, unknown>) => {
      const response = { writeHead: vi.fn(), end: vi.fn() };
      await (server as any)[handlerName]({}, response, JSON.stringify({ projectPath: projectRoot, ...body }));
      return JSON.parse(response.end.mock.calls[0][0]);
    };

    const check = await invoke('handleV11WriteGuardCheck', { targetPath: 'src/current.ts' });
    expect(check.data.allowed).toBe(false);
    expect(check.data.violations[0]).toContain('WORK_ITEM_METADATA_INVALID: WI-0019');

    const bash = await invoke('handleV11WriteGuardBash', {
      command: 'Set-Content -Path src/current.ts -Value value',
      expectedFiles: ['src/current.ts'],
    });
    expect(bash.data.allowed).toBe(false);
    expect(bash.data.violations[0]).toContain('WORK_ITEM_METADATA_INVALID: WI-0019');

    const audit = await invoke('handleV11WriteGuardAudit', {
      changedFiles: [{ path: 'src/current.ts', operation: 'modify' }],
    });
    expect(audit.data.passed).toBe(false);
    expect(audit.data.escapedWrites).toEqual([]);
    expect(audit.data.violations[0]).toContain('WORK_ITEM_METADATA_INVALID: WI-0019');
    await expect(fs.access(path.join(workItemDir, 'write_guard_log.jsonl'))).rejects.toBeTruthy();
  });

  it('records rollback supersession metadata while transitioning state through StateManager', async () => {
    const projectRoot = await makeProjectRoot();
    const workItemDir = await createWorkItem({
      projectRoot,
      workItemId: 'WI-0005',
      userRequest: 'Original Work Item to supersede.',
      workflowType: 'quick_change',
      workflowPath: 'code_only_fast_path',
    });
    const transition = vi.fn().mockResolvedValue(undefined);
    const rollbackHandler = getHandler('sf_v11_rollback')!;

    const result = await rollbackHandler(
      {
        action: 'supersede',
        original_work_item_id: 'WI-0005',
        superseded_by_work_item_id: 'WI-0006',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      {
        projectManager: {
          getProjectStateManager: vi.fn().mockResolvedValue({
            getState: vi.fn().mockResolvedValue({ current_state: 'verification_done' }),
            transition,
          }),
        },
      },
    );

    expect(result).toMatchObject({ success: true, status: 'superseded' });
    expect(transition).toHaveBeenCalledWith(
      'WI-0005',
      'verification_done',
      'superseded',
      'sf-orchestrator',
      'quick_change',
      expect.objectContaining({ evidence: expect.any(String) }),
    );
    const content = await fs.readFile(path.join(workItemDir, 'work_item.json'), 'utf8');
    const metadata = JSON.parse(content);
    expect(metadata).not.toHaveProperty('status');
    expect(metadata.superseded_by).toBe('WI-0006');
    expect(validateWorkItemJson(content, 'WI-0005')).toEqual({ valid: true, errors: [] });
  });
});
