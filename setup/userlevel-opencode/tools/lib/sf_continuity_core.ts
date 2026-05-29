/**
 * SpecForge Continuity Engine — 跨会话续接核心逻辑
 *
 * 职责：
 * - 检测上下文耗尽事件（双条件：run failed + trace 含耗尽模式）
 * - 从多数据源提取 Context_Snapshot
 * - 过滤关键消息
 * - 生成续接 prompt
 * - 管理续接计数和链式 Archive
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 7.2
 */

import { readFile, access, readdir } from "node:fs/promises"
import { join } from "node:path"
import type { WorkflowType } from "./state_machine"
import { logErrorToFile } from "./utils"

const SPEC_DIR_NAME = '.specforge' as const;

// ============================================================
// Types
// ============================================================

/**
 * Trace entry from trace.jsonl
 */
export interface TraceEntry {
  timestamp: string
  type: "tool_call" | "agent_response" | "user_message" | "system" | string
  run_id?: string
  session_id?: string
  status?: "success" | "error" | "truncated" | string
  error_message?: string
  tool_name?: string
  arguments?: Record<string, unknown>
  exit_code?: number
  [key: string]: unknown
}

/**
 * Archive result.json structure
 */
export interface ArchiveResult {
  run_id?: string
  agent_name?: string
  status?: string
  exit_reason?: string
  start_time?: string
  end_time?: string
  duration_ms?: number
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Result of context exhaustion detection
 */
export interface ExhaustionDetectionResult {
  detected: boolean
  source?: "trace.jsonl" | "archive"
  confidence?: "high" | "medium"
}

/**
 * Completed work within a Context_Snapshot
 */
export interface CompletedWork {
  files_created: string[]
  files_modified: string[]
  verification_commands_passed: string[]
  description: string
}

/**
 * Artifacts within a Context_Snapshot
 */
export interface Artifacts {
  files: string[]
  reports: string[]
  commands: string[]
  data: {
    metrics?: Record<string, number>
    test_results?: Array<{ name: string; passed: boolean }>
    command_outputs_summary?: string[]
    evidence_refs?: string[]
    extra?: Record<string, unknown>
  }
}

/**
 * Pending work within a Context_Snapshot
 */
export interface PendingWork {
  description: string
  remaining_tasks: string[]
  expected_output: string
  inferred?: boolean
}

/**
 * Key decision record
 */
export interface KeyDecision {
  decision: string
  rationale: string
  alternatives_rejected: string[]
}

/**
 * Workflow context within a Context_Snapshot
 */
export interface WorkflowContext {
  workflow_type: WorkflowType
  stage: string
  expected_output: string
  work_item_id: string
  run_id: string
}

/**
 * File state record (for code workflows)
 */
export interface FileState {
  path: string
  status: "created" | "modified" | "deleted"
  summary: string
}

/**
 * Verification result record (for code workflows)
 */
export interface VerificationResult {
  command: string
  exit_code: number
  passed: boolean
}

/**
 * Evidence record (for investigation workflow)
 */
export interface EvidenceRecord {
  type: string
  source: string
  summary: string
}

/**
 * Hypothesis record (for investigation workflow)
 */
export interface Hypothesis {
  hypothesis: string
  status: "confirmed" | "rejected" | "pending"
  evidence: string[]
}

/**
 * Full Context_Snapshot structure
 */
export interface ContextSnapshot {
  // === Universal fields (all workflows) ===
  completed_work: CompletedWork
  artifacts: Artifacts
  pending_work: PendingWork
  key_decisions: KeyDecision[]
  workflow_context: WorkflowContext

  // === Optional code-related fields ===
  files_state?: FileState[]
  verification_results?: VerificationResult[]

