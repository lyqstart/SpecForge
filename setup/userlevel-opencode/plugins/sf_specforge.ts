/**
 * sf_specforge.ts — SpecForge OpenCode Plugin with HARD Write Guard
 *
 * This plugin enforces write policy at the tool-execution boundary.
 * Unlike the previous version (P0-3 audit finding), this implementation
 * THROWS on unauthorized writes — it does not warn-and-continue.
 *
 * v1.1 Standard Compliance:
 * - Client loaded from ~/.config/opencode/sf-runtime/ (not legacy ~/.specforge/)
 * - Write guard enforced via throw in tool.execute.before
 * - Escaped write detection in tool.execute.after
 *
 * Flow:
 *   1. Startup: register project with daemon
 *   2. tool.execute.before: detect write tools → checkWrite → throw on violation
 *   3. tool.execute.after: audit changed files vs declared → block WI on escape
 *   4. Telemetry hooks: non-blocking event reporting (secondary)
 */

import type { Hooks, PluginInput } from "@opencode-ai/plugin"

// ── v1.1 Client Loading ─────────────────────────────────────────────────────────
// P0-3.3 fix: load from ~/.config/opencode/sf-runtime/ per v1.1 standard.
// Falls back to plugin-relative path. NEVER loads from legacy ~/.specforge/lib/.

const { join, resolve, dirname } = require("node:path")
const { homedir } = require("node:os")
const { pathToFileURL } = require("node:url")
const { existsSync } = require("node:fs")

function resolveClientPath(): string {
  // Primary: v1.1 standard location
  const v11Path = join(homedir(), ".config", "opencode", "sf-runtime", "sf_plugin_client.ts")
  if (existsSync(v11Path)) return v11Path

  // Fallback: plugin-relative bundled client
  const localPath = resolve(__dirname, "..", "lib", "sf_plugin_client.ts")
  if (existsSync(localPath)) return localPath

  // Last resort: workspace packages (dev mode)
  const devPath = resolve(__dirname, "..", "..", "..", "packages", "daemon-client", "src", "index.ts")
  if (existsSync(devPath)) return devPath

  throw new Error(
    `[sf:specforge] Cannot locate sf_plugin_client. ` +
    `Checked: ${v11Path}, ${localPath}, ${devPath}`
  )
}

const clientPath = resolveClientPath()
const { createReconnectingDaemonClient } = await import(pathToFileURL(clientPath).href)

// ── Daemon Client ────────────────────────────────────────────────────────────────

const daemonClient = createReconnectingDaemonClient({
  initialDelayMs: 1000,
  maxCumulativeBackoffMs: 60000,
  backoffFactor: 2.0,
})

// ── Write Tool Detection ─────────────────────────────────────────────────────────

/** Tools that perform file writes (direct or indirect). */
const WRITE_TOOLS = new Set([
  // Core write tools
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
  // File operations
  "move",
  "rename",
  "delete",
  "remove",
  "mkdir",
  "copy",
  // Git tools (can modify working tree)
  "git",
  "git_commit",
  "git_apply",
  "git_checkout",
  "git_merge",
  "git_rebase",
  "git_reset",
  "git_stash",
  // Package managers (direct)
  "npm",
  "yarn",
  "pnpm",
  // Package manager install tools
  "bun_install",
  "npm_install",
  "yarn_install",
  "pnpm_install",
  "pip_install",
  "cargo_build",
  // Code formatters
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
  // Code generators
  "codegen",
  "prisma_generate",
  "protoc",
  "openapi_generate",
  // Snapshot tools
  "vitest_update",
  "jest_update",
  "snapshot_update",
])

/**
 * Tools that produce file side effects (formatters, generators, package managers, snapshot updaters).
 * These must go through changedFilesAudit in tool.execute.after even if they pass the before-check.
 */
const SIDE_EFFECT_TOOLS = new Set([
  // Formatters
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
  // Code generators
  "codegen",
  "prisma_generate",
  "protoc",
  "openapi_generate",
  // Package managers
  "bun_install",
  "npm_install",
  "yarn_install",
  "pnpm_install",
  "pip_install",
  "cargo_build",
  // Snapshot updaters
  "vitest_update",
  "jest_update",
  "snapshot_update",
])

/** Tools that execute arbitrary commands (may write files). */
const SHELL_TOOLS = new Set([
  "bash",
  "shell",
  "execute",
  "run",
  "terminal",
  "cmd",
  "powershell",
])

function isWriteTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/[_-]/g, "")
  // Direct match
  if (WRITE_TOOLS.has(toolName)) return true
  if (WRITE_TOOLS.has(normalized)) return true
  // Prefix/suffix heuristics
  if (normalized.includes("write") || normalized.includes("edit")) return true
  if (normalized.includes("patch") || normalized.includes("create")) return true
  if (normalized.includes("delete") || normalized.includes("remove")) return true
  return false
}

function isSideEffectTool(toolName: string): boolean {
  if (SIDE_EFFECT_TOOLS.has(toolName)) return true
  const normalized = toolName.toLowerCase().replace(/[_-]/g, "")
  if (SIDE_EFFECT_TOOLS.has(normalized)) return true
  // Heuristic: tools with format/generate/install/snapshot in name
  if (normalized.includes("format") || normalized.includes("generate")) return true
  if (normalized.includes("install") || normalized.includes("snapshot")) return true
  return false
}

function isShellTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/[_-]/g, "")
  return SHELL_TOOLS.has(toolName) || SHELL_TOOLS.has(normalized)
}

// ── Path Extraction ──────────────────────────────────────────────────────────────

/** Extract target file path(s) from tool arguments. */
function extractWriteTargets(toolName: string, args: Record<string, any>): string[] {
  const paths: string[] = []

  // Common arg names for file paths
  const pathKeys = [
    "path", "file", "filePath", "file_path", "target",
    "targetFile", "target_file", "destination", "dest",
    "filename", "name", "to",
  ]

  for (const key of pathKeys) {
    if (args[key] && typeof args[key] === "string") {
      paths.push(args[key])
    }
  }

  // For multi-file operations
  if (Array.isArray(args.files)) {
    for (const f of args.files) {
      if (typeof f === "string") paths.push(f)
      else if (f && typeof f.path === "string") paths.push(f.path)
    }
  }

  // For patch/diff operations
  if (args.patches && Array.isArray(args.patches)) {
    for (const p of args.patches) {
      if (p && typeof p.path === "string") paths.push(p.path)
    }
  }

  return paths
}

/** Extract expected write files from bash command args. */
function extractBashExpectedFiles(args: Record<string, any>): string[] {
  // The agent should declare expected_write_files for bash commands
  if (Array.isArray(args.expected_write_files)) {
    return args.expected_write_files.filter((f: any) => typeof f === "string")
  }
  if (Array.isArray(args.expectedWriteFiles)) {
    return args.expectedWriteFiles.filter((f: any) => typeof f === "string")
  }
  return []
}

/** Heuristic: detect if a bash command is read-only. */
function isBashReadOnly(command: string): boolean {
  const readOnlyPrefixes = [
    "cat ", "ls ", "dir ", "echo ", "printf ", "head ", "tail ",
    "grep ", "rg ", "find ", "which ", "where ", "type ",
    "pwd", "whoami", "date", "uname", "env ", "printenv",
    "node -e", "node --eval", "python -c", "python3 -c",
    "git status", "git log", "git diff", "git show", "git branch",
    "git remote", "git tag", "npm list", "npm ls", "npm info",
    "yarn list", "yarn info", "pnpm list",
    "test ", "[ ", "[[ ",
  ]
  const trimmed = command.trim()
  return readOnlyPrefixes.some(p => trimmed.startsWith(p))
}

/** Heuristic: detect if a bash command is clearly a write operation. */
function isBashWriteCommand(command: string): boolean {
  const writePatterns = [
    /\bcp\b/, /\bmv\b/, /\brm\b/, /\bmkdir\b/, /\brmdir\b/,
    /\btouch\b/, /\bchmod\b/, /\bchown\b/,
    /\bnpm install\b/, /\bnpm i\b/, /\byarn add\b/, /\bpnpm add\b/,
    /\bgit (add|commit|push|merge|rebase|reset|checkout|stash|apply)\b/,
    /\bsed\b.*-i/, /\bawk\b.*-i/,
    />/, />>/, /\btee\b/,
  ]
  return writePatterns.some(p => p.test(command))
}

// ── Telemetry (non-blocking) ─────────────────────────────────────────────────────

/** Post telemetry event — never throws, never blocks. */
async function postEvent(type: string, data: unknown): Promise<void> {
  try {
    await daemonClient.postEvent(type, { data, ts: Date.now() })
  } catch {
    // Telemetry is best-effort; never block on failure
  }
}

// ── Plugin Entry ─────────────────────────────────────────────────────────────────

