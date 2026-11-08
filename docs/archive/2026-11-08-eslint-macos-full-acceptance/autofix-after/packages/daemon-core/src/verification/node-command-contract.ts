import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
/** Finite Task command grammar and conservative proof for single-file isolation normalization. */
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { readVerificationFile } from './owner-store';
import {
  isStaticTaskDeclaration,
  compileStaticTaskCommand,
  collectStaticTaskInputs,
} from './static-task-command';

export const NODE_COMMAND_CONTRACT = 'readonly-node-command/v1' as const;
export interface FrozenNodeSource {
  path: string;
  content: string;
  sha256: string;
}
export interface NodeCommandPlan {
  contract: typeof NODE_COMMAND_CONTRACT;
  original: string;
  kind: 'node-test-file' | 'node-inline';
  argv: string[];
  entry: string | null;
  inlineSource: string | null;
  semanticProof: {
    rule: 'single-file-no-host-observation/v1' | 'finite-posix-readonly-predicate/v1';
    inputHashes: Record<string, string>;
  };
}

const fail = (reason: string): never => {
  throw new Error(`NODE_COMMAND_UNSUPPORTED:${reason}`);
};
const hash = (text: string): string => createHash('sha256').update(text).digest('hex');
const commonFlags = ['--no-addons', '--preserve-symlinks', '--preserve-symlinks-main'];
const forbiddenNames = new Set([
  'globalThis',
  'global',
  'Date',
  'performance',
  'crypto',
  'Buffer',
  'eval',
  'Function',
  '__dirname',
  '__filename',
  'WeakRef',
  'FinalizationRegistry',
  'Atomics',
  'SharedArrayBuffer',
  'Intl',
  'navigator',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'fetch',
  'WebAssembly',
  'Proxy',
  'Reflect',
  'Object',
]);
const forbiddenProperties = new Set([
  'constructor',
  '__proto__',
  'prototype',
  'getPrototypeOf',
  'setPrototypeOf',
  'getOwnPropertyDescriptor',
  'getOwnPropertyDescriptors',
  'getOwnPropertyNames',
  'getOwnPropertySymbols',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'caller',
  'callee',
  'arguments',
  'stack',
  'random',
  'execArgv',
  'argv',
  'env',
  'pid',
  'ppid',
  'main',
  'parent',
  'children',
  'filename',
  'resolve',
  'cache',
  'timeout',
  'concurrency',
  'skip',
  'only',
  'todo',
  'run',
  'mock',
  'before',
  'after',
  'beforeEach',
  'afterEach',
]);
const pureGlobals = new Set([
  'undefined',
  'NaN',
  'Infinity',
  'String',
  'Number',
  'Boolean',
  'BigInt',
  'Math',
  'JSON',
  'Array',
  'RegExp',
]);
const builtins = new Set(['node:test', 'node:assert/strict']);
const inlineVirtualPath = '__sf_verification_inline.cjs';

/** Quoting groups exact literals. No shell expansion, escaping or command operators are evaluated. */
export function tokenizeNodeDeclaration(command: string): string[] {
  if (!command || command.length > 32768 || /[\x00-\x1f\x7f$`]/.test(command)) fail('DECLARATION');
  const tokens: string[] = [];
  let token = '',
    quote = '',
    started = false,
    closedQuote = false;
  for (const char of command) {
    if (quote) {
      if (char === quote) {
        quote = '';
        closedQuote = true;
      } else token += char;
      started = true;
      continue;
    }
    if (closedQuote && !/\s/.test(char)) fail('CONCATENATED_QUOTING');
    if (char === '"' || char === "'") {
      if (started) fail('CONCATENATED_QUOTING');
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) {
        tokens.push(token);
        token = '';
        started = false;
        closedQuote = false;
      }
    } else {
      if (/[;&|<>`$%\\]/.test(char)) fail('SHELL_SYNTAX');
      token += char;
      started = true;
    }
  }
  if (quote) fail('UNTERMINATED_QUOTE');
  if (started) tokens.push(token);
  return tokens;
}

function sourcePath(value: string): string {
  if (
    !value ||
    value.includes('\\') ||
    value.includes(':') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some(p => !p || p === '..' || p === '.') ||
    !/\.(?:[cm]?js|ts)$/.test(value)
  )
    fail('SOURCE_PATH');
  return value;
}