  // === Optional investigation-related fields ===
  evidence_collected?: EvidenceRecord[]
  open_questions?: string[]
  hypotheses?: Hypothesis[]
}

/**
 * Continuation chain metadata
 */
export interface ContinuationMetadata {
  continuation_parent_run_id: string
  continuation_root_run_id: string
  continuation_index: number
}

/**
 * Tool call record from tool_calls.jsonl
 */
export interface ToolCallRecord {
  timestamp?: string
  tool: string
  arguments: Record<string, unknown>
  exit_code?: number
  status?: string
  result?: unknown
  [key: string]: unknown
}

/**
 * Agent Run Archive structure
 */
export interface AgentRunArchive {
  run_id: string
  agent_name?: string
  status?: string
  start_time?: string
  end_time?: string
  duration_ms?: number
  files_changed?: string[]
  tool_calls?: ToolCallRecord[]
  continuation_chain?: string[]
  [key: string]: unknown
}

/**
 * Merged archive result
 */
export interface MergedArchive {
  files_changed: string[]
  duration_ms: number
  tool_calls: ToolCallRecord[]
  continuation_chain: string[]
}

/**
 * Conversation message
 */
export interface ConversationMessage {
  role?: string
  type?: string
  content?: string
  timestamp?: string
  tool_name?: string
  status?: string
  [key: string]: unknown
}

/**
 * Continuity configuration
 */
export interface ContinuityConfig {
  max_continuations: number
  key_messages_count: number
}

/**
 * Options for extractContextSnapshot
 */
export interface ExtractSnapshotOptions {
  workItemId: string
  runId: string
  sessionId: string
  workflowType: WorkflowType
  stage: string
  baseDir: string
}

/**
 * Continuation limit check result
 */
export interface ContinuationLimitResult {
  allowed: boolean
  current_count: number
  max_allowed: number
  reason?: string
}

// ============================================================
// Constants
// ============================================================

/**
 * Exhaustion patterns to match in error_message fields of tool_call trace entries
 */
export const EXHAUSTION_PATTERNS: readonly string[] = [
  "context_length_exceeded",
  "max_tokens_reached",
  "context window",
  "token limit",
  "conversation too long",
]

/**
 * Valid exit_reason values indicating context exhaustion in archive result.json
 */
export const EXHAUSTION_EXIT_REASONS: readonly string[] = [
  "context_exhaustion",
  "token_limit",
]

/**
 * Workflow types that involve code changes (have files_state/verification_results)
 */
export const CODE_WORKFLOWS: readonly WorkflowType[] = [
  "feature_spec",
  "bugfix_spec",
  "feature_spec_design_first",
  "quick_change",
  "change_request",
  "refactor",
  "ops_task",
]

/**
 * Message types considered high-priority for key message filtering
 */
export const PRIORITY_MESSAGE_TYPES: readonly string[] = [
  "user_instruction",
  "agent_summary",
  "tool_call_result",
  "error_message",
  "file_change_description",
]

/**
 * Message types to skip during key message filtering
 */
export const SKIP_MESSAGE_TYPES: readonly string[] = [
  "file_read_repeat",
  "intermediate_reasoning",
  "formatted_output",
]

/**
 * Default continuity configuration
 */
export const DEFAULT_CONTINUITY_CONFIG: ContinuityConfig = {
  max_continuations: 1,
  key_messages_count: 20,
}

/**
 * Maximum allowed value for max_continuations (clamped)
 */
export const MAX_CONTINUATIONS_CEILING = 2

/**
 * Cutoff: maximum number of trace entries to consider
 */
const TRACE_ENTRY_CUTOFF = 100

/**
 * Cutoff: time window in milliseconds (10 minutes)
 */
const TRACE_TIME_WINDOW_MS = 10 * 60 * 1000

// ============================================================
// Detection Logic (Task 5.1)
// ============================================================

/**
 * Detect context exhaustion using dual-condition logic.
 *
 * Detection requires BOTH:
 * 1. The run must have failed (runFailed === true)
 * 2. Associated trace entries must contain exhaustion patterns in error_message fields
 *    OR archive result exit_reason indicates exhaustion
 *
 * Pattern matching is restricted to:
 * - PRIMARY: tool_call entries' error_message field only
 * - SECONDARY: archive result.json exit_reason field only
 *
 * Cutoff: filter by run_id/session_id, then last 100 entries intersected with last 10 minutes
 *
 * @param runFailed - Whether the agent run has failed
 * @param traceEntries - Trace entries from trace.jsonl
 * @param archiveResult - Archive result.json content (nullable)
 * @param runId - The run ID to filter trace entries
 * @param sessionId - The session ID to filter trace entries
 * @returns ExhaustionDetectionResult
 *
 * Requirements: 1.1
 */
export function detectContextExhaustion(
  runFailed: boolean,
  traceEntries: TraceEntry[],
  archiveResult: ArchiveResult | null,
  runId: string,
  sessionId: string
): ExhaustionDetectionResult {
  // Precondition: run must have failed
  if (!runFailed) {
    return { detected: false }
  }

  // Step 1: Filter associated entries by run_id or session_id
  const associatedEntries = traceEntries.filter(
    (e) => e.run_id === runId || e.session_id === sessionId
  )

  // Step 2: Apply cutoff — last 100 entries
  const last100 = associatedEntries.slice(-TRACE_ENTRY_CUTOFF)

  // Step 3: Intersect with last 10 minutes
  const now = Date.now()
  const tenMinutesAgo = now - TRACE_TIME_WINDOW_MS
  const recentEntries = last100.filter((e) => {
    if (!e.timestamp) return false
    const entryTime = new Date(e.timestamp).getTime()
    return entryTime >= tenMinutesAgo
  })

  // PRIMARY detection: match tool_call entries' error_message field
  for (let i = recentEntries.length - 1; i >= 0; i--) {
    const entry = recentEntries[i]

    // Check tool_call with error status
    if (entry.type === "tool_call" && entry.status === "error") {
      if (entry.error_message && matchesExhaustionPattern(entry.error_message)) {
        return { detected: true, source: "trace.jsonl", confidence: "high" }
      }
    }

    // Check agent_response with truncated status
    if (entry.type === "agent_response" && entry.status === "truncated") {
      return { detected: true, source: "trace.jsonl", confidence: "high" }
    }
  }

  // SECONDARY detection: archive result.json exit_reason
  if (archiveResult != null) {
    if (
      archiveResult.exit_reason &&
      EXHAUSTION_EXIT_REASONS.includes(archiveResult.exit_reason)
    ) {
      return { detected: true, source: "archive", confidence: "medium" }
    }
  }

  return { detected: false }
}

/**
 * Check if a string matches any exhaustion pattern (case-insensitive)
 */
function matchesExhaustionPattern(text: string): boolean {
  const lowerText = text.toLowerCase()
  return EXHAUSTION_PATTERNS.some((pattern) => lowerText.includes(pattern.toLowerCase()))
}


// ============================================================
// Context_Snapshot Extraction (Task 5.2)
// ============================================================

/**
 * Extract a Context_Snapshot from multiple data sources.
 *
 * Data source priority:
 * 1. PRIMARY: tool_calls.jsonl (write/edit calls + bash calls)
 * 2. PRIMARY: trace.jsonl (trace entries for the run)
 * 3. work_log.md (decisions, pending work)
 * 4. conversation.jsonl (key messages)
 * 5. Disk verification (file existence)
 *
 * Returns null if both completed_work and artifacts are empty (extraction failed).
 *
 * @param options - Extraction options
 * @returns ContextSnapshot or null if extraction failed
 *
 * Requirements: 1.2, 1.3, 7.2
 */
export async function extractContextSnapshot(
  options: ExtractSnapshotOptions
): Promise<ContextSnapshot | null> {
  const { workItemId, runId, sessionId, workflowType, stage, baseDir } = options

  try {
    // Initialize snapshot with workflow context
    const snapshot: ContextSnapshot = {
      completed_work: {
        files_created: [],
        files_modified: [],
        verification_commands_passed: [],
        description: "",
      },
      artifacts: {
        files: [],
        reports: [],
        commands: [],
        data: {},
      },
      pending_work: {
        description: "",
        remaining_tasks: [],
        expected_output: "",
      },
      key_decisions: [],
      workflow_context: {
        workflow_type: workflowType,
        stage,
        expected_output: getExpectedOutput(workflowType, stage),
        work_item_id: workItemId,
        run_id: runId,
      },
    }

    // Step 1: Read tool_calls.jsonl from archive
    const toolCalls = await readToolCallsFromArchive(runId, baseDir)

    // Step 2: Read trace entries
    const traceEntries = await readTraceEntriesForRun(runId, sessionId, baseDir)

    // Step 3: Extract files_created / files_modified from write/edit tool calls
    const writeToolCalls = toolCalls.filter(
      (tc) => tc.tool === "write" || tc.tool === "edit" || tc.tool === "create"
    )
    const candidateFiles = writeToolCalls
      .map((tc) => tc.arguments?.path as string)
      .filter(Boolean)

    // Determine which files are new vs modified based on trace context
    const { created, modified } = categorizeFiles(candidateFiles, traceEntries)

    // Disk verification: confirm files actually exist
    snapshot.completed_work.files_created = await verifyFilesExist(created, baseDir)
    snapshot.completed_work.files_modified = await verifyFilesExist(modified, baseDir)

    // Step 4: Extract verification_commands_passed from bash calls with exit_code=0
    const bashCalls = toolCalls.filter(
      (tc) => tc.tool === "bash" && tc.exit_code === 0
    )
    snapshot.completed_work.verification_commands_passed = bashCalls
      .map((tc) => tc.arguments?.command as string)
      .filter(Boolean)

    // Step 5: Extract key_decisions (priority: work_log.md → agent_summary → empty)
    const workLog = await readWorkLog(runId, baseDir)
    if (workLog) {
      const decisions = parseDecisionSections(workLog)
      if (decisions.length > 0) {
        snapshot.key_decisions = decisions
      }
    }

    if (snapshot.key_decisions.length === 0) {
      // Priority 2: from conversation key messages
      const config = await readContinuityConfig(baseDir)
      const conversation = await readConversationMessages(sessionId, baseDir)
      const keyMessages = filterKeyMessages(conversation, config.key_messages_count)
      const summaryMessages = keyMessages.filter(
        (m) => classifyMessage(m) === "agent_summary"
      )
      const decisions = extractDecisionsFromSummaries(summaryMessages)
      if (decisions.length > 0) {
        snapshot.key_decisions = decisions
      }
    }
    // Priority 3: empty array (never fabricate) — already initialized as []

    // Step 6: Extract pending_work (priority: work_log.md → infer from stage)
    if (workLog) {
      const pending = parsePendingSections(workLog)
      if (pending) {
        snapshot.pending_work = pending
      }
    }

    if (!snapshot.pending_work.description && !workLog) {
      // Priority 2: infer from stage expected_output
      snapshot.pending_work = {
        description: `Continue ${stage} stage work`,
        remaining_tasks: [],
        expected_output: getExpectedOutput(workflowType, stage),
        inferred: true,
      }
    }

    // Step 7: Extract artifacts
    snapshot.artifacts = extractArtifacts(toolCalls, traceEntries)

    // Step 8: Generate description for completed_work
    snapshot.completed_work.description = generateCompletedWorkDescription(snapshot.completed_work)

    // Step 9: Conditional optional fields based on workflow_type
    if (CODE_WORKFLOWS.includes(workflowType)) {
      snapshot.files_state = buildFilesState(
        snapshot.completed_work.files_created,
        snapshot.completed_work.files_modified
      )
      snapshot.verification_results = extractVerificationResults(toolCalls)
    }

    if (workflowType === "investigation") {
      snapshot.evidence_collected = extractEvidence(toolCalls, traceEntries)
      snapshot.open_questions = extractOpenQuestions(traceEntries)
      snapshot.hypotheses = extractHypotheses(traceEntries)
    }

    // Step 10: Completeness check — return null if extraction failed
    const hasCompletedWork =
      snapshot.completed_work.files_created.length > 0 ||
      snapshot.completed_work.files_modified.length > 0 ||
      snapshot.completed_work.verification_commands_passed.length > 0
    const hasArtifacts =
      snapshot.artifacts.files.length > 0 ||
      snapshot.artifacts.reports.length > 0 ||
      snapshot.artifacts.commands.length > 0

    if (!hasCompletedWork && !hasArtifacts) {
      return null // Extraction failed
    }

    return snapshot
  } catch (err) {
    await logErrorToFile(baseDir, "sf_continuity_core", "extractContextSnapshot", err)
    throw err
  }
}

// ============================================================
// Extraction Helpers
// ============================================================

/**
 * Read tool_calls.jsonl from the archive directory for a given run
 */
async function readToolCallsFromArchive(
  runId: string,
  baseDir: string
): Promise<ToolCallRecord[]> {
  const archiveDir = join(baseDir, SPEC_DIR_NAME, "archive", "agent_runs")
  const toolCallsPath = join(archiveDir, runId, "tool_calls.jsonl")

  try {
    const content = await readFile(toolCallsPath, "utf-8")
    return content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as ToolCallRecord
        } catch {
          return null
        }
      })
      .filter((entry): entry is ToolCallRecord => entry !== null)
  } catch {
    return []
  }
}