export async function sf_specforge(input: PluginInput): Promise<Hooks> {
  const projectDir = (input as any).directory ?? process.cwd()

  // Startup: register project with daemon (idempotent)
  try {
    await daemonClient.register(projectDir)
    console.log(`[sf:specforge] Project registered: ${projectDir}`)
  } catch (e) {
    console.warn(
      `[sf:specforge] Project registration failed (will retry on first tool call): ${(e as Error).message}`
    )
  }

  return {
    // ══════════════════════════════════════════════════════════════════════════════
    // HARD WRITE GUARD — tool.execute.before
    // This hook THROWS to block unauthorized writes.
    // ══════════════════════════════════════════════════════════════════════════════
    "tool.execute.before": async (i: any, o: any) => {
      const toolName: string = i.tool ?? ""
      const args: Record<string, any> = o.args ?? {}

      // Telemetry (non-blocking, fire-and-forget)
      postEvent("tool.invoking", { tool: toolName, callID: i.callID, args })

      // ── Write Tool Guard ──────────────────────────────────────────────────────
      if (isWriteTool(toolName)) {
        const targets = extractWriteTargets(toolName, args)

        if (targets.length === 0) {
          // Write tool with no detectable path — block as precaution
          throw new Error(
            `[SF WriteGuard] Write tool "${toolName}" invoked without detectable file path. ` +
            `Cannot validate write permission. Blocked.`
          )
        }

        // Validate each target path with daemon
        for (const targetPath of targets) {
          let result: { allowed: boolean; reason?: string }
          try {
            result = await daemonClient.checkWrite(targetPath, "agent", {
              tool: toolName,
              callID: i.callID,
            })
          } catch (e) {
            // Daemon unreachable — fail closed (block the write)
            throw new Error(
              `[SF WriteGuard] Cannot reach daemon to validate write to "${targetPath}". ` +
              `Failing closed. Error: ${(e as Error).message}`
            )
          }

          if (!result.allowed) {
            throw new Error(
              `[SF WriteGuard] BLOCKED write to "${targetPath}" ` +
              `by tool "${toolName}". Reason: ${result.reason ?? "policy_violation"}`
            )
          }
        }

        return // Write allowed — continue execution
      }

      // ── Shell/Bash Guard ──────────────────────────────────────────────────────
      if (isShellTool(toolName)) {
        const command: string = args.command ?? args.cmd ?? args.input ?? ""

        // Pure read-only commands — allow without daemon check
        if (isBashReadOnly(command)) {
          return
        }

        // Check if command appears to write
        const isWrite = isBashWriteCommand(command)
        const expectedFiles = extractBashExpectedFiles(args)

        if (isWrite || expectedFiles.length > 0) {
          // Validate with daemon's bashGuard
          let result: { allowed: boolean; reason?: string }
          try {
            result = await daemonClient.bashGuard(command, expectedFiles, {
              tool: toolName,
              callID: i.callID,
            })
          } catch (e) {
            // Daemon unreachable — fail closed
            throw new Error(
              `[SF WriteGuard] Cannot reach daemon to validate bash command. ` +
              `Failing closed. Command: "${command.slice(0, 100)}". ` +
              `Error: ${(e as Error).message}`
            )
          }

          if (!result.allowed) {
            throw new Error(
              `[SF WriteGuard] BLOCKED bash command: "${command.slice(0, 120)}". ` +
              `Reason: ${result.reason ?? "policy_violation"}`
            )
          }

          return // Bash command allowed
        }

        // Ambiguous command — cannot determine if it writes.
        // Default: block unless daemon explicitly approves.
        if (!isBashReadOnly(command)) {
          let result: { allowed: boolean; reason?: string }
          try {
            result = await daemonClient.bashGuard(command, [], {
              tool: toolName,
              callID: i.callID,
              ambiguous: true,
            })
          } catch (e) {
            // Daemon unreachable + ambiguous command → block
            throw new Error(
              `[SF WriteGuard] Ambiguous bash command and daemon unreachable. ` +
              `Blocked for safety. Command: "${command.slice(0, 100)}". ` +
              `Error: ${(e as Error).message}`
            )
          }

          if (!result.allowed) {
            throw new Error(
              `[SF WriteGuard] BLOCKED ambiguous bash command: "${command.slice(0, 120)}". ` +
              `No expected_write_files declared and command intent unclear. ` +
              `Reason: ${result.reason ?? "undeclared_write_intent"}`
            )
          }
        }
      }

      // Non-write tools pass through without guard check
    },

    // ══════════════════════════════════════════════════════════════════════════════
    // ESCAPED WRITE AUDIT — tool.execute.after
    // Detects writes that bypassed the pre-check (e.g., bash side-effects).
    // Also audits ALL write tools and side-effect tools for compliance.
    // ══════════════════════════════════════════════════════════════════════════════
    "tool.execute.after": async (i: any, o: any) => {
      const toolName: string = i.tool ?? ""
      const args: Record<string, any> = i.args ?? o.args ?? {}
      const output = o.output ?? o.result ?? ""

      // Telemetry (non-blocking)
      postEvent("tool.invoked", { tool: toolName, callID: i.callID })

      // ── Audit ALL write tools and side-effect tools ────────────────────────────
      // Any tool in WRITE_TOOLS or SIDE_EFFECT_TOOLS should be audited post-execution
      if (isWriteTool(toolName) || isSideEffectTool(toolName)) {
        const expectedFiles = extractWriteTargets(toolName, args)

        try {
          const auditResult = await daemonClient.changedFilesAudit({
            command: `tool:${toolName}`,
            expectedFiles,
            callID: i.callID,
            tool: toolName,
            toolCategory: isSideEffectTool(toolName) ? 'side_effect' : 'write',
          })

          if (auditResult && auditResult.escapedWrites && auditResult.escapedWrites.length > 0) {
            console.error(
              `[SF WriteGuard] ESCAPED WRITES DETECTED after ${toolName}:\n` +
              `  Expected: [${expectedFiles.join(", ")}]\n` +
              `  Escaped:  [${auditResult.escapedWrites.join(", ")}]`
            )

            await daemonClient.recordEscapedWrite({
              command: `tool:${toolName}`,
              expectedFiles,
              escapedWrites: auditResult.escapedWrites,
              callID: i.callID,
              timestamp: new Date().toISOString(),
            })
          }
        } catch (e) {
          console.warn(
            `[sf:audit] Post-execution audit failed for ${toolName}: ${(e as Error).message}`
          )
        }

        return // Audit complete for write/side-effect tools
      }

      // ── Shell tool escaped write audit ─────────────────────────────────────────
      // Audit shell tools AND side-effect tools for escaped writes
      if (!isShellTool(toolName) && !isSideEffectTool(toolName) && !isWriteTool(toolName)) return

      const command: string = args.command ?? args.cmd ?? args.input ?? ""
      const expectedFiles = extractBashExpectedFiles(args)

      // Skip audit for declared read-only commands
      if (isBashReadOnly(command) && expectedFiles.length === 0) return

      // Ask daemon to perform changed_files_audit
      try {
        const auditResult = await daemonClient.changedFilesAudit({
          command,
          expectedFiles,
          callID: i.callID,
          tool: toolName,
        })

        if (auditResult && auditResult.escapedWrites && auditResult.escapedWrites.length > 0) {
          // Escaped writes detected — record incident and block WI progression
          console.error(
            `[SF WriteGuard] ESCAPED WRITES DETECTED after bash command:\n` +
            `  Command: ${command.slice(0, 200)}\n` +
            `  Expected: [${expectedFiles.join(", ")}]\n` +
            `  Escaped:  [${auditResult.escapedWrites.join(", ")}]`
          )

          // Notify daemon to block work item progression
          await daemonClient.recordEscapedWrite({
            command,
            expectedFiles,
            escapedWrites: auditResult.escapedWrites,
            callID: i.callID,
            timestamp: new Date().toISOString(),
          })
        }
      } catch (e) {
        // Audit failure is logged but does not block execution (post-hoc check)
        console.warn(
          `[sf:audit] changed_files_audit failed: ${(e as Error).message}`
        )
      }
    },

    // ══════════════════════════════════════════════════════════════════════════════
    // SECONDARY TELEMETRY — non-blocking event reporting
    // These hooks are wrapped to never throw (P0-3 compliant for non-guard hooks).
    // ══════════════════════════════════════════════════════════════════════════════

    "event": async (i: any) => {
      await postEvent("opencode.event", i.event)
    },

    "experimental.session.compacting": async (i: any) => {
      await postEvent("session.compacting", { sessionID: i.sessionID })
    },

    "experimental.chat.system.transform": async (i: any, o: any) => {
      await postEvent("llm.context.prepared", { system: o.system, sessionID: i.sessionID })
    },

    "experimental.chat.messages.transform": async (_i: any, o: any) => {
      await postEvent("llm.messages", { messages: o.messages })
    },

    "chat.params": async (i: any, o: any) => {
      await postEvent("chat.params", { params: o, sessionID: i.sessionID })
    },

    "chat.headers": async (i: any, o: any) => {
      const safe = { ...o.headers }
      if (safe.Authorization) safe.Authorization = "Bearer ****"
      await postEvent("chat.headers", { headers: safe, sessionID: i.sessionID })
    },
  }
}

export default sf_specforge
