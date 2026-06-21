/**
 * sf_specforge.ts - SpecForge OpenCode Plugin with HARD Write Guard.
 *
 * v1.2 post-merge live hotfix:
 * - Keep existing tool.execute.before / after guard path.
 * - Add same-name plugin tools for write/edit/apply_patch so OpenCode native
 *   filesystem tools cannot bypass SpecForge Write Guard in subagents.
 * - Same-name plugin tools take precedence over built-in tools in OpenCode.
 */
import { tool, type PluginInput } from "@opencode-ai/plugin";

const { join, resolve, dirname } = require("node:path");
const { homedir } = require("node:os");
const { pathToFileURL } = require("node:url");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");

const VALID_WI_ID = /^WI-(\d{3,4}|\d{8}-\d{4})$/;

function isValidWorkItemId(value: unknown): value is string {
  return typeof value === "string" && VALID_WI_ID.test(value);
}

function getWorkItemIdFromArgs(args: Record<string, any>): string | undefined {
  const candidates = [
    args.work_item_id,
    args.workItemId,
    args.work_item,
    args.wi,
    args.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }

  return undefined;
}

function normalizeToolName(toolName: string): string {
  return String(toolName ?? "").toLowerCase().replace(/[_-]/g, "");
}

function resolveClientPath(): string {
  const sfUserPath = resolve(__dirname, "..", "sf-user", "lib", "sf_plugin_client.ts");
  if (existsSync(sfUserPath)) return sfUserPath;

  const v11Path = join(homedir(), ".config", "opencode", "sf-runtime", "sf_plugin_client.ts");
  if (existsSync(v11Path)) return v11Path;

  const localPath = resolve(__dirname, "..", "lib", "sf_plugin_client.ts");
  if (existsSync(localPath)) return localPath;

  const devPath = resolve(
    __dirname,
    "..",
    "..",
    "..",
    "packages",
    "daemon-client",
    "src",
    "index.ts",
  );
  if (existsSync(devPath)) return devPath;

  throw new Error(
    `[sf:specforge] Cannot locate sf_plugin_client.\nChecked: ${sfUserPath}, ${v11Path}, ${localPath}, ${devPath}`,
  );
}

const clientPath = resolveClientPath();
const { createReconnectingDaemonClient } = await import(pathToFileURL(clientPath).href);
const daemonClient = createReconnectingDaemonClient({
  initialDelayMs: 1000,
  maxCumulativeBackoffMs: 60000,
  backoffFactor: 2.0,
});

const WRITE_TOOLS = new Set([
  "edit",
  "write",
  "write_file",
  "create_file",
  "apply_patch",
  "patch",
  "multi_edit",
  "insert",
  "replace",
  "str_replace",
  "move",
  "rename",
  "delete",
  "remove",
  "mkdir",
  "copy",
  "git",
  "git_commit",
  "git_apply",
  "git_checkout",
  "git_merge",
  "git_rebase",
  "git_reset",
  "git_stash",
  "npm",
  "yarn",
  "pnpm",
  "bun_install",
  "npm_install",
  "yarn_install",
  "pnpm_install",
  "pip_install",
  "cargo_build",
  "format",
  "prettier",
  "eslint_fix",
  "eslint",
  "biome",
  "deno_fmt",
  "gofmt",
  "rustfmt",
  "black",
  "autopep8",
  "isort",
  "codegen",
  "prisma_generate",
  "protoc",
  "openapi_generate",
  "vitest_update",
  "jest_update",
  "snapshot_update",
]);

const SIDE_EFFECT_TOOLS = new Set([
  "format",
  "prettier",
  "eslint_fix",
  "eslint",
  "biome",
  "deno_fmt",
  "gofmt",
  "rustfmt",
  "black",
  "autopep8",
  "isort",
  "codegen",
  "prisma_generate",
  "protoc",
  "openapi_generate",
  "bun_install",
  "npm_install",
  "yarn_install",
  "pnpm_install",
  "pip_install",
  "cargo_build",
  "vitest_update",
  "jest_update",
  "snapshot_update",
]);

const SHELL_TOOLS = new Set([
  "bash",
  "shell",
  "execute",
  "run",
  "terminal",
  "cmd",
  "powershell",
  "sf_safe_bash",
]);