/**
 * Read trace entries filtered by run_id or session_id
 */
async function readTraceEntriesForRun(
  runId: string,
  sessionId: string,
  baseDir: string
): Promise<TraceEntry[]> {
  const tracePath = join(baseDir, SPEC_DIR_NAME, "runtime", "trace.jsonl")

  try {
    const content = await readFile(tracePath, "utf-8")
    const allEntries = content
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        try {
          return JSON.parse(line) as TraceEntry
        } catch {
          return null
        }
      })
      .filter((entry): entry is TraceEntry => entry !== null)

    // Filter by run_id or session_id
    return allEntries.filter(
      (e) => e.run_id === runId || e.session_id === sessionId
    )
  } catch {
    return []
  }
}

/**
 * Read work_log.md from the archive directory
 */
async function readWorkLog(
  runId: string,
  baseDir: string
): Promise<string | null> {
  const archiveDir = join(baseDir, SPEC_DIR_NAME, "archive", "agent_runs")
  const workLogPath = join(archiveDir, runId, "work_log.md")

  try {
    return await readFile(workLogPath, "utf-8")
  } catch {
    return null
  }
}

/**
 * Read conversation messages from conversation.jsonl
 */
async function readConversationMessages(
  sessionId: string,
  baseDir: string
): Promise<ConversationMessage[]> {
  // Try session-specific conversation file first
  const sessionConvPath = join(
    baseDir,
    SPEC_DIR_NAME,
    "archive",
    "conversations",
    `${sessionId}.jsonl`
  )
  const globalConvPath = join(baseDir, SPEC_DIR_NAME, "runtime", "conversation.jsonl")

  for (const convPath of [sessionConvPath, globalConvPath]) {
    try {
      const content = await readFile(convPath, "utf-8")
      return content
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          try {
            return JSON.parse(line) as ConversationMessage
          } catch {
            return null
          }
        })
        .filter((entry): entry is ConversationMessage => entry !== null)
    } catch {
      continue
    }
  }

  return []
}

