/**
 * bash-guard.ts — Bash command safety guard
 *
 * Blocks dangerous shell commands and checks file-modifying commands
 * against the write policy before execution.
 */

import type { WritePolicyRule } from './write-policy.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BashGuardCheck {
  command: string
  allowed: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Dangerous command patterns
// ---------------------------------------------------------------------------

/** Patterns that are always blocked regardless of context */
const DANGEROUS_PATTERNS: ReadonlyArray<{
  pattern: RegExp
  reason: string
}> = [
  // rm -rf / or rm -rf /*
  { pattern: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+(-[a-zA-Z]*r[a-zA-Z]*\s*)?\/\s*|-[a-zA-Z]*r[a-zA-Z]*\s+(-[a-zA-Z]*f[a-zA-Z]*\s*)?\/\s*|-[a-zA-Z]*rf[a-zA-Z]*\s+\/)/,
    reason: 'dangerous: rm -rf / is not allowed' },
  // sudo
  { pattern: /\bsudo\b/, reason: 'dangerous: sudo is not allowed' },
  // curl|sh, curl|bash, wget|sh, wget|bash (pipe to shell)
  { pattern: /\b(curl|wget)\s+[^|]*\|\s*(sh|bash)\b/, reason: 'dangerous: piping remote content to shell is not allowed' },
  // chmod 777 or chmod a+rwx on root-level paths
  { pattern: /\bchmod\s+([0-7]*777|a\+rwx)\s+\/(\s|$)/, reason: 'dangerous: chmod 777 on root path is not allowed' },
  // mkfs
  { pattern: /\bmkfs\b/, reason: 'dangerous: mkfs is not allowed' },
  // dd to a disk device
  { pattern: /\bdd\s+.*of=\/dev\//, reason: 'dangerous: dd to device is not allowed' },
  // :(){ :|:& };: (fork bomb)
  { pattern: /:\(\)\{\s*:\|:&\s*\};\s*:/, reason: 'dangerous: fork bomb pattern detected' },
  // > /dev/sda
  { pattern: />\s*\/dev\/sd[a-z]/, reason: 'dangerous: redirect to block device is not allowed' },
  // shutdown, reboot, poweroff
  { pattern: /\b(shutdown|reboot|poweroff|halt)\b/, reason: 'dangerous: system power commands are not allowed' },
  // format/erase commands
  { pattern: /\b(format\s+[A-Za-z]:|diskpart)\b/i, reason: 'dangerous: disk formatting commands are not allowed' },
]

/** File-modifying command patterns (checked against write policy) */
const FILE_MODIFYING_PATTERNS: ReadonlyArray<{
  pattern: RegExp
  extractPath: (match: RegExpMatchArray) => string | null
  operation: 'create' | 'modify' | 'delete'
}> = [
  // redirection to file: > file or >> file
  {
    pattern: />>?\s*["']?([^\s"';&|]+)["']?/,
    extractPath: (m) => m[1],
    operation: 'modify',
  },
  // tee filename
  {
    pattern: /\btee\s+["']?([^\s"';&|]+)["']?/,
    extractPath: (m) => m[1],
    operation: 'modify',
  },
]

// ---------------------------------------------------------------------------
// guardBashCommand
// ---------------------------------------------------------------------------

/**
 * Check a bash command against safety rules and write policy.
 *
 * @param command The raw bash command string to check
 * @param policy The write policy rule to evaluate file-modifying commands against
 * @returns BashGuardCheck with allowed=true if the command passes all checks
 */
export function guardBashCommand(
  command: string,
  policy: WritePolicyRule,
): BashGuardCheck {
  // 1. Check always-dangerous patterns
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { command, allowed: false, reason }
    }
  }

  // 2. Check file-modifying commands against the write policy
  for (const { pattern, extractPath, operation } of FILE_MODIFYING_PATTERNS) {
    const match = pattern.exec(command)
    if (match) {
      const targetPath = extractPath(match)
      if (targetPath) {
        // Use a minimal context for policy check (command-level guard
        // focuses on path safety; full context evaluation is done by
        // the write guard itself when the actual write occurs)
        const violation = policy.check(
          {
            hasActiveWI: true,
            callerRole: 'agent',
            isFrozen: false,
          },
          targetPath,
        )
        if (violation !== null) {
          return {
            command,
            allowed: false,
            reason: `write policy violation: ${violation}`,
          }
        }
      }
    }
  }

  return { command, allowed: true }
}
