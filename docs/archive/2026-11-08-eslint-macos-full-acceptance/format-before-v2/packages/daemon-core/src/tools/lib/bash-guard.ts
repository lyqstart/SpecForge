/**
 * bash-guard.ts — Bash command safety guard
 *
 * Blocks commands that are unsafe regardless of write authorization.
 * Write authorization is evaluated separately by the runtime write guard.
 */

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

// ---------------------------------------------------------------------------
// guardBashCommand
// ---------------------------------------------------------------------------

/**
 * Check a bash command against unconditional safety rules.
 *
 * @param command The raw bash command string to check
 * @returns BashGuardCheck with allowed=true if the command passes all checks
 */
export function guardBashCommand(command: string): BashGuardCheck {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { command, allowed: false, reason }
    }
  }

  return { command, allowed: true }
}