export function compileNodeCommand(
  original: string,
  sources: readonly FrozenNodeSource[]
): NodeCommandPlan {
  if (isStaticTaskDeclaration(original)) return compileStaticTaskCommand(original, sources);
  const argv = tokenizeNodeDeclaration(original);
  if (argv[0] !== 'node' || argv.length !== 3 || !['--test', '-e'].includes(argv[1]))
    fail('FIXED_NODE_GRAMMAR');
  const kind = argv[1] === '--test' ? 'node-test-file' : 'node-inline';
  const entry = kind === 'node-test-file' ? sourcePath(argv[2]) : null;
  const inlineSource = kind === 'node-inline' ? argv[2] : null;
  const byPath = new Map<string, FrozenNodeSource>();
  for (const source of sources) {
    const key = sourcePath(source.path);
    if (byPath.has(key) || hash(source.content) !== source.sha256) fail('SOURCE_IDENTITY');
    byPath.set(key, source);
  }
  const visited = new Set<string>(),
    inputHashes: Record<string, string> = {};
  function dependency(specifier: string, owner: string): void {
    if (builtins.has(specifier)) return;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail('DEPENDENCY');
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(owner), specifier));
    sourcePath(resolved);
    if (inlineSource !== null && resolved === inlineVirtualPath) fail('INLINE_INPUT_COLLISION');
    inspect(resolved);
  }
  function inspect(name: string, inline?: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const source = inline === undefined ? byPath.get(name) : undefined;
    if (inline === undefined && !source) fail('SOURCE_MISSING:' + name);
    const content = inline ?? source!.content;
    if (source) inputHashes[name] = source.sha256;
    const virtualName = '/__specforge_frozen__/' + name;
    const file = ts.createSourceFile(
      virtualName,
      content,
      ts.ScriptTarget.Latest,
      true,
      name.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
    );
    if (
      (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
        .length
    )
      fail('SOURCE_SYNTAX');
    const options: ts.CompilerOptions = {
      noLib: true,
      noResolve: true,
      allowJs: true,
      target: ts.ScriptTarget.Latest,
    };
    const host: ts.CompilerHost = {
      getSourceFile: fileName => (fileName === virtualName ? file : undefined),
      writeFile: () => {},
      getDefaultLibFileName: () => '/__no_lib__.d.ts',
      getCurrentDirectory: () => '/__specforge_frozen__',
      getDirectories: () => [],
      directoryExists: () => false,
      fileExists: fileName => fileName === virtualName,
      readFile: fileName => (fileName === virtualName ? content : undefined),
      getCanonicalFileName: name => name,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      realpath: name => name,
    };
    const checker = ts.createProgram([virtualName], options, host).getTypeChecker();
    const locallyBound = (node: ts.Identifier): boolean =>
      (
        (ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node)
        )?.declarations ?? []
      ).some(
        d =>
          d.getSourceFile() === file &&
          (ts.isVariableDeclaration(d) ||
            ts.isBindingElement(d) ||
            ts.isParameter(d) ||
            ts.isFunctionDeclaration(d) ||
            ts.isFunctionExpression(d) ||
            ts.isImportClause(d) ||
            ts.isImportSpecifier(d) ||
            ts.isNamespaceImport(d))
      );
    function visit(node: ts.Node): void {
      if (
        [
          ts.SyntaxKind.MetaProperty,
          ts.SyntaxKind.ElementAccessExpression,
          ts.SyntaxKind.NewExpression,
          ts.SyntaxKind.ThisKeyword,
          ts.SyntaxKind.SuperKeyword,
          ts.SyntaxKind.WithStatement,
          ts.SyntaxKind.AwaitExpression,
          ts.SyntaxKind.YieldExpression,
          ts.SyntaxKind.ClassDeclaration,
          ts.SyntaxKind.ClassExpression,
          ts.SyntaxKind.EnumDeclaration,
          ts.SyntaxKind.ModuleDeclaration,
          ts.SyntaxKind.AsyncKeyword,
          ts.SyntaxKind.ImportEqualsDeclaration,
          ts.SyntaxKind.ComputedPropertyName,
          ts.SyntaxKind.DeclareKeyword,
        ].includes(node.kind)
      )
        fail('HOST_OBSERVATION_OR_UNSUPPORTED_SYNTAX');
      if (
        (ts.isImportClause(node) && node.isTypeOnly) ||
        (ts.isImportSpecifier(node) && node.isTypeOnly)
      )
        fail('TYPE_ONLY_RUNTIME_BINDING');
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        if (specifier) {
          if (!ts.isStringLiteral(specifier)) fail('DYNAMIC_MODULE');
          dependency((specifier as ts.StringLiteral).text, name);
        }
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          node.moduleSpecifier.text === 'node:test'
        ) {
          const bindings = node.importClause?.namedBindings;
          if (
            bindings &&
            (!ts.isNamedImports(bindings) ||
              bindings.elements.some(e => (e.propertyName ?? e.name).text !== 'test'))
          )
            fail('TEST_HOOK_OR_CONTEXT');
        }
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]))
          fail('DYNAMIC_MODULE');
        dependency((node.arguments[0] as ts.StringLiteral).text, name);
      }
      if (ts.isPropertyAccessExpression(node)) {
        if (forbiddenProperties.has(node.name.text)) fail('OBSERVABLE_PROPERTY:' + node.name.text);
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'process' &&
          (inline === undefined || node.name.text !== 'exit')
        )
          fail('PROCESS_OBSERVATION');
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'console' &&
          (inline === undefined || node.name.text !== 'log')
        )
          fail('CONSOLE_OBSERVATION');
      }
      if (
        ts.isPropertyAssignment(node) &&
        ts.isStringLiteral(node.name) &&
        forbiddenProperties.has(node.name.text)
      )
        fail('OBSERVABLE_OPTION');
      if (ts.isIdentifier(node)) {
        if (forbiddenNames.has(node.text) || forbiddenProperties.has(node.text))
          fail('HOST_GLOBAL_OR_PROPERTY:' + node.text);
        const parent = node.parent;
        const property =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent)) &&
            parent.name === node) ||
          ts.isImportSpecifier(parent) ||
          ts.isExportSpecifier(parent);
        const calledMember =
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === node &&
          ts.isCallExpression(parent.parent) &&
          parent.parent.expression === parent;
        const special =
          (node.text === 'require' && ts.isCallExpression(parent) && parent.expression === node) ||
          (/\.cjs$/.test(name) &&
            ts.isPropertyAccessExpression(parent) &&
            parent.expression === node &&
            ((node.text === 'module' && parent.name.text === 'exports') ||
              node.text === 'exports')) ||
          (inline !== undefined &&
            calledMember &&
            ((node.text === 'process' && parent.name.text === 'exit') ||
              (node.text === 'console' && parent.name.text === 'log')));
        if (
          !property &&
          !special &&
          ['process', 'console', 'require', 'module', 'exports'].includes(node.text)
        )
          fail('HOST_IDENTIFIER_ALIAS:' + node.text);
        if (!property && !special && !locallyBound(node) && !pureGlobals.has(node.text))
          fail('UNBOUND_OR_HOST_IDENTIFIER:' + node.text);
      }
      if (
        ts.isBindingElement(node) &&
        node.propertyName &&
        ts.isStringLiteral(node.propertyName) &&
        forbiddenProperties.has(node.propertyName.text)
      )
        fail('DESTRUCTURED_HOST_PROPERTY');
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  if (entry) inspect(entry);
  else inspect(inlineVirtualPath, inlineSource!);
  return {
    contract: NODE_COMMAND_CONTRACT,
    original,
    kind,
    entry,
    inlineSource,
    argv:
      kind === 'node-test-file'
        ? [...commonFlags, '--test-reporter=tap', '--test', '--test-isolation=none', entry!]
        : [...commonFlags, '-e', inlineSource!],
    semanticProof: { rule: 'single-file-no-host-observation/v1', inputHashes },
  };
}

