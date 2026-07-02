/**
 * shell-command-write-intent.ts
 *
 * v1.2.5 hotfix: distinguish local project write targets from remote ops
 * command bodies. Write Guard must never treat paths inside quoted ssh remote
 * commands as local project write targets. Local shell redirections around the
 * ssh/scp/rsync command remain visible to the local Write Guard.
 */

export interface RemoteCommandSegment {
  tool: 'ssh' | 'scp' | 'rsync';
  host?: string;
  body?: string;
  start: number;
  end: number;
  reason: string;
}

export interface ShellCommandWriteIntentAnalysis {
  original_command: string;
  command_for_local_write_scan: string;
  remote_segments: RemoteCommandSegment[];
  remote_execution_detected: boolean;
}

function isShellWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

function skipWhitespace(text: string, index: number): number {
  let i = index;
  while (i < text.length && isShellWhitespace(text[i])) i += 1;
  return i;
}

function readToken(text: string, index: number): { token: string; end: number } {
  let i = skipWhitespace(text, index);
  const start = i;
  while (i < text.length && !isShellWhitespace(text[i])) i += 1;
  return { token: text.slice(start, i), end: i };
}

function skipSshOptions(text: string, index: number): number {
  let i = skipWhitespace(text, index);
  while (i < text.length) {
    const token = readToken(text, i);
    if (!token.token.startsWith('-')) return i;
    i = token.end;

    // Common ssh options that take a following value. This list is deliberately
    // conservative; unknown -x style options without a separate value are still
    // skipped correctly.
    const opt = token.token.replace(/^--?/, '');
    const optionTakesValue = /^(b|c|D|E|e|F|I|i|J|L|l|m|O|o|p|Q|R|S|W|w)$/i.test(opt)
      || /^(bind_address|cipher_spec|config|identity_file|jump_host|login_name|mac_spec|option|port)$/i.test(opt);
    if (optionTakesValue) {
      const value = readToken(text, i);
      if (value.token) i = value.end;
    }
    i = skipWhitespace(text, i);
  }
  return i;
}

function findQuotedStringEnd(text: string, quoteStart: number): number {
  const quote = text[quoteStart];
  let escaped = false;
  for (let i = quoteStart + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quote) return i;
  }
  return -1;
}

function maskRange(source: string, start: number, end: number, replacement: string): string {
  return source.slice(0, start) + replacement + source.slice(end);
}

function findSshSegments(command: string): RemoteCommandSegment[] {
  const segments: RemoteCommandSegment[] = [];
  const sshPattern = /(?:^|[;&|()]\s*)ssh\b/g;
  let match: RegExpExecArray | null;
  while ((match = sshPattern.exec(command)) !== null) {
    const sshStart = match.index + match[0].lastIndexOf('ssh');
    let i = sshStart + 3;
    i = skipSshOptions(command, i);
    const hostToken = readToken(command, i);
    if (!hostToken.token) continue;
    i = skipWhitespace(command, hostToken.end);
    if (i >= command.length) continue;

    const quote = command[i];
    if (quote !== '"' && quote !== "'") continue;
    const quoteEnd = findQuotedStringEnd(command, i);
    if (quoteEnd < 0) continue;
    segments.push({
      tool: 'ssh',
      host: hostToken.token,
      body: command.slice(i + 1, quoteEnd),
      start: i,
      end: quoteEnd + 1,
      reason: 'quoted ssh remote command body',
    });
    sshPattern.lastIndex = quoteEnd + 1;
  }
  return segments;
}

function detectTransferSegments(command: string): RemoteCommandSegment[] {
  const result: RemoteCommandSegment[] = [];
  const transferPattern = /(?:^|[;&|()]\s*)(scp|rsync)\b[^;&|]*/g;
  let match: RegExpExecArray | null;
  while ((match = transferPattern.exec(command)) !== null) {
    const text = match[0];
    const hostMatch = /\b([^\s:]+):([^\s]+)/.exec(text);
    result.push({
      tool: match[1] as 'scp' | 'rsync',
      host: hostMatch?.[1],
      start: match.index,
      end: match.index + match[0].length,
      reason: hostMatch ? 'remote transfer target/source detected' : 'transfer command detected',
    });
  }
  return result;
}

/**
 * Return a command string where remote ssh command bodies are replaced with an
 * empty quoted body. The caller may safely run its existing local write target
 * extractor on command_for_local_write_scan.
 */
export function stripRemoteExecutionSegmentsForLocalWriteGuard(command: string): ShellCommandWriteIntentAnalysis {
  const original = String(command ?? '');
  const sshSegments = findSshSegments(original);
  const transferSegments = detectTransferSegments(original);

  let masked = original;
  // Replace from right to left so offsets remain valid.
  for (const segment of [...sshSegments].sort((a, b) => b.start - a.start)) {
    masked = maskRange(masked, segment.start, segment.end, '""');
  }

  return {
    original_command: original,
    command_for_local_write_scan: masked,
    remote_segments: [...sshSegments, ...transferSegments],
    remote_execution_detected: sshSegments.length > 0 || transferSegments.length > 0,
  };
}
