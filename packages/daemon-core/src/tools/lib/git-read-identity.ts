/** Read fresh fields through the caller's existing bounded, audited Git runner. */
export async function readGitIdentity(
  read: (args: string[]) => Promise<string>,
  assertDirectories: (top: string, common: string) => void,
  verifyHead = false
): Promise<{ top: string; common: string; head: string }> {
  const headArgs = verifyHead ? ['--verify', 'HEAD'] : ['HEAD'];
  const output = await read(['rev-parse', '--show-toplevel', '--git-common-dir']);
  const fields = output.trim().split(/\r?\n/);
  // A POSIX directory can contain a newline. Preserve legacy path semantics
  // rather than treating an ambiguous line-oriented response as an identity.
  const top =
    fields.length === 2 ? fields[0].trim() : (await read(['rev-parse', '--show-toplevel'])).trim();
  const common =
    fields.length === 2 ? fields[1].trim() : (await read(['rev-parse', '--git-common-dir'])).trim();
  // The owner's physical repository boundary must pass BEFORE reading HEAD.
  assertDirectories(top, common);
  const head = (await read(['rev-parse', ...headArgs])).trim();
  return { top, common, head };
}
