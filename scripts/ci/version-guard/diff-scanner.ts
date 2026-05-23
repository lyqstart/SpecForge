/**
 * scripts/ci/version-guard/diff-scanner.ts
 *
 * Generic diff & file-content scanner used by CI Version Guard rules
 * (R5 / R6 / R7 / R8 — see spec `version-unification`).
 *
 * Responsibilities:
 *   1. List files changed between `<diffBase>` and HEAD via git plumbing
 *      (`git diff <base>...HEAD --name-only -z`)
 *   2. Parse `git diff --unified=0` hunks for a single file into added /
 *      removed line records (with new/old line numbers)
 *   3. Read a file with a size cap (Bun.file), returning null when the
 *      file exceeds the cap (design D7: skip files > 1 MB)
 *
 * Constraints:
 *   - Every spawned `git` process has a 5 s hard timeout (AbortController).
 *   - Stdout is never polluted: git failures throw with stderr included.
 *   - This module is the *only* place the rest of the guard talks to git.
 *
 * Validates: Requirement 9.4 (CI guard ≤ 30 s on ≤ 1000 files relies on
 * the scanner being cheap and bounded; >1MB files are skipped per D7).
 *
 * schema_version: 1.0
 */

const GIT_TIMEOUT_MS = 5_000;
const DEFAULT_FILE_SIZE_LIMIT = 1_048_576; // 1 MB

/** Single added/removed line in a hunk. */
export interface DiffLine {
  /** 1-based line number in the side this line came from
   *  (post-image line for `added`, pre-image line for `removed`). */
  line: number;
  /** Raw line text without the leading `+` / `-` marker. */
  text: string;
}

/** Result of parsing a single file's `git diff --unified=0` output. */
export interface FileHunks {
  added: DiffLine[];
  removed: DiffLine[];
}

/** Thrown when a git invocation fails (non-zero exit, signal, or timeout). */
export class GitInvocationError extends Error {
  constructor(
    public readonly cmd: readonly string[],
    public readonly exitCode: number | null,
    public readonly signal: string | null,
    public readonly stderr: string,
    public readonly timedOut: boolean,
  ) {
    super(
      `git invocation failed (exitCode=${exitCode}, signal=${signal}, ` +
        `timedOut=${timedOut}): ${cmd.join(' ')}\n${stderr}`,
    );
    this.name = 'GitInvocationError';
  }
}

/**
 * Run a git command with a 5 s hard timeout and return raw stdout bytes.
 *
 * Following the async-resource lifecycle rules:
 *   - Use AbortController to signal cancellation.
 *   - Always clearTimeout in finally (regardless of outcome).
 *   - Never let the timer keep the event loop alive.
 *
 * @internal
 */
async function runGit(args: readonly string[], cwd?: string): Promise<Uint8Array> {
  const cmd = ['git', ...args] as const;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, GIT_TIMEOUT_MS);

    const proc = Bun.spawn(cmd as unknown as string[], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      signal: ctrl.signal,
    });

    // Read stdout/stderr concurrently to avoid pipe back-pressure
    // (git diff can emit many MB on large PRs).
    const [stdoutBuf, stderrBuf, exitCode] = await Promise.all([
      readStreamToBuffer(proc.stdout),
      readStreamToText(proc.stderr),
      proc.exited,
    ]);

    if (timedOut) {
      throw new GitInvocationError(cmd, exitCode, 'SIGTERM', stderrBuf, true);
    }
    if (exitCode !== 0) {
      throw new GitInvocationError(cmd, exitCode, null, stderrBuf, false);
    }
    return stdoutBuf;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function readStreamToBuffer(
  stream: ReadableStream<Uint8Array> | undefined | null,
): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function readStreamToText(
  stream: ReadableStream<Uint8Array> | undefined | null,
): Promise<string> {
  const buf = await readStreamToBuffer(stream);
  return new TextDecoder('utf-8').decode(buf);
}

/**
 * List files changed between `<diffBase>` and HEAD.
 *
 * Uses `git diff <base>...HEAD --name-only -z` so paths come back
 * NUL-separated. This is the only safe form for paths that can contain
 * spaces, quotes, or non-ASCII characters (e.g. Chinese filenames).
 *
 * @param diffBase A revision spec resolvable by git (e.g. `origin/main`,
 *                 `HEAD~1`, a sha).
 * @returns Sorted list of changed file paths (POSIX-style separators, as
 *          emitted by git).
 * @throws GitInvocationError when git itself fails (returns non-zero,
 *          times out, or is killed by signal).
 */