/**
 * Categorize candidate files into created vs modified based on trace context
 */
function categorizeFiles(
  candidateFiles: string[],
  traceEntries: TraceEntry[]
): { created: string[]; modified: string[] } {
  const created: string[] = []
  const modified: string[] = []

  // Build a set of files that were read before being written (implies modification)
  const readFiles = new Set<string>()
  for (const entry of traceEntries) {
    if (entry.type === "tool_call" && entry.tool_name === "read") {
      const path = entry.arguments?.path as string
      if (path) readFiles.add(path)
    }
  }

  for (const file of candidateFiles) {
    if (readFiles.has(file)) {
      modified.push(file)
    } else {
      created.push(file)
    }
  }

  // Deduplicate
  return {
    created: [...new Set(created)],
    modified: [...new Set(modified)],
  }
}

/**
 * Verify that files actually exist on disk
 */
async function verifyFilesExist(
  files: string[],
  baseDir: string
): Promise<string[]> {
  const existing: string[] = []
  for (const file of files) {
    const fullPath = file.startsWith("/") ? file : join(baseDir, file)
    try {
      await access(fullPath)
      existing.push(file)
    } catch {
      // File doesn't exist, skip
    }
  }
  return existing
}

/**
 * Parse decision sections from work_log.md
 * Looks for "## Decision" or "## Reason" sections
 */
function parseDecisionSections(workLog: string): KeyDecision[] {
  const decisions: KeyDecision[] = []
  const lines = workLog.split("\n")
  let currentDecision: Partial<KeyDecision> | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (/^##\s*(Decision|决定)/i.test(trimmed)) {
      if (currentDecision?.decision) {
        decisions.push({
          decision: currentDecision.decision,
          rationale: currentDecision.rationale || "",
          alternatives_rejected: currentDecision.alternatives_rejected || [],
        })
      }
      currentDecision = { decision: "", rationale: "", alternatives_rejected: [] }
    } else if (/^##\s*(Reason|Rationale|原因)/i.test(trimmed)) {
      // Next lines are rationale for current decision
      if (currentDecision) {
        // Will be filled by subsequent lines
      }
    } else if (/^##\s*(Alternatives|替代方案)/i.test(trimmed)) {
      // Next lines are alternatives
    } else if (currentDecision) {
      if (trimmed && !trimmed.startsWith("##")) {
        if (!currentDecision.decision) {
          currentDecision.decision = trimmed
        } else if (!currentDecision.rationale) {
          currentDecision.rationale = trimmed
        }
      }
    }
  }

  // Push last decision
  if (currentDecision?.decision) {
    decisions.push({
      decision: currentDecision.decision,
      rationale: currentDecision.rationale || "",
      alternatives_rejected: currentDecision.alternatives_rejected || [],
    })
  }

  return decisions
}

