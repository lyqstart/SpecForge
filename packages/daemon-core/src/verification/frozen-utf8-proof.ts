/** D27: a closed inline grammar; data edges never enter the JavaScript source parser. */
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { SPEC_DIR_NAME } from '@specforge/types/directory-layout';
import { assertVerificationRelativePath } from './source-snapshot';
import type { FrozenNodeSource, NodeCommandPlan } from './node-command-contract';

export const UTF8_COMMAND_CONTRACT = 'readonly-node-command/v4' as const;
export const UTF8_PROOF_RULE = 'single-process-frozen-utf8-read/v1' as const;
const fail = (): never => {
  throw Error('NODE_COMMAND_UNSUPPORTED:FROZEN_UTF8_PROOF');
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const reserved = new Set([
  'require',
  'console',
  'process',
  'global',
  'globalThis',
  'eval',
  'Function',
  'undefined',
  'arguments',
]);

export function assertFrozenDataPath(name: string): void {
  assertVerificationRelativePath(name);
  const parts = name.toLowerCase().split('/');
  if (
    name.length > 1024 ||
    parts.length > 64 ||
    parts.some(p =>
      ['.git', SPEC_DIR_NAME, 'node_modules', '.aws', '.ssh', '.config', '.opencode'].includes(p)
    ) ||
    /^(?:\.env(?:\..*)?|auth\.json|credentials\.json|host-profile\.json|opencode\.jsonc?)$/.test(
      parts[parts.length - 1]
    )
  )
    fail();
}

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(
    'frozen-inline.js',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
}

/** Routing only; acceptance still requires the entire closed proof below. */
export function hasFrozenUtf8Dependency(source: string): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.some(a => ts.isStringLiteral(a) && ['fs', 'node:fs'].includes(a.text))
    )
      found = true;
    ts.forEachChild(node, visit);
  }
  visit(parse(source));
  return found;
}

