/** SPS §9.2 / D18: internal read operations and a fixed audit sink; no shell, subprocess or HostProfile synthesis. */
import * as path from "node:path";
import type {SafeBashArgs, SafeBashResult} from "./sf_safe_bash_types";
import {executeCommand, appendShellAudit} from "./sf_safe_bash_executor";
interface HostProfile {
  schema_version: string
  hostname: string
  os: { platform: string; release: string; version: string; arch: string; totalmem_gb: number; cpu_count: number }
  locale: { system_lang: string; console_codepage: number | null; encoding: string; timezone: string; tz_offset_minutes: number; datetime_now: string }
  shells: Array<{ name: string; path: string | null; version: string | null; default_encoding: string; needs_encoding_fix: boolean; available: boolean; preferred: boolean; note?: string }>
  tools: Record<string, { available: boolean; version: string | null; path: string | null; note?: string }>
  shell_rules: { preferred_shell: string | null; max_command_length: number; encoding_setup_command: string; path_separator: string; path_quote_required_for_spaces: boolean; supports_glob_in_shell: boolean; ci_mode: boolean }
  user: { username: string; home_dir: string; shell_history_file: string | null }
  specforge: { install_root: string; logs_dir: string }
}
export type {HostProfile};

export async function safeBashExecute(args: SafeBashArgs, baseDir: string): Promise<SafeBashResult> {
  const result = await executeCommand({command: args.command, cwd: path.resolve(baseDir, args.cwd ?? '.'), projectRoot: baseDir,
    timeoutMs: args.timeoutMs ?? 60000, outputLimit: args.outputLimit ?? 4096, env: args.env, stdin: args.stdin});
  appendShellAudit(baseDir, {schema_version:'1.0',ts:new Date().toISOString(), command:args.command, cwd:result.cwd, shell:null, exitCode:result.exitCode, durationMs:result.durationMs, rejected:result.rejected, rule:result.rule??null, timeout:result.timeout,success:result.success,stdout_size:result.stdout.length,stderr_size:result.stderr.length,callerRole:args.callerRole??null});
  return result;
}