/**
 * Parse pending/todo sections from work_log.md
 */
function parsePendingSections(workLog: string): PendingWork | null {
  const lines = workLog.split("\n")
  let inPendingSection = false
  const remainingTasks: string[] = []
  let description = ""

  for (const line of lines) {
    const trimmed = line.trim()

    if (/^##\s*(Pending|TODO|待完成|剩余)/i.test(trimmed)) {
      inPendingSection = true
      continue
    }

    if (inPendingSection) {
      if (trimmed.startsWith("##")) {
        break // End of pending section
      }
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        remainingTasks.push(trimmed.slice(2))
      } else if (trimmed && !description) {
        description = trimmed
      }
    }
  }

  if (remainingTasks.length === 0 && !description) {
    return null
  }

  return {
    description: description || "Pending work from previous session",
    remaining_tasks: remainingTasks,
    expected_output: "",
  }
}

/**
 * Extract decisions from agent_summary messages
 */
function extractDecisionsFromSummaries(
  summaryMessages: ConversationMessage[]
): KeyDecision[] {
  const decisions: KeyDecision[] = []

  for (const msg of summaryMessages) {
    if (!msg.content) continue

    // Look for decision-like patterns in summary content
    const lines = msg.content.split("\n")
    for (const line of lines) {
      const trimmed = line.trim()
      if (
        trimmed.startsWith("Decision:") ||
        trimmed.startsWith("Decided:") ||
        trimmed.startsWith("决定:")
      ) {
        decisions.push({
          decision: trimmed.replace(/^(Decision|Decided|决定):\s*/i, ""),
          rationale: "",
          alternatives_rejected: [],
        })
      }
    }
  }

  return decisions
}

/**
 * Extract artifacts from tool calls and trace entries
 */
function extractArtifacts(
  toolCalls: ToolCallRecord[],
  _traceEntries: TraceEntry[]
): Artifacts {
  const files: string[] = []
  const reports: string[] = []
  const commands: string[] = []

  for (const tc of toolCalls) {
    if (tc.tool === "write" || tc.tool === "edit" || tc.tool === "create") {
      const path = tc.arguments?.path as string
      if (path) {
        if (path.endsWith(".md") || path.endsWith(".txt") || path.endsWith(".json")) {
          reports.push(path)
        } else {
          files.push(path)
        }
      }
    } else if (tc.tool === "bash") {
      const command = tc.arguments?.command as string
      if (command) {
        commands.push(command)
      }
    }
  }

  return {
    files: [...new Set(files)],
    reports: [...new Set(reports)],
    commands: [...new Set(commands)],
    data: {},
  }
}

/**
 * Generate a human-readable description of completed work
 */
function generateCompletedWorkDescription(completedWork: CompletedWork): string {
  const parts: string[] = []

  if (completedWork.files_created.length > 0) {
    parts.push(`Created ${completedWork.files_created.length} file(s)`)
  }
  if (completedWork.files_modified.length > 0) {
    parts.push(`Modified ${completedWork.files_modified.length} file(s)`)
  }
  if (completedWork.verification_commands_passed.length > 0) {
    parts.push(
      `Passed ${completedWork.verification_commands_passed.length} verification command(s)`
    )
  }

  return parts.join(", ") || "No completed work recorded"
}

/**
 * Build files_state array from created and modified file lists
 */
function buildFilesState(
  filesCreated: string[],
  filesModified: string[]
): FileState[] {
  const states: FileState[] = []

  for (const file of filesCreated) {
    states.push({ path: file, status: "created", summary: "New file" })
  }
  for (const file of filesModified) {
    states.push({ path: file, status: "modified", summary: "Modified file" })
  }

  return states
}

/**
 * Extract verification results from bash tool calls
 */
function extractVerificationResults(toolCalls: ToolCallRecord[]): VerificationResult[] {
  return toolCalls
    .filter((tc) => tc.tool === "bash" && tc.exit_code !== undefined)
    .map((tc) => ({
      command: (tc.arguments?.command as string) || "",
      exit_code: tc.exit_code!,
      passed: tc.exit_code === 0,
    }))
}

/**
 * Extract evidence from tool calls (for investigation workflow)
 */
function extractEvidence(
  toolCalls: ToolCallRecord[],
  _traceEntries: TraceEntry[]
): EvidenceRecord[] {
  const evidence: EvidenceRecord[] = []

  for (const tc of toolCalls) {
    if (tc.tool === "bash" && tc.exit_code === 0) {
      evidence.push({
        type: "command_output",
        source: (tc.arguments?.command as string) || "unknown",
        summary: `Command executed successfully`,
      })
    } else if (tc.tool === "read") {
      evidence.push({
        type: "file_content",
        source: (tc.arguments?.path as string) || "unknown",
        summary: "File read for analysis",
      })
    }
  }

  return evidence
}

/**
 * Extract open questions from trace entries (for investigation workflow)
 */
function extractOpenQuestions(_traceEntries: TraceEntry[]): string[] {
  // Open questions are typically found in agent reasoning or work_log
  // For now, return empty — will be enriched from conversation messages
  return []
}