export function proveFrozenUtf8(source: string, approvedPaths: readonly string[]): string[] {
  const file = parse(source);
  if (
    (file as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics.length
  )
    fail();
  const approved = new Set(approvedPaths),
    paths = new Set<string>(),
    names = new Set<string>();
  type Value = 'string' | 'boolean' | 'fs';
  type Scope = Map<string, Value>;
  function bind(node: ts.BindingName, value: Value, scope: Scope): void {
    if (!ts.isIdentifier(node) || reserved.has(node.text) || names.has(node.text)) fail();
    const name = (node as ts.Identifier).text;
    names.add(name);
    scope.set(name, value);
  }
  function member(node: ts.CallExpression): ts.PropertyAccessExpression {
    if (
      !ts.isPropertyAccessExpression(node.expression) ||
      node.questionDotToken ||
      node.expression.questionDotToken ||
      node.typeArguments
    )
      fail();
    return node.expression as ts.PropertyAccessExpression;
  }
  function expression(node: ts.Expression, scope: Scope): Value {
    if (ts.isStringLiteral(node)) return 'string';
    if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword)
      return 'boolean';
    if (ts.isParenthesizedExpression(node)) return expression(node.expression, scope);
    if (ts.isIdentifier(node) && scope.get(node.text) === 'string') return 'string';
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.ExclamationToken &&
      expression(node.operand, scope) === 'boolean'
    )
      return 'boolean';
    if (ts.isBinaryExpression(node)) {
      const left = expression(node.left, scope),
        right = expression(node.right, scope);
      if (
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        left === 'string' &&
        right === 'string'
      )
        return 'string';
      if (
        [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
          node.operatorToken.kind
        ) &&
        left === 'boolean' &&
        right === 'boolean'
      )
        return 'boolean';
      return fail();
    }
    if (ts.isCallExpression(node)) {
      const property = member(node);
      if (
        property.name.text === 'includes' &&
        node.arguments.length === 1 &&
        expression(property.expression, scope) === 'string' &&
        expression(node.arguments[0], scope) === 'string'
      )
        return 'boolean';
    }
    return fail();
  }
  function statement(node: ts.Statement, scope: Scope, top: boolean): void {
    if (ts.isEmptyStatement(node)) return;
    if (ts.isBlock(node)) {
      const inner = new Map(scope);
      for (const child of node.statements) statement(child, inner, false);
      return;
    }
    if (ts.isVariableStatement(node)) {
      if (
        node.modifiers?.length ||
        (node.declarationList.flags & ts.NodeFlags.BlockScoped) !== Number(ts.NodeFlags.Const)
      )
        fail();
      for (const declaration of node.declarationList.declarations) {
        const value = declaration.initializer;
        if (!value || declaration.type || declaration.exclamationToken) fail();
        const init = value!;
        if (
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          init.expression.text === 'require'
        ) {
          if (
            !top ||
            init.questionDotToken ||
            init.typeArguments ||
            init.arguments.length !== 1 ||
            !ts.isStringLiteral(init.arguments[0]) ||
            !['fs', 'node:fs'].includes(init.arguments[0].text)
          )
            fail();
          bind(declaration.name, 'fs', scope);
        } else if (
          ts.isCallExpression(init) &&
          ts.isPropertyAccessExpression(init.expression) &&
          init.expression.name.text === 'readFileSync'
        ) {
          const property = member(init),
            args = init.arguments;
          if (
            !ts.isIdentifier(property.expression) ||
            scope.get(property.expression.text) !== 'fs' ||
            args.length !== 2 ||
            !ts.isStringLiteral(args[0]) ||
            !ts.isStringLiteral(args[1]) ||
            args[1].text !== 'utf8'
          )
            fail();
          const name = (args[0] as ts.StringLiteral).text;
          assertFrozenDataPath(name);
          if (!approved.has(name)) fail();
          paths.add(name);
          bind(declaration.name, 'string', scope);
        } else {
          if (expression(init, scope) !== 'string') fail();
          bind(declaration.name, 'string', scope);
        }
      }
      return;
    }
    if (ts.isForOfStatement(node)) {
      if (
        node.awaitModifier ||
        !ts.isVariableDeclarationList(node.initializer) ||
        (node.initializer.flags & ts.NodeFlags.BlockScoped) !== Number(ts.NodeFlags.Const) ||
        node.initializer.declarations.length !== 1 ||
        !ts.isArrayLiteralExpression(node.expression) ||
        node.expression.elements.length > 2048 ||
        !node.expression.elements.every(ts.isStringLiteral)
      )
        fail();
      const declaration = (node.initializer as ts.VariableDeclarationList).declarations[0];
      if (declaration.initializer || declaration.type || declaration.exclamationToken) fail();
      const inner = new Map(scope);
      bind(declaration.name, 'string', inner);
      statement(node.statement, inner, false);
      return;
    }
    if (ts.isIfStatement(node)) {
      if (expression(node.expression, scope) !== 'boolean') fail();
      statement(node.thenStatement, new Map(scope), false);
      if (node.elseStatement) statement(node.elseStatement, new Map(scope), false);
      return;
    }
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression,
        property = member(call);
      if (!ts.isIdentifier(property.expression)) fail();
      const owner = (property.expression as ts.Identifier).text;
      if (
        owner === 'console' &&
        ['log', 'error'].includes(property.name.text) &&
        call.arguments.length > 0 &&
        call.arguments.every(a => expression(a, scope) === 'string')
      )
        return;
      if (
        owner === 'process' &&
        property.name.text === 'exit' &&
        call.arguments.length === 1 &&
        ts.isNumericLiteral(call.arguments[0])
      ) {
        const code = Number(call.arguments[0].text);
        if (Number.isInteger(code) && code >= 0 && code <= 255) return;
      }
    }
    fail();
  }
  const scope: Scope = new Map();
  for (const node of file.statements) statement(node, scope, true);
  if (!paths.size || paths.size > 2048) fail();
  return [...paths].sort();
}

export function compileFrozenUtf8(
  original: string,
  source: string,
  sources: readonly FrozenNodeSource[],
  approved: readonly string[]
): NodeCommandPlan {
  const paths = proveFrozenUtf8(source, approved),
    byPath = new Map(sources.map(s => [s.path, s]));
  if (sources.length !== paths.length || byPath.size !== sources.length) fail();
  let bytes = 0;
  const inputHashes: Record<string, string> = {};
  for (const name of paths) {
    const data = byPath.get(name);
    if (
      !data ||
      Buffer.from(data.content).toString('utf8') !== data.content ||
      hash(data.content) !== data.sha256
    )
      fail();
    bytes += Buffer.byteLength(data!.content);
    Object.defineProperty(inputHashes, name, { value: data!.sha256, enumerable: true });
  }
  if (bytes > 16 * 1024 * 1024) fail();
  return {
    contract: UTF8_COMMAND_CONTRACT,
    original,
    kind: 'node-inline',
    entry: null,
    inlineSource: source,
    argv: ['--no-addons', '--preserve-symlinks', '--preserve-symlinks-main', '-e', source],
    semanticProof: { rule: UTF8_PROOF_RULE, inputHashes },
  };
}
