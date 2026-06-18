/**
 * sf-artifact-write.ts — v1.1 Controlled Artifact Writer
 *
 * R7 changes:
 * - Normalize core JSON artifact schemas before validation.
 * - trigger_result.json: auto-add schema_version/work_item_id/status/workflow_type.
 * - candidate_manifest.json: auto-add entries[] and merge_applicable=false for code_only_fast_path.
 * - evidence/evidence_manifest.json: accept evidence_items/evidence and normalize to entries[].
 * - work_item.json: auto-add workflow_type/workflow_path/status/work_item_id basics.
 *
 * This keeps the workflow naturally closed: Agent should not need to write an
 * invalid artifact once, read gate failure, and rewrite it with schema repairs.
 */
import path from 'path'
import * as fs from 'node:fs'
import { registerHandler } from '../ToolDispatcher'
import { writeArtifact } from '../lib/sf_artifact_write_core'
import { guardHardStop, setHardStop } from '../lib/hard-stop-latch'
import { validateArtifactJson } from '../lib/artifact-schema-validation'
import { validateWorkItemId } from '../lib/work-item-id-validator'
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout'
import { WORKFLOW_PATH_TO_TYPE, type WorkflowPath } from '../lib/state_machine'
import { inferManifestEntries } from '../lib/governance-invariants-v11'

const V11_WI_ARTIFACT_FILES = new Set([
  'work_item.json',
  'intake.md',
  'change_classification.md',
  'impact_analysis.md',
  'trigger_result.json',
  'tasks.md',
  'trace_delta.md',
  'candidate_manifest.json',
  'merge_report.md',
  'verification_report.md',
  'evidence_manifest.json',
])

const V11_FILENAME_MAP: Record<string, string> = {
  'work_item.json': 'work_item',
  'intake.md': 'intake',
  'change_classification.md': 'change_classification',
  'impact_analysis.md': 'impact_analysis',
  'trigger_result.json': 'trigger_result',
  'tasks.md': 'tasks',
  'trace_delta.md': 'trace_delta',
  'candidate_manifest.json': 'candidate_manifest',
  'merge_report.md': 'merge_report',
  'verification_report.md': 'verification_report',
  'evidence_manifest.json': 'evidence_manifest',
}

const V11_FILETYPE_TO_FILENAME = new Map(
  Object.entries(V11_FILENAME_MAP).map(([filename, fileType]) => [fileType, filename]),
)

