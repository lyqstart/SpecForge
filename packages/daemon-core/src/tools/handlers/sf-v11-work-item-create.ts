/**
 * sf-v11-work-item-create — v1.1 Work Item 创建 handler
 *
 * V12:
 * - workflow_type is preserved from classification when available.
 * - workflow_path remains the coarse route.
 * - bugfix_spec must not be silently persisted as feature_spec.
 */
import { join } from 'node:path';
import { registerHandler } from '../ToolDispatcher';
import {
  allocateNextWorkItemId,
  createWorkItem,
  initializeClosureFiles,
  readAuthoritativeProjectSpecVersion,
} from '../lib/work-item-lifecycle-v11';
import { selectWorkflowPath, generateTriggerResult } from '../lib/workflow-path-selector-v11';
import {
  validateChangeClassification,
  type ChangeClassification,
} from '../lib/change-classification';
import {
  WORKFLOW_TYPE_TO_PATH,
  resolveWorkflowTypeForPath,
  type WorkflowPath,
  type WorkflowType,
} from '../lib/state_machine';
import * as fs from 'node:fs/promises';

async function isPlaceholder(filePath: string): Promise<boolean> {
  try {
    const content = (await fs.readFile(filePath, 'utf-8')).trim();
    return !content || content.startsWith('> TODO') || content === '# TODO';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function requiredGreenfieldClassificationFields(
  projectRoot: string,
): Promise<string[]> {
  const projectDir = join(projectRoot, '.specforge', 'project');
  let manifest: Record<string, any>;
  try {
    manifest = JSON.parse(await fs.readFile(join(projectDir, 'spec_manifest.json'), 'utf-8'));
  } catch {
    return [];
  }
  if (manifest.project_spec_version !== 'PSV-0001' || manifest.last_merged_work_item) return [];
  const defaultModule = String(manifest.default_module ?? 'CORE');
  const moduleDir = join(projectDir, 'modules', defaultModule);
  const architecturePlaceholder = await isPlaceholder(join(projectDir, 'architecture.md'));
  const designPlaceholder = await isPlaceholder(join(moduleDir, 'design.md'));
  if (!architecturePlaceholder || !designPlaceholder) return [];
  return [
    'architecture_changed',
    'design_changed',
  ];
}

function isKnownWorkflowType(value: string | undefined): value is WorkflowType {
  return !!value && Object.prototype.hasOwnProperty.call(WORKFLOW_TYPE_TO_PATH, value);
}

function normalizeWorkflowPath(value: string | null | undefined): WorkflowPath | undefined {
  return value ? (value as WorkflowPath) : undefined;
}

function workflowCompatibilityError(workflowType: string, workflowPath: string | null | undefined): Error {
  return new Error(
    `INCOMPATIBLE_WORKFLOW_TYPE_AND_PATH: workflow_type=${workflowType}; workflow_path=${workflowPath ?? '(none)'}`,
  );
}

function resolveExplicitWorkflowType(workflowType: string, workflowPath: string | null | undefined): WorkflowType {
  if (!isKnownWorkflowType(workflowType)) {
    throw new Error(`UNKNOWN_WORKFLOW_TYPE: ${workflowType}`);
  }

  const resolved = resolveWorkflowTypeForPath(normalizeWorkflowPath(workflowPath), workflowType);
  if (!resolved) {
    throw workflowCompatibilityError(workflowType, workflowPath);
  }
  return resolved;
}

function resolveDefaultWorkflowType(workflowPath: string | null | undefined): WorkflowType {
  const resolved = resolveWorkflowTypeForPath(normalizeWorkflowPath(workflowPath));
  if (resolved) return resolved;
  if (workflowPath) {
    throw new Error(`UNSUPPORTED_WORKFLOW_PATH_WITHOUT_WORKFLOW_TYPE: ${workflowPath}`);
  }
  return 'feature_spec';
}

function inferWorkflowTypeFromClassification(classification: any, workflowPath: string | null): WorkflowType {
  const explicit = classification?.workflow_type ?? classification?.workflowType;
  if (explicit) {
    return resolveExplicitWorkflowType(String(explicit), workflowPath);
  }

  const intent = String(
    classification?.intent ??
      classification?.change_type ??
      classification?.trigger_type ??
      classification?.classification ??
      '',
  ).toLowerCase();

  if (intent.includes('bug') || intent.includes('fix') || intent.includes('defect')) {
    return resolveExplicitWorkflowType('bugfix_spec', workflowPath);
  }
  if (intent.includes('quick')) {
    return resolveExplicitWorkflowType('quick_change', workflowPath);
  }

  return resolveDefaultWorkflowType(workflowPath);
}

registerHandler('sf_v11_work_item_create', async (args, context, deps) => {
  const projectRoot = (context?.directory as string) || (context?.worktree as string) || process.cwd();
  let workItemId = args['work_item_id'] as string | undefined;
  const userRequest = args['user_request'] as string;

  if (!userRequest) {
    return { success: false, error: 'user_request is required' };
  }

  workItemId = workItemId || await allocateNextWorkItemId(projectRoot);

  if (!/^WI-[0-9]{4}$/.test(workItemId)) {
    return { success: false, error: `Invalid work_item_id format: ${workItemId}. Must be WI-NNNN` };
  }

  try {
    // Resolve the authoritative Project Spec version before creating any WI
    // directory or lifecycle file. A missing/invalid authority must fail closed
    // without leaving a partial Work Item behind.
    const baseSpecVersion = await readAuthoritativeProjectSpecVersion(projectRoot);

    // Resolve workflow identity before allocating the Work Item root. Invalid
    // classification must not leave a partial governed directory behind.
    const classification = args['classification'] as ChangeClassification | undefined;
    if (classification) {
      const classificationErrors = validateChangeClassification(classification);
      if (classificationErrors.length > 0) {
        return {
          success: false,
          code: 'INVALID_CHANGE_CLASSIFICATION',
          error: `INVALID_CHANGE_CLASSIFICATION: ${classificationErrors.join('; ')}`,
          validation_errors: classificationErrors,
          hard_stop: true,
        };
      }
      const greenfieldRequired = await requiredGreenfieldClassificationFields(projectRoot);
      const missingGreenfieldFacts = greenfieldRequired.filter(
        field => (classification as unknown as Record<string, unknown>)[field] !== true,
      );
      if (classification.requirement_changed === true && missingGreenfieldFacts.length > 0) {
        return {
          success: false,
          code: 'GREENFIELD_CLASSIFICATION_INCOMPLETE',
          error:
            'GREENFIELD_CLASSIFICATION_INCOMPLETE: creating first formal truth sources is a semantic change',
          required_true_fields: missingGreenfieldFacts,
          hard_stop: false,
          retry_allowed: true,
        };
      }
    }
    const workflowPath = classification ? selectWorkflowPath(classification) : null;
    const workflowType = inferWorkflowTypeFromClassification(classification, workflowPath);

    // 1. Create WI directory
    const wiDir = await createWorkItem({
      projectRoot,
      workItemId,
      userRequest,
      workflowType,
      workflowPath,
    });

    // 2. Read classification if provided
    if (classification) {
      // 3. Generate trigger_result.json
      const triggerResult = generateTriggerResult(workItemId, classification, []);
      await fs.writeFile(
        join(wiDir, 'trigger_result.json'),
        JSON.stringify({ ...triggerResult, workflow_type: workflowType, workflow_path: workflowPath }, null, 2) + '\n',
        'utf-8',
      );
    }

    // 4. Initialize closure files
    await initializeClosureFiles(wiDir, workItemId, workflowPath, baseSpecVersion);

    // 5. Persist lifecycle state only through StateManager/WAL.
    const projectPath = (context?.directory as string) || (context?.worktree as string) || '';
    if (projectPath && deps.projectManager) {
      const sm = await deps.projectManager.getProjectStateManager(projectPath);
      await sm.transition(
        workItemId,
        '',
        'intake_ready',
        context?.agent ?? 'sf-orchestrator',
        workflowType,
        { workflow_path: workflowPath },
      );
    }

    return {
      success: true,
      work_item_id: workItemId,
      wi_dir: wiDir,
      workflow_type: workflowType,
      workflow_path: workflowPath,
      status: 'intake_ready',
    };
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('PROJECT_SPEC_VERSION_UNAVAILABLE:')) {
      return {
        success: false,
        error: message,
        code: 'PROJECT_SPEC_VERSION_UNAVAILABLE',
        hard_stop: true,
      };
    }
    return { success: false, error: message };
  }
});