/** Discover only literal local code imports and required package metadata, never all project contents. */
export async function collectNodeCommandInputs(
  projectRoot: string,
  original: string,
  trackedPaths: readonly string[]
): Promise<{
  sources: FrozenNodeSource[];
  inputPaths: string[];
}> {
  if (isStaticTaskDeclaration(original))
    return collectStaticTaskInputs(projectRoot, original, trackedPaths);
  const args = tokenizeNodeDeclaration(original),
    tracked = new Set(trackedPaths),
    found = new Map<string, FrozenNodeSource>();
  const metadata = new Set<string>();
  if (args.length !== 3 || args[0] !== 'node' || !['--test', '-e'].includes(args[1]))
    fail('FIXED_NODE_GRAMMAR');
  async function inspect(name: string, inline?: string): Promise<void> {
    if (found.has(name)) return;
    let text = inline;
    if (inline === undefined) {
      sourcePath(name);
      if (
        name
          .split('/')
          .some(p => ['.git', SPEC_DIR_NAME, 'node_modules'].includes(p.toLowerCase())) ||
        !tracked.has(name)
      )
        fail('INPUT_NOT_TRACKED_CODE');
      const raw = await readVerificationFile(path.join(projectRoot, name));
      text = raw.toString('utf8');
      if (!Buffer.from(text).equals(raw)) fail('SOURCE_ENCODING');
      found.set(name, { path: name, content: text, sha256: hash(text) });
      if (found.size > 2048) fail('INPUT_COUNT');
    }
    for (let directory = path.posix.dirname(name); ; directory = path.posix.dirname(directory)) {
      const pkg = path.posix.join(directory, 'package.json');
      if (tracked.has(pkg)) metadata.add(pkg);
      if (directory === '.') break;
    }
    const file = ts.createSourceFile(
      name,
      text!,
      ts.ScriptTarget.Latest,
      true,
      name.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS
    );
    const dependencies: string[] = [];
    function scan(node: ts.Node): void {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) fail('DYNAMIC_MODULE');
        dependencies.push((node.moduleSpecifier as ts.StringLiteral).text);
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0]))
          fail('DYNAMIC_MODULE');
        dependencies.push((node.arguments[0] as ts.StringLiteral).text);
      }
      ts.forEachChild(node, scan);
    }
    scan(file);
    for (const specifier of dependencies) {
      if (builtins.has(specifier)) continue;
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) fail('DEPENDENCY');
      const resolved = sourcePath(
        path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier))
      );
      if (args[1] === '-e' && resolved === inlineVirtualPath) fail('INLINE_INPUT_COLLISION');
      await inspect(resolved);
    }
  }
  if (args[1] === '--test') await inspect(sourcePath(args[2]));
  else await inspect(inlineVirtualPath, args[2]);
  return {
    sources: [...found.values()],
    inputPaths: [...new Set([...found.keys(), ...metadata])].sort(),
  };
}
