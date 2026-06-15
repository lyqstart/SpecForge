/**
 * sf_specforge.ts — SpecForge OpenCode Plugin with HARD Write Guard
 * plus OBS-FULL Layer 1 event/tool observability.
 */
import type { Hooks, PluginInput } from "@opencode-ai/plugin";

const { join, resolve } = require("node:path");
const { homedir } = require("node:os");
const { pathToFileURL } = require("node:url");
const { existsSync } = require("node:fs");

const VALID_WI_ID = /^WI-(\d{3,4}|\d{8}-\d{4})$/;

function isValidWorkItemId(value: unknown): value is string {
  return typeof value === "string" && VALID_WI_ID.test(value);
}

function getWorkItemIdFromArgs(args: Record<string, any>): string | undefined {
  const candidates = [args.work_item_id, args.workItemId, args.work_item, args.wi, args.id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function normalizeToolName(toolName: string): string {
  return toolName.toLowerCase().replace(/[_-]/g, "");
}

function resolveClientPath(): string {
  const sfUserPath = resolve(__dirname, "..", "sf-user", "lib", "sf_plugin_client.ts");
  if (existsSync(sfUserPath)) return sfUserPath;

  const v11Path = join(homedir(), ".config", "opencode", "sf-runtime", "sf_plugin_client.ts");
  if (existsSync(v11Path)) return v11Path;

  const localPath = resolve(__dirname, "..", "lib", "sf_plugin_client.ts");
  if (existsSync(localPath)) return localPath;

  const devPath = resolve(__dirname, "..", "..", "..", "packages", "daemon-client", "src", "index.ts");
  if (existsSync(devPath)) return devPath;

  throw new Error(
    `[sf:specforge] Cannot locate sf_plugin_client. Checked: ${sfUserPath}, ${v11Path}, ${localPath}, ${devPath}`,
  );
}

function resolveObservabilityPath(): string {
  const localPath = resolve(__dirname, "..", "tools", "lib", "sf-observability.ts");
  if (existsSync(localPath)) return localPath;

  const altPath = resolve(__dirname, "..", "lib", "sf-observability.ts");
  if (existsSync(altPath)) return altPath;

  throw new Error(`[sf:specforge] Cannot locate sf-observability.ts. Checked: ${localPath}, ${altPath}`);
}

const clientPath = resolveClientPath();
const observabilityPath = resolveObservabilityPath();

const { createReconnectingDaemonClient } = await import(pathToFileURL(clientPath).href);
const {
  createSfTraceId,
  recordSfObservation,
  byteLength,
  sha256,
} = await import(pathToFileURL(observabilityPath).href);

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

const SHELL_TOOLS = new Set(["bash", "shell", "execute", "run", "terminal", "cmd", "powershell", "sf_safe_bash"]);

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
  return toolName.startsWith("sf_") || toolName.startsWith("sf-");
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

  for (const key of pathKeys) {
    if (args[key] && typeof args[key] === "string") paths.push(args[key]);
  }

  if (Array.isArray(args.files)) {
    for (const f of args.files) {
      if (typeof f === "string") paths.push(f);
      else if (f && typeof f.path === "string") paths.push(f.path);
    }
  }

  if (Array.isArray(args.patches)) {
    for (const p of args.patches) {
      if (p && typeof p.path === "string") paths.push(p.path);
    }
  }

  return paths;
}

function extractBashExpectedFiles(args: Record<string, any>): string[] {
  if (Array.isArray(args.expected_write_files)) return args.expected_write_files.filter((f: any) => typeof f === "string");
  if (Array.isArray(args.expectedWriteFiles)) return args.expectedWriteFiles.filter((f: any) => typeof f === "string");
  return [];
}

function getToolArgs(primary: any, secondary: any): Record<string, any> {
  const merged: Record<string, any> = {};
  if (secondary?.args && typeof secondary.args === "object") Object.assign(merged, secondary.args);
  if (primary?.args && typeof primary.args === "object") Object.assign(merged, primary.args);
  if (primary?.input && typeof primary.input === "object") Object.assign(merged, primary.input);
  return merged;
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
    const hasWriteIndicators =
      /open\s*\(|write|makedirs|mkdir|Path\(|base64|decode|Set-Content|Out-File|New-Item|>|>>|tee\s/i.test(
        trimmed,
      );
    return !hasWriteIndicators;
  }
  return readOnlyPrefixes.some((p) => trimmed.startsWith(p));
}

function isBashWriteCommand(command: string): boolean {
  const writePatterns = [
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

let currentSessionId = "unknown";

function recordPluginObservation(projectDir: string, input: {
  category: "event" | "tool-call" | "plugin" | "error";
  phase: string;
  trace_id?: string;
  tool_name?: string;
  event_type?: string;
  status?: string;
  payload?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
}) {
  recordSfObservation({
    projectRoot: projectDir,
    ...input,
  });
}

async function postEvent(type: string, data: unknown): Promise<void> {
  try {
    await daemonClient.postEvent(currentSessionId, type, data);
  } catch {
    // Telemetry is best-effort; never block on failure.
  }
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
    const { readFileSync, existsSync } = require("node:fs");
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
    const { readdirSync, existsSync } = require("node:fs");
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

function assertNoRelevantHardStop(projectDir: string, toolName: string, args: Record<string, any>): void {
  const argWorkItemId = getWorkItemIdFromArgs(args);
  let record: any | null = null;

  if (isValidWorkItemId(argWorkItemId)) {
    record = readHardStopRecord(projectDir, argWorkItemId);
  } else if (!argWorkItemId && (isWriteTool(toolName) || isShellTool(toolName))) {
    record = findAnyValidHardStopRecord(projectDir);
  }

  if (record) {
    throw new Error(
      `[SF HardStop] BLOCKED: Work item ${record.work_item_id} has hard_stop active. ` +
        `Reason: ${record.reason}. Source: ${record.source_tool}. ` +
        `Tool "${toolName}" is not allowed. Only read/debug tools are permitted.`,
    );
  }
}

function persistHardStop(projectDir: string, workItemId: unknown, reason: string, sourceTool: string): void {
  if (!isValidWorkItemId(workItemId)) {
    console.warn(`[SF HardStop] NOT persisted for invalid/retryable work_item_id "${String(workItemId ?? "")}" from ${sourceTool}.`);
    return;
  }

  try {
    const { writeFileSync, mkdirSync } = require("node:fs");
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
    recordPluginObservation(projectDir, {
      category: "event",
      phase: "hard_stop.persisted",
      status: "blocked",
      tool_name: sourceTool,
      payload: record,
      force: true,
    } as any);
    console.error(`[SF HardStop] LATCH SET for ${workItemId} — reason: ${reason}, source: ${sourceTool}`);
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
    `[SF HardStop] BLOCKED: sf_code_permission action="${action}" requires allowed_write_files[]. ` +
      `This is a hard stop because code permission cannot be enabled without an explicit file allowlist.`,
  );
}

export async function sf_specforge(input: PluginInput): Promise<Hooks> {
  const projectDir = (input as any).directory ?? process.cwd();

  recordPluginObservation(projectDir, {
    category: "plugin",
    phase: "plugin.init",
    status: "started",
    payload: {
      directory: (input as any).directory,
      worktree: (input as any).worktree,
      project: (input as any).project,
    },
  });

  try {
    await daemonClient.register(projectDir);
    console.log(`[sf:specforge] Project registered: ${projectDir}`);
    recordPluginObservation(projectDir, {
      category: "plugin",
      phase: "plugin.register",
      status: "success",
      payload: { projectDir },
    });
  } catch (e) {
    console.warn(`[sf:specforge] Project registration failed (will retry on first tool call): ${(e as Error).message}`);
    recordPluginObservation(projectDir, {
      category: "error",
      phase: "plugin.register",
      status: "error",
      error: { message: (e as Error).message, stack: (e as Error).stack },
      force: true,
    });
  }

  return {
    "tool.execute.before": async (i: any, o: any) => {
      const trace_id = createSfTraceId();
      const toolName: string = i.tool ?? "";
      const args: Record<string, any> = getToolArgs(i, o);

      recordPluginObservation(projectDir, {
        category: "tool-call",
        phase: "tool.execute.before",
        trace_id,
        tool_name: toolName,
        status: "started",
        payload: { input: i, output: o, args },
        metadata: {
          args_bytes: byteLength(args),
          input_bytes: byteLength(i),
          output_bytes: byteLength(o),
          args_sha256: sha256(args),
        },
      });

      postEvent("tool.invoking", { tool: toolName, callID: i.callID, args, trace_id });

      const safeRead = SF_SAFE_READ_TOOLS.has(toolName);
      const shouldCheckHardStop = isWriteTool(toolName) || isShellTool(toolName) || (isSfTool(toolName) && !safeRead);
      if (shouldCheckHardStop) {
        assertNoRelevantHardStop(projectDir, toolName, args);
      }

      assertCodePermissionEnableHasAllowedFiles(projectDir, toolName, args);

      if (isWriteTool(toolName)) {
        const targets = extractWriteTargets(toolName, args);
        if (targets.length === 0) {
          throw new Error(`[SF WriteGuard] Write tool "${toolName}" invoked without detectable file path. Cannot validate write permission. Blocked.`);
        }

        for (const targetPath of targets) {
          let result: any;
          try {
            result = await daemonClient.checkWrite(targetPath, "agent", {
              tool: toolName,
              callID: i.callID,
              directory: projectDir,
              trace_id,
            });
          } catch (e) {
            throw new Error(`[SF WriteGuard] Cannot reach daemon to validate write to "${targetPath}". Failing closed. Error: ${(e as Error).message}`);
          }

          if (!result.allowed) {
            maybePersistHardStopFromGuardResult(projectDir, toolName, args, result);
            throw new Error(`[SF WriteGuard] BLOCKED write to "${targetPath}" by tool "${toolName}". Reason: ${result.reason ?? result.error ?? "policy_violation"}`);
          }
        }
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
              callID: i.callID,
              directory: projectDir,
              trace_id,
            });
          } catch (e) {
            throw new Error(`[SF WriteGuard] Cannot reach daemon to validate bash command. Failing closed. Command: "${command.slice(0, 100)}". Error: ${(e as Error).message}`);
          }

          if (!result.allowed) {
            maybePersistHardStopFromGuardResult(projectDir, toolName, args, result);
            throw new Error(`[SF WriteGuard] BLOCKED bash command: "${command.slice(0, 120)}". Reason: ${result.reason ?? result.error ?? "policy_violation"}`);
          }
          return;
        }

        let result: any;
        try {
          result = await daemonClient.bashGuard(command, [], {
            tool: toolName,
            callID: i.callID,
            directory: projectDir,
            ambiguous: true,
            trace_id,
          });
        } catch (e) {
          throw new Error(`[SF WriteGuard] Ambiguous bash command and daemon unreachable. Blocked for safety. Command: "${command.slice(0, 100)}". Error: ${(e as Error).message}`);
        }

        if (!result.allowed) {
          maybePersistHardStopFromGuardResult(projectDir, toolName, args, result);
          throw new Error(
            `[SF WriteGuard] BLOCKED ambiguous bash command: "${command.slice(0, 120)}". ` +
              `No expected_write_files declared and command intent unclear. Reason: ${result.reason ?? result.error ?? "undeclared_write_intent"}`,
          );
        }
      }
    },

    "tool.execute.after": async (i: any, o: any) => {
      const trace_id = createSfTraceId();
      const toolName: string = i.tool ?? "";
      const args: Record<string, any> = getToolArgs(i, o);
      const output = o.output ?? o.result ?? "";

      recordPluginObservation(projectDir, {
        category: "tool-call",
        phase: "tool.execute.after",
        trace_id,
        tool_name: toolName,
        status: "completed",
        payload: { input: i, output: o, args },
        metadata: {
          args_bytes: byteLength(args),
          output_bytes: byteLength(output),
          args_sha256: sha256(args),
          output_sha256: sha256(output),
        },
      });

      postEvent("tool.invoked", { tool: toolName, callID: i.callID, trace_id });

      if (isSfTool(toolName)) {
        const toolOutput = parseToolOutput(output);
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
            callID: i.callID,
            tool: toolName,
            toolCategory: isSideEffectTool(toolName) ? "side_effect" : "write",
            directory: projectDir,
            trace_id,
          });

          if (auditResult?.escapedWrites?.length > 0) {
            console.error(
              `[SF WriteGuard] ESCAPED WRITES DETECTED after ${toolName}:\n` +
                ` Expected: [${expectedFiles.join(", ")}]\n` +
                ` Escaped: [${auditResult.escapedWrites.join(", ")}]`,
            );

            await daemonClient.recordEscapedWrite({
              command: `tool:${toolName}`,
              expectedFiles,
              escapedWrites: auditResult.escapedWrites,
              callID: i.callID,
              timestamp: new Date().toISOString(),
              directory: projectDir,
              trace_id,
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
        const auditResult = await daemonClient.changedFilesAudit({
          command,
          expectedFiles,
          callID: i.callID,
          tool: toolName,
          directory: projectDir,
          trace_id,
        });

        if (auditResult?.escapedWrites?.length > 0) {
          console.error(
            `[SF WriteGuard] ESCAPED WRITES DETECTED after bash command:\n` +
              ` Command: ${command.slice(0, 200)}\n` +
              ` Expected: [${expectedFiles.join(", ")}]\n` +
              ` Escaped: [${auditResult.escapedWrites.join(", ")}]`,
          );

          await daemonClient.recordEscapedWrite({
            command,
            expectedFiles,
            escapedWrites: auditResult.escapedWrites,
            callID: i.callID,
            timestamp: new Date().toISOString(),
            directory: projectDir,
            trace_id,
          });
        }
      } catch (e) {
        console.warn(`[sf:audit] changed_files_audit failed: ${(e as Error).message}`);
      }
    },

    event: async (i: any) => {
      const trace_id = createSfTraceId();
      const evt = i.event;

      if (evt && typeof evt === "object") {
        const eventType: string = typeof evt.type === "string" ? evt.type : "unknown";
        if (evt.properties?.sessionID) currentSessionId = evt.properties.sessionID;

        recordPluginObservation(projectDir, {
          category: "event",
          phase: "opencode.event",
          trace_id,
          event_type: eventType,
          session_id: evt.properties?.sessionID,
          status: "received",
          payload: { id: evt.id, type: eventType, properties: evt.properties, raw: evt },
        });

        await postEvent(`opencode.${eventType}`, {
          id: evt.id,
          type: eventType,
          sessionID: evt.properties?.sessionID,
          properties: evt.properties,
          trace_id,
        });
      } else {
        recordPluginObservation(projectDir, {
          category: "event",
          phase: "opencode.event",
          trace_id,
          event_type: "unknown",
          status: "received",
          payload: { raw: typeof evt },
        });
        await postEvent("opencode.event", { raw: typeof evt, trace_id });
      }
    },

    "experimental.session.compacting": async (i: any) => {
      const trace_id = createSfTraceId();
      if (i.sessionID) currentSessionId = i.sessionID;
      recordPluginObservation(projectDir, {
        category: "event",
        phase: "experimental.session.compacting",
        trace_id,
        session_id: i.sessionID,
        status: "received",
        payload: i,
      });
      await postEvent("session.compacting", { sessionID: i.sessionID, trace_id });
    },

    "experimental.chat.system.transform": async (i: any, o: any) => {
      const trace_id = createSfTraceId();
      if (i.sessionID) currentSessionId = i.sessionID;
      recordPluginObservation(projectDir, {
        category: "event",
        phase: "experimental.chat.system.transform",
        trace_id,
        session_id: i.sessionID,
        status: "received",
        payload: { input: i, output: o },
      });
      if (!shouldIgnoreSfObservationEvent(projectDir, "experimental.chat.system.transform")) await postEvent("llm.context.prepared", summarizeOpenCodeEventForDaemon("experimental.chat.system.transform", { system: o.system, sessionID: i.sessionID, trace_id }));
    },

    "experimental.chat.messages.transform": async (i: any, o: any) => {
      const trace_id = createSfTraceId();
      recordPluginObservation(projectDir, {
        category: "event",
        phase: "experimental.chat.messages.transform",
        trace_id,
        session_id: i?.sessionID,
        status: "received",
        payload: { input: i, output: o },
      });
      if (!shouldIgnoreSfObservationEvent(projectDir, "experimental.chat.messages.transform")) await postEvent("llm.messages", summarizeOpenCodeEventForDaemon("experimental.chat.messages.transform", { messages: o.messages, sessionID: i?.sessionID, trace_id }));
    },

    "chat.params": async (i: any, o: any) => {
      const trace_id = createSfTraceId();
      if (i.sessionID) currentSessionId = i.sessionID;
      recordPluginObservation(projectDir, {
        category: "event",
        phase: "chat.params",
        trace_id,
        session_id: i.sessionID,
        status: "received",
        payload: { input: i, output: o },
      });
      await postEvent("chat.params", { params: o, sessionID: i.sessionID, trace_id });
    },

    "chat.headers": async (i: any, o: any) => {
      const trace_id = createSfTraceId();
      const safe = { ...(o?.headers ?? {}) };
      if (safe.Authorization) safe.Authorization = "Bearer ****";
      recordPluginObservation(projectDir, {
        category: "event",
        phase: "chat.headers",
        trace_id,
        session_id: i.sessionID,
        status: "received",
        payload: { input: i, output: { ...o, headers: safe } },
      });
      await postEvent("chat.headers", { headers: safe, sessionID: i.sessionID, trace_id });
    },
  };
}

export default sf_specforge;