/**
 * Extract hypotheses from trace entries (for investigation workflow)
 */
function extractHypotheses(_traceEntries: TraceEntry[]): Hypothesis[] {
  // Hypotheses are typically found in agent reasoning or work_log
  // For now, return empty — will be enriched from conversation messages
  return []
}

/**
 * Get expected output for a given workflow stage
 */
function getExpectedOutput(workflowType: WorkflowType, stage: string): string {
  const outputMap: Record<string, Record<string, string>> = {
    feature_spec: {
      requirements: "requirements.md",
      design: "design.md",
      tasks: "tasks.md",
      development: "Code implementation",
      review: "Review feedback",
      verification: "Verification report",
    },
    bugfix_spec: {
      bugfix_analysis: "bugfix_analysis.md",
      fix_design: "fix_design.md",
      tasks: "tasks.md",
      development: "Bug fix implementation",
      verification: "Verification report",
    },
    change_request: {
      impact_analysis: "impact_analysis.md",
      design_delta: "design_delta.md",
      tasks: "tasks.md",
      development: "Code changes",
      review: "Review feedback",
      verification: "Verification report",
    },
    refactor: {
      refactor_analysis: "refactor_analysis.md",
      refactor_plan: "refactor_plan.md",
      development: "Refactored code",
      review: "Review feedback",
      verification: "Verification report",
    },
    ops_task: {
      ops_plan: "ops_plan.md",
      tasks: "tasks.md",
      execution: "Operation results",
      verification: "Verification report",
    },
    investigation: {
      investigation_plan: "investigation_plan.md",
      research: "Research data and findings",
      findings_report: "findings_report.md",
    },
  }

  return outputMap[workflowType]?.[stage] || `${stage} output`
}


// ============================================================
// Key Message Filtering (Task 5.3)
// ============================================================

/**
 * Classify a conversation message into a type category.
 *
 * Priority types: user_instruction, agent_summary, tool_call_result, error_message, file_change_description
 * Skip types: file_read_repeat, intermediate_reasoning, formatted_output
 *
 * @param msg - Conversation message to classify
 * @returns The classified message type
 */
export function classifyMessage(msg: ConversationMessage): string {
  // User messages are instructions
  if (msg.role === "user") {
    return "user_instruction"
  }

  // Tool call results
  if (msg.type === "tool_result" || msg.type === "tool_call_result") {
    return "tool_call_result"
  }

  // Error messages
  if (msg.status === "error" || msg.type === "error") {
    return "error_message"
  }

  // Agent summary messages (explicit type or contains summary markers)
  if (msg.type === "agent_summary" || msg.type === "summary") {
    return "agent_summary"
  }

  // File read repeats (read tool calls that are redundant)
  if (msg.tool_name === "read" && msg.type === "tool_call") {
    return "file_read_repeat"
  }

  // File change descriptions
  if (
    msg.type === "file_change" ||
    (msg.content &&
      (msg.content.includes("Created file") ||
        msg.content.includes("Modified file") ||
        msg.content.includes("Deleted file")))
  ) {
    return "file_change_description"
  }

  // Formatted output (large code blocks, tables, etc.)
  if (
    msg.content &&
    msg.content.length > 2000 &&
    (msg.content.includes("```") || msg.content.includes("| "))
  ) {
    return "formatted_output"
  }

  // Default: intermediate reasoning
  if (msg.role === "assistant" && !msg.type) {
    return "intermediate_reasoning"
  }

  return msg.type || "unknown"
}

/**
 * Filter key messages from a conversation, keeping only high-priority types.
 *
 * Algorithm:
 * - Iterate in reverse (most recent first)
 * - Skip messages classified as skip types
 * - Include messages classified as priority types
 * - Prepend to maintain chronological order
 * - Cap at maxCount
 *
 * @param conversation - Array of conversation messages
 * @param maxCount - Maximum number of messages to return
 * @returns Filtered array of key messages (chronological order, ≤ maxCount)
 *
 * Requirements: 1.4
 */
export function filterKeyMessages(
  conversation: ConversationMessage[],
  maxCount: number
): ConversationMessage[] {
  const candidates: ConversationMessage[] = []

  for (let i = conversation.length - 1; i >= 0; i--) {
    if (candidates.length >= maxCount) {
      break
    }

    const msg = conversation[i]
    const msgType = classifyMessage(msg)

    // Skip non-priority types
    if (SKIP_MESSAGE_TYPES.includes(msgType)) {
      continue
    }

    // Include priority types
    if (PRIORITY_MESSAGE_TYPES.includes(msgType)) {
      candidates.unshift(msg) // Prepend to maintain chronological order
    }
  }

  return candidates
}


// ============================================================
// Continuation Prompt Generation + Archive Merge (Task 5.4)
// ============================================================

/**
 * Generate a continuation prompt for a new session that will resume work.
 *
 * The prompt includes:
 * - Original task description
 * - All Context_Snapshot fields (structured)
 * - Continuation instruction text
 * - Formatted run_id (<original_run_id>-cont-<index>)
 *
 * @param originalTask - The original task description
 * @param snapshot - The extracted Context_Snapshot
 * @param continuationIndex - The continuation index (starting from 1)
 * @returns The formatted continuation prompt string
 *
 * Requirements: 1.5
 */
