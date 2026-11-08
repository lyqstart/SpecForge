import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
/** Finite readonly predicates, normalized to the existing isolated Node inline backend. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { assertVerificationRelativePath } from './source-snapshot';
import { readVerificationFile } from './owner-store';
import type { FrozenNodeSource, NodeCommandPlan } from './node-command-contract';

export const STATIC_TASK_RULE = 'finite-posix-readonly-predicate/v1' as const;
type Declaration =
  | { kind: 'files'; paths: string[] }
  | {
      kind: 'grep';
      paths: [string];
      pattern: string;
      quiet: boolean;
      negate: boolean;
      extended: boolean;
    };
function fail(code: string): never {
  throw Error('NODE_COMMAND_UNSUPPORTED:STATIC_' + code);
}
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const flags = ['--no-addons', '--preserve-symlinks', '--preserve-symlinks-main'];
export const isStaticTaskDeclaration = (value: string) => /^(?:test|grep|!)\s/.test(value);
function relative(value: string): string {
  assertVerificationRelativePath(value);
  if (
    !/^[A-Za-z0-9_.\-/]+$/.test(value) ||
    value.split('/').some(p => ['.git', SPEC_DIR_NAME, 'node_modules'].includes(p.toLowerCase())) ||
    !/(?:\.md|\.json|\.[cm]?js|\.ts)$/.test(value)
  )
    fail('PATH');
  return value;
}
export function parseStaticTaskDeclaration(command: string): Declaration {
  if (!command || command.length > 32768 || /[\x00-\x1f\x7f`]/.test(command)) fail('DECLARATION');
  if (command.startsWith('test ')) {
    const pieces = command.split(' && ');
    if (pieces.length > 64) fail('FILE_COUNT');
    const paths = pieces.map(piece => {
      const m = /^test -f ([A-Za-z0-9_.\-/]+)$/.exec(piece);
      if (!m) fail('FILE_GRAMMAR');
      return relative(m[1]);
    });
    return { kind: 'files', paths };
  }
  const match = /^(! )?grep -(cE|qE|c|q) (['"])(.*?)\3 ([A-Za-z0-9_.\-/]+)$/.exec(command);
  if (!match || (match[1] && !match[2].startsWith('q'))) fail('GREP_GRAMMAR');
  const pattern = match[4];
  if (
    !pattern ||
    pattern.length > 1024 ||
    /[^\x20-\x7e]/.test(pattern) ||
    pattern.includes(match[3])
  )
    fail('PATTERN');
  // Double quoted shell variables/substitution cannot be reproduced as fixed literals.
  if (
    match[3] === '"' &&
    (/\$(?!$)|\\[^(){}|.*^$\\]/.test(pattern) ||
      pattern.includes('\\\\') ||
      pattern.includes('\\$'))
  )
    fail('QUOTED_EXPANSION');
  return {
    kind: 'grep',
    paths: [relative(match[5])],
    pattern,
    quiet: match[2].startsWith('q'),
    negate: !!match[1],
    extended: match[2].endsWith('E'),
  };
}
function finiteRegex(pattern: string, extended: boolean): string {
  let output = '',
    alternative = false;
  const literal = (char: string) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      const next = pattern[++i];
      if (!next || !extended || !'(){}|.*^$\\[]'.includes(next)) fail('ESCAPE');
      output += literal(next);
      alternative = true;
    } else if (c === '|' && extended) {
      if (!alternative) fail('EMPTY_ALTERNATIVE');
      output += '|';
      alternative = false;
    } else if (c === '^') {
      if (alternative) fail('ANCHOR');
      output += '^';
    } else if (c === '$') {
      if (i !== pattern.length - 1 && !(extended && pattern[i + 1] === '|')) fail('ANCHOR');
      output += '(?![\\s\\S])';
    } else if (c === '*') {
      fail('REPETITION');
    } else if (c === '.') {
      output += '[\\s\\S]';
      alternative = true;
    } else {
      if ('[]'.includes(c) || (extended && '()+?{}'.includes(c))) fail('REGEX_SYNTAX');
      output += literal(c);
      alternative = true;
    }
  }
  if (!alternative) fail('EMPTY_ALTERNATIVE');
  return output;
}
function countLines(text: string, pattern: string, unicode: boolean): number {
  if (text === '') return 0;
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const regex = new RegExp(pattern, unicode ? 'u' : '');
  return lines.reduce((count, line) => count + (regex.test(line) ? 1 : 0), 0);
}
export async function collectStaticTaskInputs(
  root: string,
  command: string,
  trackedPaths: readonly string[]
): Promise<{ sources: FrozenNodeSource[]; inputPaths: string[] }> {
  const declaration = parseStaticTaskDeclaration(command),
    inputPaths = [...new Set(declaration.paths)].sort(),
    tracked = new Set(trackedPaths),
    sources: FrozenNodeSource[] = [];
  for (const name of inputPaths) {
    if (!tracked.has(name)) fail('INPUT_NOT_TRACKED');
    const raw = await readVerificationFile(path.join(root, name), 32768),
      content = raw.toString('utf8');
    if (!Buffer.from(content).equals(raw) || raw.includes(0)) fail('ENCODING');
    sources.push({ path: name, content, sha256: sha(content) });
  }
  return { sources, inputPaths };
}
export function compileStaticTaskCommand(
  original: string,
  sources: readonly FrozenNodeSource[]
): NodeCommandPlan {
  const declaration = parseStaticTaskDeclaration(original),
    paths = [...new Set(declaration.paths)].sort(),
    byPath = new Map(sources.map(s => [s.path, s]));
  if (
    byPath.size !== sources.length ||
    JSON.stringify([...byPath.keys()].sort()) !== JSON.stringify(paths)
  )
    fail('INPUT_SET');
  const inputHashes: Record<string, string> = {};
  for (const name of paths) {
    const source = byPath.get(name)!;
    if (
      source.sha256 !== sha(source.content) ||
      Buffer.byteLength(source.content) > 32768 ||
      source.content.includes('\0')
    )
      fail('SOURCE_IDENTITY');
    inputHashes[name] = source.sha256;
  }
  let inlineSource: string;
  if (declaration.kind === 'files') {
    // The complete native input-copy precondition proves every selected ordinary file exists.
    inlineSource = 'process.exit(0);';
  } else {
    const source = byPath.get(declaration.paths[0])!,
      pattern = finiteRegex(declaration.pattern, declaration.extended);
    const bytes = Buffer.from(source.content, 'utf8').toString('latin1');
    // Byte-oriented C matching and Unicode scalar matching must give identical evidence on these actual inputs.
    if (countLines(bytes, pattern, false) !== countLines(source.content, pattern, true))
      fail('LOCALE_AMBIGUITY');
    inlineSource =
      `const text=${JSON.stringify(bytes)};const lines=text===""?[]:text.split("\\n");if(lines.length&&lines[lines.length-1]==="")lines.pop();const regex=RegExp(${JSON.stringify(pattern)});let count=0;for(const line of lines){if(regex.test(line))count++;}` +
      (declaration.quiet ? '' : 'console.log(String(count));') +
      `process.exit(${declaration.negate ? 'count===0?0:1' : 'count>0?0:1'});`;
  }
  if (inlineSource.length > 32768 || Buffer.byteLength(inlineSource) > 32768) fail('INLINE_BUDGET');
  return {
    contract: 'readonly-node-command/v1',
    original,
    kind: 'node-inline',
    argv: [...flags, '-e', inlineSource],
    entry: null,
    inlineSource,
    semanticProof: { rule: STATIC_TASK_RULE, inputHashes },
  };
}