function mirrorSpecCandidateArtifacts(
  baseDir: string,
  workItemId: string,
  targetFilename: string,
  content: string,
  primaryTargetPath: string,
): void {
  const mirrorable = new Set(['requirements.md', 'design.md', 'tasks.md', 'trace_delta.md'])
  if (!mirrorable.has(targetFilename)) return

  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId)
  const specsDir = path.join(baseDir, SPEC_DIR_NAME, 'specs', workItemId)
  const candidatesDir = path.join(wiDir, 'candidates')
  const mirrors: string[] = []

  if (targetFilename === 'requirements.md' || targetFilename === 'design.md' || targetFilename === 'tasks.md') {
    mirrors.push(path.join(candidatesDir, targetFilename))
    mirrors.push(path.join(specsDir, targetFilename))
  }

  if (targetFilename === 'trace_delta.md') {
    // v1.1.2_real_world_batch1_trace_delta_candidate_mirror:
    // Spec-changing workflows may include candidates/trace_delta.md in
    // candidate_manifest. Controlled sf_artifact_write is the only allowed
    // way to write WI artifacts; mirror trace_delta into candidates/ so
    // agents never need sf_safe_bash/Copy-Item inside .specforge/work-items.
    mirrors.push(path.join(candidatesDir, targetFilename))
    mirrors.push(path.join(specsDir, targetFilename))
  }

  for (const mirrorPath of mirrors) {
    if (path.resolve(mirrorPath) === path.resolve(primaryTargetPath)) continue
    fs.mkdirSync(path.dirname(mirrorPath), { recursive: true })
    fs.writeFileSync(mirrorPath, content, 'utf-8')
  }
}
function normalizeToken(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function stringifyArtifactContent(value: unknown, fallback?: unknown): string {
  const chosen = value ?? fallback ?? ''
  if (typeof chosen === 'string') return chosen
  if (Buffer.isBuffer(chosen)) return chosen.toString('utf-8')
  if (typeof chosen === 'object') return JSON.stringify(chosen, null, 2)
  return String(chosen)
}

function inferCanonicalFileType(args: Record<string, unknown>): string | null {
  const fileType = String(args['file_type'] ?? '')
  const runId = normalizeToken(args['run_id'])
  const template = normalizeToken(args['template'])
  const content = stringifyArtifactContent(args['content'], args['agent_content'])
  const contentToken = normalizeToken(content.slice(0, 400))
  const probe = `${runId} ${template} ${contentToken}`

  if (fileType !== 'work_log') return null
  if (probe.includes('trigger-result') || probe.includes('trigger-result-json')) return 'trigger_result'
  if (probe.includes('candidate-manifest') || probe.includes('candidate-manifest-json')) return 'candidate_manifest'
  if (probe.includes('trace-delta')) return 'trace_delta'
  if (probe.includes('impact-analysis')) return 'impact_analysis'
  if (probe.includes('change-classification') || probe.includes('intake-classification')) return 'change_classification'
  if (probe.includes('tasks-md') || probe.includes('task-plan') || probe.includes('task-planning')) return 'tasks'
  if (probe.includes('merge-report')) return 'merge_report'
  if (probe.includes('evidence-manifest')) return 'evidence_manifest'
  return null
}

function resolveTargetFilename(fileType: string): string | null {
  if (fileType === 'requirements') return 'requirements.md'
  if (fileType === 'design') return 'design.md'
  if (fileType === 'candidate_requirements') return 'requirements.md'
  if (fileType === 'candidate_design') return 'design.md'
  if (fileType === 'candidate_tasks') return 'tasks.md'
  if (V11_WI_ARTIFACT_FILES.has(fileType)) return fileType
  return V11_FILETYPE_TO_FILENAME.get(fileType) ?? null
}

function isJsonArtifact(filename: string): boolean {
  return filename.endsWith('.json')
}

function readJsonIfExists(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function inferWorkflowFacts(
  baseDir: string,
  workItemId: string,
  contentJson?: Record<string, any>,
): { workflowPath?: string; workflowType?: string } {
  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId)
  const candidates: Array<Record<string, any> | null> = [
    contentJson ?? null,
    readJsonIfExists(path.join(wiDir, 'work_item.json')),
    readJsonIfExists(path.join(wiDir, 'trigger_result.json')),
    readJsonIfExists(path.join(wiDir, 'candidate_manifest.json')),
  ]

  for (const json of candidates) {
    if (!json) continue
    const workflowPath = typeof json.workflow_path === 'string' ? json.workflow_path : undefined
    const workflowType = typeof json.workflow_type === 'string' ? json.workflow_type : undefined
    if (workflowPath || workflowType) {
      const mapped = workflowPath ? WORKFLOW_PATH_TO_TYPE[workflowPath as WorkflowPath] : undefined
      return {
        workflowPath,
        workflowType: mapped ?? workflowType,
      }
    }
  }

  return {}
}

function normalizeCoreJsonArtifact(
  filename: string,
  content: string,
  workItemId: string,
  baseDir: string,
): string {
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    return content
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return content

  const facts = inferWorkflowFacts(baseDir, workItemId, parsed)
  const workflowPath = parsed.workflow_path ?? facts.workflowPath
  const mappedWorkflowType = workflowPath ? WORKFLOW_PATH_TO_TYPE[workflowPath as WorkflowPath] : undefined
  const workflowType = mappedWorkflowType ?? parsed.workflow_type ?? facts.workflowType

  if (filename === 'work_item.json') {
    const normalized = {
      schema_version: '1.1',
      status: 'created',
      ...parsed,
      work_item_id: parsed.work_item_id ?? workItemId,
      workflow_type: parsed.workflow_type ?? workflowType ?? 'quick_change',
      workflow_path: parsed.workflow_path ?? workflowPath,
      updated_at: parsed.updated_at ?? new Date().toISOString(),
    }
    return JSON.stringify(normalized, null, 2)
  }

  if (filename === 'trigger_result.json') {
    const normalized = {
      ...parsed,
      schema_version: parsed.schema_version ?? '1.1',
      work_item_id: parsed.work_item_id ?? workItemId,
      workflow_path: parsed.workflow_path ?? workflowPath,
      workflow_type: parsed.workflow_type ?? workflowType,
      status: parsed.status ?? 'triggered',
      unknowns: Array.isArray(parsed.unknowns) ? parsed.unknowns : [],
    }
    return JSON.stringify(normalized, null, 2)
  }

  if (filename === 'candidate_manifest.json') {
    const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId)
    const preliminary = { ...parsed, workflow_path: parsed.workflow_path ?? workflowPath }
    const entries = Array.isArray(parsed.entries) && parsed.entries.length > 0 ? parsed.entries : inferManifestEntries(preliminary, wiDir)
    const normalized = {
      ...parsed,
      schema_version: parsed.schema_version ?? '1.1',
      work_item_id: parsed.work_item_id ?? workItemId,
      workflow_path: parsed.workflow_path ?? workflowPath,
      entries,
    }
    if (normalized.workflow_path === 'code_only_fast_path') {
      normalized.merge_applicable = false
      normalized.merge_required = false
      normalized.reason = normalized.reason ?? 'code_only_fast_path: no spec-level candidate products'
    }
    return JSON.stringify(normalized, null, 2)
  }

  if (filename === 'evidence_manifest.json') {
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries
      : Array.isArray(parsed.evidence_items)
        ? parsed.evidence_items
        : Array.isArray(parsed.evidence)
          ? parsed.evidence
          : []
    const normalized = {
      ...parsed,
      schema_version: parsed.schema_version ?? '1.1',
      work_item_id: parsed.work_item_id ?? workItemId,
      entries,
    }
    delete normalized.evidence_items
    delete normalized.evidence
    return JSON.stringify(normalized, null, 2)
  }

  return content
}