export function generateContinuationPrompt(
  originalTask: string,
  snapshot: ContextSnapshot,
  continuationIndex: number
): string {
  const continuationRunId = `${snapshot.workflow_context.run_id}-cont-${continuationIndex}`

  const sections: string[] = []

  // Header
  sections.push(`# Continuation Session (${continuationIndex})`)
  sections.push("")
  sections.push(`**Run ID:** ${continuationRunId}`)
  sections.push(`**Continuation of:** ${snapshot.workflow_context.run_id}`)
  sections.push("")

  // Original task
  sections.push("## Original Task")
  sections.push("")
  sections.push(originalTask)
  sections.push("")

  // Workflow context
  sections.push("## Workflow Context")
  sections.push("")
  sections.push(`- **Workflow Type:** ${snapshot.workflow_context.workflow_type}`)
  sections.push(`- **Stage:** ${snapshot.workflow_context.stage}`)
  sections.push(`- **Expected Output:** ${snapshot.workflow_context.expected_output}`)
  sections.push(`- **Work Item ID:** ${snapshot.workflow_context.work_item_id}`)
  sections.push("")

  // Completed work
  sections.push("## Completed Work (Previous Session)")
  sections.push("")
  sections.push(`${snapshot.completed_work.description}`)
  sections.push("")
  if (snapshot.completed_work.files_created.length > 0) {
    sections.push("**Files Created:**")
    for (const f of snapshot.completed_work.files_created) {
      sections.push(`- ${f}`)
    }
    sections.push("")
  }
  if (snapshot.completed_work.files_modified.length > 0) {
    sections.push("**Files Modified:**")
    for (const f of snapshot.completed_work.files_modified) {
      sections.push(`- ${f}`)
    }
    sections.push("")
  }
  if (snapshot.completed_work.verification_commands_passed.length > 0) {
    sections.push("**Verification Commands Passed:**")
    for (const cmd of snapshot.completed_work.verification_commands_passed) {
      sections.push(`- \`${cmd}\``)
    }
    sections.push("")
  }

  // Key decisions
  if (snapshot.key_decisions.length > 0) {
    sections.push("## Key Decisions")
    sections.push("")
    for (const d of snapshot.key_decisions) {
      sections.push(`- **${d.decision}**`)
      if (d.rationale) {
        sections.push(`  Rationale: ${d.rationale}`)
      }
      if (d.alternatives_rejected.length > 0) {
        sections.push(`  Rejected: ${d.alternatives_rejected.join(", ")}`)
      }
    }
    sections.push("")
  }

  // Pending work
  sections.push("## Pending Work")
  sections.push("")
  sections.push(snapshot.pending_work.description)
  if (snapshot.pending_work.remaining_tasks.length > 0) {
    sections.push("")
    sections.push("**Remaining Tasks:**")
    for (const task of snapshot.pending_work.remaining_tasks) {
      sections.push(`- ${task}`)
    }
  }
  if (snapshot.pending_work.expected_output) {
    sections.push("")
    sections.push(`**Expected Output:** ${snapshot.pending_work.expected_output}`)
  }
  sections.push("")

  // Artifacts
  if (
    snapshot.artifacts.files.length > 0 ||
    snapshot.artifacts.reports.length > 0
  ) {
    sections.push("## Artifacts")
    sections.push("")
    if (snapshot.artifacts.files.length > 0) {
      sections.push("**Files:**")
      for (const f of snapshot.artifacts.files) {
        sections.push(`- ${f}`)
      }
    }
    if (snapshot.artifacts.reports.length > 0) {
      sections.push("**Reports:**")
      for (const r of snapshot.artifacts.reports) {
        sections.push(`- ${r}`)
      }
    }
    sections.push("")
  }

  // Optional: files_state (code workflows)
  if (snapshot.files_state && snapshot.files_state.length > 0) {
    sections.push("## File States")
    sections.push("")
    for (const fs of snapshot.files_state) {
      sections.push(`- \`${fs.path}\` — ${fs.status}: ${fs.summary}`)
    }
    sections.push("")
  }

  // Optional: verification_results (code workflows)
  if (snapshot.verification_results && snapshot.verification_results.length > 0) {
    sections.push("## Verification Results")
    sections.push("")
    for (const vr of snapshot.verification_results) {
      const status = vr.passed ? "✓" : "✗"
      sections.push(`- ${status} \`${vr.command}\` (exit: ${vr.exit_code})`)
    }
    sections.push("")
  }

  // Optional: investigation fields
  if (snapshot.evidence_collected && snapshot.evidence_collected.length > 0) {
    sections.push("## Evidence Collected")
    sections.push("")
    for (const ev of snapshot.evidence_collected) {
      sections.push(`- [${ev.type}] ${ev.source}: ${ev.summary}`)
    }
    sections.push("")
  }

  if (snapshot.open_questions && snapshot.open_questions.length > 0) {
    sections.push("## Open Questions")
    sections.push("")
    for (const q of snapshot.open_questions) {
      sections.push(`- ${q}`)
    }
    sections.push("")
  }

  if (snapshot.hypotheses && snapshot.hypotheses.length > 0) {
    sections.push("## Hypotheses")
    sections.push("")
    for (const h of snapshot.hypotheses) {
      sections.push(`- **${h.hypothesis}** [${h.status}]`)
      if (h.evidence.length > 0) {
        sections.push(`  Evidence: ${h.evidence.join(", ")}`)
      }
    }
    sections.push("")
  }

  // Continuation instruction
  sections.push("## Continuation Instructions")
  sections.push("")
  sections.push(
    "This is a continuation session. The previous session was interrupted due to context exhaustion. " +
      "Please resume work from where the previous session left off. " +
      "Do NOT repeat work that has already been completed. " +
      "Focus on the pending work described above."
  )
  sections.push("")
  sections.push(`**Your Run ID:** ${continuationRunId}`)

  return sections.join("\n")
}