const NON_FILESYSTEM_PLANNING_TOOLS = new Set([
  "todowrite",
  "todoread",
  "todoupdate",
  "tododelete",
  "todolist",
  "todoadd",
  "todocreate",
]);

const SPECFORGE_CONTROL_TOOLS = new Set([
  "sf_gate_run",
  "sfgaterun",
  "sf_user_decision_record",
  "sfuserdecisionrecord",
  "sf_merge_run",
  "sfmergerun",
  "sf_code_permission",
  "sfcodepermission",
  "sf_changed_files_audit",
  "sfchangedfilesaudit",
  "sf_artifact_write",
  "sfartifactwrite",
  "sf_close_gate",
  "sfclosegate",
  "sf_state_read",
  "sfstateread",
  "sf_state_transition",
  "sfstatetransition",
  "sf_doc_lint",
  "sfdoclint",
  "sf_trace_matrix",
  "sftracematrix",
  "sf_context_build",
  "sfcontextbuild",
  "sf_cost_report",
  "sfcostreport",
  "sf_doctor",
  "sfdoctor",
  "sf_continuity",
  "sfcontinuity",
  "sf_knowledge_base",
  "sfknowledgebase",
  "sf_knowledge_graph",
  "sfknowledgegraph",
  "sf_knowledge_query",
  "sfknowledgequery",
  "sf_batch_verify",
  "sfbatchverify",
  "sf_v11_work_item_create",
  "sfv11workitemcreate",
]);

const SF_SAFE_READ_TOOLS = new Set([
  "sf_state_read",
  "sf_context_build",
  "sf_continuity",
  "sf_cost_report",
  "sf_doctor",
  "sf_knowledge_base",
  "sf_knowledge_graph",
  "sf_knowledge_query",
  "sf_batch_verify",
  "sf_doc_lint",
  "sf_trace_matrix",
]);

function isWriteTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName);

  if (NON_FILESYSTEM_PLANNING_TOOLS.has(normalized)) return false;
  if (SPECFORGE_CONTROL_TOOLS.has(toolName) || SPECFORGE_CONTROL_TOOLS.has(normalized)) return false;
  if (WRITE_TOOLS.has(toolName) || WRITE_TOOLS.has(normalized)) return true;
  if (normalized.includes("write") || normalized.includes("edit")) return true;
  if (normalized.includes("patch") || normalized.includes("create")) return true;
  if (normalized.includes("delete") || normalized.includes("remove")) return true;
  return false;
}

function isSideEffectTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName);

  if (SIDE_EFFECT_TOOLS.has(toolName) || SIDE_EFFECT_TOOLS.has(normalized)) return true;
  if (normalized.includes("format") || normalized.includes("generate")) return true;
  if (normalized.includes("install") || normalized.includes("snapshot")) return true;
  return false;
}

function isShellTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName);
  return SHELL_TOOLS.has(toolName) || SHELL_TOOLS.has(normalized);
}

function isSfTool(toolName: string): boolean {
  return String(toolName ?? "").startsWith("sf_") || String(toolName ?? "").startsWith("sf-");
}

function pushString(values: string[], value: unknown): void {
  if (typeof value === "string" && value.trim().length > 0) values.push(value);
}

function extractWriteTargets(_toolName: string, args: Record<string, any>): string[] {
  const paths: string[] = [];
  const pathKeys = [
    "path",
    "file",
    "filePath",
    "file_path",
    "target",
    "targetFile",
    "target_file",
    "destination",
    "dest",
    "filename",
    "name",
    "to",
  ];

  for (const key of pathKeys) pushString(paths, args[key]);

  if (Array.isArray(args.files)) {
    for (const f of args.files) {
      if (typeof f === "string") paths.push(f);
      else if (f && typeof f.path === "string") paths.push(f.path);
      else if (f && typeof f.filePath === "string") paths.push(f.filePath);
    }
  }

  if (Array.isArray(args.patches)) {
    for (const p of args.patches) {
      if (p && typeof p.path === "string") paths.push(p.path);
      if (p && typeof p.filePath === "string") paths.push(p.filePath);
    }
  }

  const patch = String(args.patch ?? args.input ?? "");
  if (patch.includes("+++ ") || patch.includes("--- ")) {
    for (const match of patch.matchAll(/^(?:\+\+\+|---)\s+(?:a\/|b\/)?([^\r\n\t]+)/gm)) {
      const candidate = match[1]?.trim();
      if (candidate && candidate !== "/dev/null") paths.push(candidate);
    }
  }

  return Array.from(new Set(paths));
}