registerHandler('sf_artifact_write', async (args, context, _deps) => {
  const baseDir = (context?.directory as string) || (context?.worktree as string) || process.cwd()
  const workItemId = args['work_item_id'] as string
  let fileType = args['file_type'] as string
  let content = stringifyArtifactContent(args['content'], args['agent_content'])

  const idError = validateWorkItemId(workItemId)
  if (idError) {
    return { success: false, error: idError, hard_stop: false, retry_allowed: true }
  }

  const guardResult = guardHardStop(baseDir, workItemId, 'sf_artifact_write')
  if (!guardResult.allowed) {
    return {
      success: false,
      error: guardResult.error,
      hard_stop: true,
      hard_stop_record: guardResult.hard_stop_record,
    }
  }

  const inferred = inferCanonicalFileType(args as Record<string, unknown>)
  if (inferred) fileType = inferred

  const targetFilename = resolveTargetFilename(fileType)

  if (!targetFilename && String(args['file_type']) === 'work_log') {
    return await writeArtifact(
      {
        work_item_id: workItemId,
        file_type: 'work_log' as any,
        content,
        run_id: args['run_id'] as string | undefined,
        template: args['template'] as any,
        agent_content: args['agent_content'] as string | undefined,
      },
      baseDir,
    )
  }

  if (!targetFilename) {
    return await writeArtifact(
      {
        work_item_id: workItemId,
        file_type: fileType as any,
        content,
        run_id: args['run_id'] as string | undefined,
        template: args['template'] as any,
        agent_content: args['agent_content'] as string | undefined,
      },
      baseDir,
    )
  }

  if (isJsonArtifact(targetFilename)) {
    content = normalizeCoreJsonArtifact(targetFilename, content, workItemId, baseDir)

    let workflowPath: string | undefined
    try {
      const facts = inferWorkflowFacts(baseDir, workItemId, JSON.parse(content))
      workflowPath = facts.workflowPath
    } catch {
      // non-critical; validator can still validate with artifact content.
    }

    const validation = validateArtifactJson(targetFilename, content, workItemId, workflowPath)
    if (validation && !validation.valid) {
      return {
        success: false,
        error: 'INVALID_ARTIFACT_JSON',
        hard_stop: false,
        retry_allowed: true,
        validation_errors: validation.errors,
        message: `Artifact "${targetFilename}" failed schema validation and was NOT written to disk. Correct the JSON and retry.`,
        normalized_content_preview: content.slice(0, 2000),
      }
    }
  }

  const wiDir = path.join(baseDir, SPEC_DIR_NAME, 'work-items', workItemId)
  fs.mkdirSync(wiDir, { recursive: true })

  let targetPath: string
  if (targetFilename === 'evidence_manifest.json') {
    const evidenceDir = path.join(wiDir, 'evidence')
    fs.mkdirSync(evidenceDir, { recursive: true })
    targetPath = path.join(evidenceDir, 'evidence_manifest.json')
  } else {
    targetPath = path.join(wiDir, targetFilename)
  }

  try {
    fs.writeFileSync(targetPath, content, 'utf-8')
    mirrorSpecCandidateArtifacts(baseDir, workItemId, targetFilename, content, targetPath)
    const size = Buffer.byteLength(content, 'utf-8')
    const relativePath = path.relative(baseDir, targetPath).replace(/\\/g, '/')
    return {
      success: true,
      path: relativePath,
      size,
      file_type: fileType,
      controlled_artifact: true,
      normalized: isJsonArtifact(targetFilename),
    }
  } catch (err: any) {
    setHardStop(baseDir, workItemId, `ARTIFACT_WRITE_FAILED: ${err.message}`, 'sf_artifact_write')
    return { success: false, error: `ARTIFACT_WRITE_FAILED: ${err.message}`, hard_stop: true }
  }
})