/**
 * Merge two Agent Run Archives (original + continuation).
 *
 * Merge rules:
 * - files_changed: union of both
 * - duration_ms: sum of both
 * - tool_calls: concatenation (original first, then continuation)
 * - continuation_chain: array of all run_ids in order
 *
 * @param originalArchive - The original (interrupted) archive
 * @param continuationArchive - The continuation session archive
 * @returns MergedArchive with combined data
 *
 * Requirements: 1.7, 1.8
 */
export function mergeArchives(
  originalArchive: AgentRunArchive,
  continuationArchive: AgentRunArchive
): MergedArchive {
  // files_changed: union
  const filesSet = new Set<string>([
    ...(originalArchive.files_changed || []),
    ...(continuationArchive.files_changed || []),
  ])

  // duration_ms: sum
  const totalDuration =
    (originalArchive.duration_ms || 0) + (continuationArchive.duration_ms || 0)

  // tool_calls: concatenation
  const allToolCalls = [
    ...(originalArchive.tool_calls || []),
    ...(continuationArchive.tool_calls || []),
  ]

  // continuation_chain: build from existing chain or create new
  const existingChain = originalArchive.continuation_chain || [originalArchive.run_id]
  const continuationChain = [...existingChain, continuationArchive.run_id]

  return {
    files_changed: [...filesSet],
    duration_ms: totalDuration,
    tool_calls: allToolCalls,
    continuation_chain: continuationChain,
  }
}


// ============================================================
// Configuration + Continuation Limit (Task 5.6)
// ============================================================

/**
 * Read continuity configuration from project.json.
 *
 * Reads the `continuity` section from specforge/config/project.json.
 * Defaults to max_continuations=1, key_messages_count=20.
 * Clamps max_continuations to MAX_CONTINUATIONS_CEILING (2).
 *
 * @param baseDir - Project root directory
 * @returns ContinuityConfig with validated values
 *
 * Requirements: 1.6
 */
export async function readContinuityConfig(baseDir: string): Promise<ContinuityConfig> {
  try {
    const configPath = join(baseDir, SPEC_DIR_NAME, "config", "project.json")

    try {
      const content = await readFile(configPath, "utf-8")
      const config = JSON.parse(content)

      const continuity = config?.continuity
      if (!continuity || typeof continuity !== "object") {
        return { ...DEFAULT_CONTINUITY_CONFIG }
      }

      let maxContinuations = DEFAULT_CONTINUITY_CONFIG.max_continuations
      if (typeof continuity.max_continuations === "number" && continuity.max_continuations >= 0) {
        maxContinuations = Math.min(
          Math.floor(continuity.max_continuations),
          MAX_CONTINUATIONS_CEILING
        )
      }

      let keyMessagesCount = DEFAULT_CONTINUITY_CONFIG.key_messages_count
      if (typeof continuity.key_messages_count === "number" && continuity.key_messages_count > 0) {
        keyMessagesCount = Math.floor(continuity.key_messages_count)
      }

      return { max_continuations: maxContinuations, key_messages_count: keyMessagesCount }
    } catch {
      // Config file not found or invalid — use defaults
      return { ...DEFAULT_CONTINUITY_CONFIG }
    }
  } catch (err) {
    await logErrorToFile(baseDir, "sf_continuity_core", "readContinuityConfig", err)
    throw err
  }
}

/**
 * Enforce continuation limit for a given root_run_id.
 *
 * Checks the archive directory for existing continuation runs and determines
 * whether another continuation is allowed.
 *
 * Logic:
 * - Count existing continuation runs for the root_run_id
 * - Compare against max_continuations from config
 * - Return allowed=true if count < max, allowed=false if count >= max
 *
 * @param rootRunId - The root run ID of the continuation chain
 * @param baseDir - Project root directory
 * @returns ContinuationLimitResult indicating whether continuation is allowed
 *
 * Requirements: 1.6
 */
export async function enforceContinuationLimit(
  rootRunId: string,
  baseDir: string
): Promise<ContinuationLimitResult> {
  const config = await readContinuityConfig(baseDir)
  const maxAllowed = config.max_continuations

  // Count existing continuations by scanning archive directory
  const archiveDir = join(baseDir, SPEC_DIR_NAME, "archive", "agent_runs")
  let continuationCount = 0

  try {
    const entries = await readdir(archiveDir)
    // Continuation run_ids follow the pattern: <rootRunId>-cont-<N>
    const contPattern = `${rootRunId}-cont-`
    for (const entry of entries) {
      if (entry.startsWith(contPattern)) {
        continuationCount++
      }
    }
  } catch {
    // Archive directory doesn't exist — no continuations yet
    continuationCount = 0
  }

  if (continuationCount >= maxAllowed) {
    return {
      allowed: false,
      current_count: continuationCount,
      max_allowed: maxAllowed,
      reason: `Continuation limit reached: ${continuationCount}/${maxAllowed}. Cannot create more continuations.`,
    }
  }

  return {
    allowed: true,
    current_count: continuationCount,
    max_allowed: maxAllowed,
  }
}