export async function getChangedFiles(diffBase: string): Promise<string[]> {
  const stdout = await runGit([
    'diff',
    `${diffBase}...HEAD`,
    '--name-only',
    '-z',
  ]);
  // git -z emits paths separated *and* terminated by NUL (\0). Splitting
  // on \0 leaves a trailing empty entry which we drop. We use TextDecoder
  // explicitly to keep multi-byte sequences (UTF-8) intact.
  const text = new TextDecoder('utf-8').decode(stdout);
  if (text.length === 0) return [];
  return text.split('\0').filter((s) => s.length > 0);
}

/**
 * Parse `git diff --unified=0 <base>...HEAD -- <file>` into added /
 * removed line records.
 *
 * Hunk header format:
 *   @@ -<oldStart>[,<oldCount>] +<newStart>[,<newCount>] @@
 *
 * In each hunk:
 *   - Lines beginning with '-' belong to the pre-image at oldStart++
 *   - Lines beginning with '+' belong to the post-image at newStart++
 *   - With --unified=0 there is no surrounding ' ' context, so we never
 *     advance counters for unchanged lines.
 *
 * Lines beginning with '\\' (e.g. '\\ No newline at end of file') are
 * meta and skipped.
 *
 * @param diffBase Same revspec accepted by getChangedFiles.
 * @param file     Repository-relative path (POSIX-style, as returned by
 *                 getChangedFiles).
 */
export async function getFileHunks(
  diffBase: string,
  file: string,
): Promise<FileHunks> {
  const stdout = await runGit([
    'diff',
    `${diffBase}...HEAD`,
    '--unified=0',
    '--no-color',
    '--',
    file,
  ]);
  const text = new TextDecoder('utf-8').decode(stdout);
  return parseUnifiedDiff(text);
}

const HUNK_HEADER_RE =
  /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified-diff text (single-file output) into added/removed lines.
 * Exported for testing — the public entry is `getFileHunks`.
 */
export function parseUnifiedDiff(text: string): FileHunks {
  const added: DiffLine[] = [];
  const removed: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  // Normalise line endings; preserve empty trailing line by NOT trimming.
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    if (raw.startsWith('@@')) {
      const m = HUNK_HEADER_RE.exec(raw);
      if (!m) {
        // Malformed hunk header — skip this hunk, stay defensive.
        inHunk = false;
        continue;
      }
      oldLine = Number.parseInt(m[1]!, 10);
      newLine = Number.parseInt(m[3]!, 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (raw.length === 0) continue;
    const marker = raw[0];
    const body = raw.slice(1);
    if (marker === '+') {
      added.push({ line: newLine, text: body });
      newLine += 1;
    } else if (marker === '-') {
      removed.push({ line: oldLine, text: body });
      oldLine += 1;
    } else if (marker === '\\') {
      // '\\ No newline at end of file' — informational, skip.
      continue;
    } else if (marker === ' ') {
      // Should not occur with --unified=0, but advance counters defensively.
      oldLine += 1;
      newLine += 1;
    } else {
      // 'diff --git', 'index ', '--- ', '+++ ' headers — skip.
      // Anything else outside a hunk is ignored.
    }
  }
  return { added, removed };
}

/**
 * Read a file as UTF-8 text, or return `null` if the file exceeds
 * `maxBytes` (default 1 MB per design D7) or does not exist.
 *
 * Uses `Bun.file(path).size` to check size before reading so we never
 * pull a 100 MB binary into memory just to discover we should have
 * skipped it.
 *
 * @param filePath  Absolute or repo-relative path readable by Bun.
 * @param maxBytes  Inclusive upper bound on file size in bytes
 *                  (default: 1_048_576 = 1 MB).
 * @returns The file's UTF-8 contents, or null when oversized / missing.
 */
export async function readFileWithSizeLimit(
  filePath: string,
  maxBytes: number = DEFAULT_FILE_SIZE_LIMIT,
): Promise<string | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;
  if (file.size > maxBytes) return null;
  return await file.text();
}