function extractBashExpectedFiles(args: Record<string, any>): string[] {
  if (Array.isArray(args.expected_write_files)) {
    return args.expected_write_files.filter((f: any) => typeof f === "string");
  }

  if (Array.isArray(args.expectedWriteFiles)) {
    return args.expectedWriteFiles.filter((f: any) => typeof f === "string");
  }

  return [];
}

function redactSensitiveString(value: string): string {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/=:-]+/gi, "Bearer ***REDACTED***")
    .replace(/("token"\s*:\s*")[^"]+"/gi, "$1***REDACTED***\"")
    .replace(/('token'\s*:\s*')[^']+'/gi, "$1***REDACTED***'");
}

function isBashReadOnly(command: string): boolean {
  const readOnlyPrefixes = [
    "cat ",
    "ls ",
    "dir ",
    "echo ",
    "printf ",
    "head ",
    "tail ",
    "grep ",
    "rg ",
    "find ",
    "which ",
    "where ",
    "type ",
    "pwd",
    "whoami",
    "date",
    "uname",
    "env ",
    "printenv",
    "git status",
    "git log",
    "git diff",
    "git show",
    "git branch",
    "git remote",
    "git tag",
    "npm list",
    "npm ls",
    "npm info",
    "yarn list",
    "yarn info",
    "pnpm list",
    "test ",
    "[ ",
    "[[ ",
  ];

  const trimmed = command.trim();
  if (
    trimmed.startsWith("python -c") ||
    trimmed.startsWith("python3 -c") ||
    trimmed.startsWith("node -e") ||
    trimmed.startsWith("node --eval")
  ) {
    const hasWriteIndicators = /open\s*\(|write|makedirs|mkdir|Path\(|base64|decode|Set-Content|Out-File|New-Item|>|>>|tee\s/i.test(trimmed);
    return !hasWriteIndicators;
  }

  return readOnlyPrefixes.some((p) => trimmed.startsWith(p));
}

function isBashWriteCommand(command: string): boolean {
  const V12_POWERSHELL_WRITE_PATTERN = /\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Copy-Item|Move-Item)\b/i;
  const writePatterns = [
    V12_POWERSHELL_WRITE_PATTERN,
    /\bcp\b/,
    /\bmv\b/,
    /\brm\b/,
    /\bmkdir\b/,
    /\brmdir\b/,
    /\btouch\b/,
    /\bchmod\b/,
    /\bchown\b/,
    /\bnpm install\b/,
    /\bnpm i\b/,
    /\byarn add\b/,
    /\bpnpm add\b/,
    /\bgit (add|commit|push|merge|rebase|reset|checkout|stash|apply)\b/,
    /\bsed\b.*-i/,
    /\bawk\b.*-i/,
    />/,
    />>/,
    /\btee\b/,
    /python[3]?\s+-c\s+.*\b(open|write|makedirs|Path)\b/i,
    /node\s+-e\s+.*(writeFile|appendFile|mkdirSync|createWriteStream)/i,
    /base64.*decode/i,
    /\bpowershell\b.*\b(Set-Content|Out-File|New-Item|Add-Content)\b/i,
  ];

  return writePatterns.some((p) => p.test(command));
}

function compactForGovernanceScan(command: string): string {
  return String(command ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\[char\]\s*46/g, ".")
    .replace(/\[char\]\s*102/g, "f")
    .replace(/["'`+]/g, "")
    .replace(/\\+/g, "/");
}

function findGovernanceBypassReason(command: string, extra?: unknown): string | null {
  const compact = compactForGovernanceScan(String(command ?? "") + "\n" + String(extra ?? ""));
  const callsDaemonToolInvoke = /(127\.0\.0\.1|localhost)(:\d+)?/.test(compact) && compact.includes("/api/v1/tool/invoke");
  if (callsDaemonToolInvoke) return "SPEC_FORGE_DAEMON_TOOL_INVOKE_FORBIDDEN";

  const referencesToken =
    compact.includes("authorization:bearer") ||
    compact.includes("authorization=bearer") ||
    compact.includes("bearer") ||
    compact.includes("handshake.json");
  if (referencesToken && (/(127\.0\.0\.1|localhost)(:\d+)?/.test(compact) || compact.includes("handshake.json"))) {
    return "SPEC_FORGE_DAEMON_TOKEN_ACCESS_FORBIDDEN";
  }

  const touchesProtectedSpecforgePath =
    compact.includes(".specforge/runtime") ||
    compact.includes(".specforge/work-items") ||
    compact.includes(".specforge/logs") ||
    compact.includes(".specforge/specs") ||
    compact.includes(".specforge/project") ||
    compact.includes(".specforge/cas") ||
    (compact.includes(".spec") &&
      compact.includes("forge") &&
      (compact.includes("runtime") || compact.includes("work-items") || compact.includes("specs") || compact.includes("project") || compact.includes("logs")));

  const writesOrDeletes = /(set-content|out-file|add-content|new-item|remove-item|del|erase|rm|writefile|appendfile|createwritestream|writealltext|writefilesync|appendfilesync|opensync|fs\.write|convertto-json.*set-content|>|>>|tee)/.test(compact);
  if (touchesProtectedSpecforgePath && writesOrDeletes) return "SPEC_FORGE_RUNTIME_WRITE_FORBIDDEN";

  return null;
}

function parseToolOutput(output: unknown): any | null {
  if (!output) return null;
  if (typeof output === "object") return output;
  if (typeof output !== "string") return null;

  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function readHardStopRecord(projectDir: string, workItemId: string): any | null {
  if (!isValidWorkItemId(workItemId)) return null;

  try {
    const hardStopPath = join(projectDir, ".specforge", "work-items", workItemId, "hard_stop.json");
    if (!existsSync(hardStopPath)) return null;
    const record = JSON.parse(readFileSync(hardStopPath, "utf-8"));
    if (record?.blocked !== true) return null;
    if (!isValidWorkItemId(record.work_item_id)) return null;
    return record;
  } catch {
    return null;
  }
}

function findAnyValidHardStopRecord(projectDir: string): any | null {
  try {
    const { readdirSync } = require("node:fs");
    const wiRoot = join(projectDir, ".specforge", "work-items");
    if (!existsSync(wiRoot)) return null;

    for (const dir of readdirSync(wiRoot)) {
      if (!isValidWorkItemId(dir)) continue;
      const record = readHardStopRecord(projectDir, dir);
      if (record) return record;
    }
  } catch {
    return null;
  }

  return null;
}

function persistProjectLevelHardStop(projectDir: string, workItemId: unknown, reason: string, sourceTool: string): void {
  try {
    const { appendFileSync } = require("node:fs");
    const runtimeDir = join(projectDir, ".specforge", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    const record = {
      work_item_id: String(workItemId ?? ""),
      invalid_work_item_id: !isValidWorkItemId(workItemId),
      blocked: true,
      reason,
      source_tool: sourceTool,
      created_at: new Date().toISOString(),
    };
    appendFileSync(join(runtimeDir, "hard_stops.jsonl"), JSON.stringify(record) + "\n", "utf-8");
  } catch {
    // best effort
  }
}

function persistHardStop(projectDir: string, workItemId: unknown, reason: string, sourceTool: string): void {
  if (!isValidWorkItemId(workItemId)) {
    persistProjectLevelHardStop(projectDir, workItemId, reason, sourceTool);
    console.warn(
      `[SF HardStop] Persisted project-level hard_stop for invalid/retryable work_item_id "${String(
        workItemId ?? "",
      )}" from ${sourceTool}.`,
    );
    return;
  }

  try {
    const wiDir = join(projectDir, ".specforge", "work-items", workItemId);
    mkdirSync(wiDir, { recursive: true });
    const record = {
      work_item_id: workItemId,
      blocked: true,
      reason,
      source_tool: sourceTool,
      created_at: new Date().toISOString(),
    };
    writeFileSync(join(wiDir, "hard_stop.json"), JSON.stringify(record, null, 2) + "\n", "utf-8");
    console.error(`[SF HardStop] LATCH SET for ${workItemId} - reason: ${reason}, source: ${sourceTool}`);
  } catch (e) {
    console.error(`[SF HardStop] Failed to persist latch: ${(e as Error).message}`);
  }
}

function maybePersistHardStopFromGuardResult(
  projectDir: string,
  toolName: string,
  args: Record<string, any>,
  result: any,
): void {
  if (!result || result.hard_stop !== true) return;
  const workItemId = result.work_item_id ?? getWorkItemIdFromArgs(args);
  persistHardStop(projectDir, workItemId, result.error ?? result.reason ?? "HARD_STOP_FROM_GUARD", toolName);
}

function assertNoRelevantHardStop(projectDir: string, toolName: string, args: Record<string, any>) {
  const argWorkItemId = getWorkItemIdFromArgs(args);
  let record: any | null = null;

  if (isValidWorkItemId(argWorkItemId)) {
    record = readHardStopRecord(projectDir, argWorkItemId);
  } else if (!argWorkItemId && (isWriteTool(toolName) || isShellTool(toolName))) {
    record = findAnyValidHardStopRecord(projectDir);
  }

  if (record) {
    throw new Error(
      `[SF HardStop] BLOCKED: Work item ${record.work_item_id} has hard_stop active.\n` +
        `Reason: ${record.reason}. Source: ${record.source_tool}. Tool "${toolName}" is not allowed.\n` +
        `Only read/debug tools are permitted.`,
    );
  }
}

function assertCodePermissionEnableHasAllowedFiles(projectDir: string, toolName: string, args: Record<string, any>): void {
  const normalized = normalizeToolName(toolName);
  if (normalized !== "sfcodepermission") return;

  const action = String(args.action ?? args.operation ?? "").toLowerCase();
  if (action !== "enable" && action !== "release") return;

  const allowedWriteFiles = args.allowed_write_files ?? args.allowedWriteFiles;
  const hasAllowedFiles =
    Array.isArray(allowedWriteFiles) &&
    allowedWriteFiles.some((entry: any) => {
      if (typeof entry === "string") return entry.trim().length > 0;
      if (entry && typeof entry.path === "string") return entry.path.trim().length > 0;
      return false;
    });

  if (hasAllowedFiles) return;

  const workItemId = getWorkItemIdFromArgs(args);
  persistHardStop(projectDir, workItemId, "ALLOWED_WRITE_FILES_REQUIRED", toolName);
  throw new Error(
    `[SF HardStop] BLOCKED: sf_code_permission action="${action}" requires allowed_write_files[].\n` +
      `This is a hard stop because code permission cannot be enabled without an explicit file allowlist.`,
  );
}

function extractReadTargetsForSensitiveBoundary(args: Record<string, any>): string[] {
  const targets: string[] = [];
  const keys = ["path", "file", "filePath", "file_path", "target", "targetPath", "target_path", "filename", "name", "uri", "url"];

  for (const key of keys) pushString(targets, args?.[key]);

  for (const value of Object.values(args ?? {})) {
    if (typeof value === "string") {
      const v = value.trim();
      if (v.length > 0 && /(handshake\.json|sf-user|\.specforge|specforge|token)/i.test(v)) {
        targets.push(v);
      }
    }
  }

  return Array.from(new Set(targets));
}

function isSensitiveSpecForgeReadTarget(targetPath: string): boolean {
  const compact = String(targetPath ?? "").toLowerCase().replace(/\\+/g, "/").replace(/\s+/g, "");
  const isHandshake =
    compact.includes("handshake.json") ||
    compact.includes("/sf-user/runtime/handshake") ||
    compact.includes("/.specforge/runtime/handshake");
  const isSpecForgeRuntime = compact.includes("/.specforge/runtime/") || compact.includes("/sf-user/runtime/");
  const referencesCredential = compact.includes("token") || compact.includes("authorization") || compact.includes("bearer");
  return isHandshake || (isSpecForgeRuntime && referencesCredential);
}

function isReadTool(toolName: string): boolean {
  const normalized = normalizeToolName(toolName);
  return normalized === "read" || normalized === "readfile" || normalized === "open" || normalized === "view" || normalized === "cat";
}

function assertSensitiveReadBoundary(projectDir: string, toolName: string, args: Record<string, any>): void {
  if (!isReadTool(toolName)) return;

  const targets = extractReadTargetsForSensitiveBoundary(args);
  for (const target of targets) {
    if (!isSensitiveSpecForgeReadTarget(target)) continue;
    persistHardStop(projectDir, getWorkItemIdFromArgs(args), "SPEC_FORGE_DAEMON_TOKEN_ACCESS_FORBIDDEN", toolName);
    throw new Error(`[SF HardStop] BLOCKED sensitive SpecForge runtime read: ${target}`);
  }
}

function assertShellGovernanceBoundary(projectDir: string, toolName: string, args: Record<string, any>): void {
  if (!isShellTool(toolName)) return;

  const command: string = args.command ?? args.cmd ?? args.input ?? "";
  const reason = findGovernanceBypassReason(command, args.stdin);
  if (!reason) return;

  const workItemId = getWorkItemIdFromArgs(args);
  persistHardStop(projectDir, workItemId, reason, toolName);
  throw new Error(
    `[SF HardStop] BLOCKED shell governance bypass: ${reason}.\nCommand: "${redactSensitiveString(command).slice(0, 160)}"`,
  );
}

function getHookArgs(input: any, output: any): Record<string, any> {
  return (output?.args ?? input?.args ?? {}) as Record<string, any>;
}

function getToolName(input: any): string {
  return String(input?.tool ?? input?.name ?? input?.toolName ?? "");
}

async function guardWriteTargets(projectDir: string, toolName: string, args: Record<string, any>, targets: string[], callID?: string) {
  if (targets.length === 0) {
    throw new Error(
      `[SF WriteGuard] Write tool "${toolName}" invoked without detectable file path.\nCannot validate write permission. Blocked.`,
    );
  }

  for (const targetPath of targets) {
    let result: any;
    try {
      result = await daemonClient.checkWrite(targetPath, "agent", {
        tool: toolName,
        callID,
        directory: projectDir,
      });
    } catch (e) {
      throw new Error(
        `[SF WriteGuard] Cannot reach daemon to validate write to "${targetPath}". Failing closed.\nError: ${(e as Error).message}`,
      );
    }

    if (!result.allowed) {
      maybePersistHardStopFromGuardResult(projectDir, toolName, args, result);
      throw new Error(
        `[SF WriteGuard] BLOCKED write to "${targetPath}" by tool "${toolName}".\nReason: ${
          result.reason ?? result.error ?? "policy_violation"
        }`,
      );
    }
  }
}

async function beforeToolExecute(projectDir: string, input: any, output: any) {
  const toolName = getToolName(input);
  const args = getHookArgs(input, output);
  const safeRead = SF_SAFE_READ_TOOLS.has(toolName);
  const shouldCheckHardStop = isWriteTool(toolName) || isShellTool(toolName) || (isSfTool(toolName) && !safeRead);

  if (shouldCheckHardStop) {
    assertNoRelevantHardStop(projectDir, toolName, args);
  }

  assertCodePermissionEnableHasAllowedFiles(projectDir, toolName, args);
  assertShellGovernanceBoundary(projectDir, toolName, args);
  assertSensitiveReadBoundary(projectDir, toolName, args);

  if (isWriteTool(toolName)) {
    const targets = extractWriteTargets(toolName, args);
    await guardWriteTargets(projectDir, toolName, args, targets, input?.callID);
    return;
  }

  if (isShellTool(toolName)) {
    const command: string = args.command ?? args.cmd ?? args.input ?? "";
    if (isBashReadOnly(command)) return;

    const isWrite = isBashWriteCommand(command);
    const expectedFiles = extractBashExpectedFiles(args);

    if (isWrite || expectedFiles.length > 0) {
      let result: any;
      try {
        result = await daemonClient.bashGuard(command, expectedFiles, {
          tool: toolName,
          callID: input?.callID,
          directory: projectDir,
        });
      } catch (e) {
        throw new Error(
          `[SF WriteGuard] Cannot reach daemon to validate bash command.\nFailing closed. Command: "${redactSensitiveString(command).slice(
            0,
            100,
          )}". Error: ${(e as Error).message}`,
        );
      }

      if (!result.allowed) {
        maybePersistHardStopFromGuardResult(projectDir, toolName, args, result);
        throw new Error(
          `[SF WriteGuard] BLOCKED bash command: "${redactSensitiveString(command).slice(0, 120)}".\nReason: ${
            result.reason ?? result.error ?? "policy_violation"
          }`,
        );
      }
      return;
    }

    let result: any;
    try {
      result = await daemonClient.bashGuard(command, [], {
        tool: toolName,
        callID: input?.callID,
        directory: projectDir,
        ambiguous: true,
      });
    } catch (e) {
      throw new Error(
        `[SF WriteGuard] Ambiguous bash command and daemon unreachable. Blocked for safety. Command: "${redactSensitiveString(
          command,
        ).slice(0, 100)}".\nError: ${(e as Error).message}`,
      );
    }

    if (!result.allowed) {
      maybePersistHardStopFromGuardResult(projectDir, toolName, args, result);
      throw new Error(
        `[SF WriteGuard] BLOCKED ambiguous bash command: "${redactSensitiveString(command).slice(
          0,
          120,
        )}". No expected_write_files declared and command intent unclear.\nReason: ${
          result.reason ?? result.error ?? "undeclared_write_intent"
        }`,
      );
    }
  }
}

async function afterToolExecute(projectDir: string, input: any, output: any) {
  const toolName = getToolName(input);
  const args = (input?.args ?? output?.args ?? {}) as Record<string, any>;
  const out = output?.output ?? output?.result ?? "";

  if (isSfTool(toolName)) {
    const toolOutput = parseToolOutput(out);
    if (toolOutput && toolOutput.hard_stop === true) {
      const workItemId = toolOutput.work_item_id ?? getWorkItemIdFromArgs(args);
      persistHardStop(projectDir, workItemId, toolOutput.error ?? toolOutput.reason ?? "HARD_STOP_FROM_TOOL", toolName);
    }
  }

  if (isWriteTool(toolName) || isSideEffectTool(toolName)) {
    const expectedFiles = extractWriteTargets(toolName, args);
    try {
      const auditResult = await daemonClient.changedFilesAudit({
        command: `tool:${toolName}`,
        expectedFiles,
        callID: input?.callID,
        tool: toolName,
        toolCategory: isSideEffectTool(toolName) ? "side_effect" : "write",
        directory: projectDir,
      });
      if (auditResult?.escapedWrites?.length > 0) {
        console.error(
          `[SF WriteGuard] ESCAPED WRITES DETECTED after ${toolName}: Expected=[${expectedFiles.join(
            ", ",
          )}], Escaped=[${auditResult.escapedWrites.join(", ")}]`,
        );
        await daemonClient.recordEscapedWrite({
          command: `tool:${toolName}`,
          expectedFiles,
          escapedWrites: auditResult.escapedWrites,
          callID: input?.callID,
          timestamp: new Date().toISOString(),
          directory: projectDir,
        });
      }
    } catch (e) {
      console.warn(`[sf:audit] Post-execution audit failed for ${toolName}: ${(e as Error).message}`);
    }
    return;
  }

  if (!isShellTool(toolName) && !isSideEffectTool(toolName) && !isWriteTool(toolName)) return;

  const command: string = args.command ?? args.cmd ?? args.input ?? "";
  const expectedFiles = extractBashExpectedFiles(args);
  if (isBashReadOnly(command) && expectedFiles.length === 0) return;

  try {
    const safeCommand = redactSensitiveString(command);
    const auditResult = await daemonClient.changedFilesAudit({
      command: safeCommand,
      expectedFiles,
      callID: input?.callID,
      tool: toolName,
      directory: projectDir,
    });
    if (auditResult?.escapedWrites?.length > 0) {
      console.error(
        `[SF WriteGuard] ESCAPED WRITES DETECTED after bash command: Command=${safeCommand.slice(
          0,
          200,
        )}, Expected=[${expectedFiles.join(", ")}], Escaped=[${auditResult.escapedWrites.join(", ")}]`,
      );
      await daemonClient.recordEscapedWrite({
        command: safeCommand,
        expectedFiles,
        escapedWrites: auditResult.escapedWrites,
        callID: input?.callID,
        timestamp: new Date().toISOString(),
        directory: projectDir,
      });
    }
  } catch (e) {
    console.warn(`[sf:audit] changed_files_audit failed: ${(e as Error).message}`);
  }
}

function resolveToolTargetPath(args: Record<string, any>): string {
  const target = args.path ?? args.filePath ?? args.file_path ?? args.file ?? args.filename;
  if (typeof target === "string" && target.trim().length > 0) return target;
  throw new Error("[SF WriteGuard] write/edit tool requires path or filePath.");
}

function createNativeWriteTool(projectDir: string) {
  return tool({
    description:
      "SpecForge-governed file writer. This shadows OpenCode's native write tool and checks daemon Write Guard before creating or overwriting a file.",
    args: {
      path: tool.schema.string().optional(),
      filePath: tool.schema.string().optional(),
      file_path: tool.schema.string().optional(),
      file: tool.schema.string().optional(),
      filename: tool.schema.string().optional(),
      content: tool.schema.string(),
      work_item_id: tool.schema.string().optional(),
    },
    async execute(args: any, context: any) {
      const directory = context?.directory ?? projectDir;
      const targetPath = resolveToolTargetPath(args);
      await guardWriteTargets(directory, "write", args, [targetPath], context?.callID);
      const absolutePath = resolve(directory, targetPath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, String(args.content ?? ""), "utf-8");
      return `SpecForge WriteGuard allowed write: ${targetPath}`;
    },
  });
}

function createNativeEditTool(projectDir: string) {
  return tool({
    description:
      "SpecForge-governed exact string editor. This shadows OpenCode's native edit tool and checks daemon Write Guard before modifying a file.",
    args: {
      path: tool.schema.string().optional(),
      filePath: tool.schema.string().optional(),
      file_path: tool.schema.string().optional(),
      file: tool.schema.string().optional(),
      filename: tool.schema.string().optional(),
      oldString: tool.schema.string().optional(),
      newString: tool.schema.string().optional(),
      old_string: tool.schema.string().optional(),
      new_string: tool.schema.string().optional(),
      replaceAll: tool.schema.boolean().optional(),
      work_item_id: tool.schema.string().optional(),
    },
    async execute(args: any, context: any) {
      const directory = context?.directory ?? projectDir;
      const targetPath = resolveToolTargetPath(args);
      const oldString = args.oldString ?? args.old_string;
      const newString = args.newString ?? args.new_string;
      if (typeof oldString !== "string" || typeof newString !== "string") {
        throw new Error("[SF WriteGuard] edit tool requires oldString/newString or old_string/new_string.");
      }

      await guardWriteTargets(directory, "edit", args, [targetPath], context?.callID);

      const absolutePath = resolve(directory, targetPath);
      const current = readFileSync(absolutePath, "utf-8");
      if (!current.includes(oldString)) {
        throw new Error(`[SF WriteGuard] edit target string not found in ${targetPath}.`);
      }

      const updated = args.replaceAll === true ? current.split(oldString).join(newString) : current.replace(oldString, newString);
      writeFileSync(absolutePath, updated, "utf-8");
      return `SpecForge WriteGuard allowed edit: ${targetPath}`;
    },
  });
}

function createNativeApplyPatchTool() {
  return tool({
    description:
      "SpecForge-governed apply_patch replacement. Direct patch execution is disabled because patch target extraction is ambiguous; use write/edit/sf_safe_bash with explicit allowed_write_files instead.",
    args: {
      patch: tool.schema.string().optional(),
      input: tool.schema.string().optional(),
      work_item_id: tool.schema.string().optional(),
    },
    async execute() {
      throw new Error(
        "[SF WriteGuard] apply_patch is disabled by SpecForge native tool shadow. Use write/edit or sf_safe_bash with explicit allowed_write_files so every target can be checked before write.",
      );
    },
  });
}

export async function sf_specforge(input: PluginInput): Promise<any> {
  const projectDir = (input as any).directory ?? process.cwd();

  try {
    await daemonClient.register(projectDir);
    console.log(`[sf:specforge] Project registered: ${projectDir}`);
  } catch (e) {
    console.warn(`[sf:specforge] Project registration failed (will retry on first tool call): ${(e as Error).message}`);
  }

  return {
    tool: {
      write: createNativeWriteTool(projectDir),
      edit: createNativeEditTool(projectDir),
      apply_patch: createNativeApplyPatchTool(),
    },

    "tool.execute.before": async (input: any, output: any) => {
      await beforeToolExecute(projectDir, input, output);
    },

    "tool.execute.after": async (input: any, output: any) => {
      await afterToolExecute(projectDir, input, output);
    },
  };
}

export default sf_specforge;
