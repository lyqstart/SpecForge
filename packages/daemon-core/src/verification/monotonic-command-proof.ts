import ts from 'typescript';

export const MONOTONIC_COMMAND_CONTRACT = 'readonly-node-command/v2' as const;
export const MONOTONIC_PROOF_RULE = 'single-file-bounded-monotonic-observation/v1' as const;
const fail = (): never => {
  throw new Error('NODE_COMMAND_UNSUPPORTED:MONOTONIC_PROOF');
};
const assertions = new Set([
  'ok',
  'equal',
  'notEqual',
  'deepEqual',
  'notDeepEqual',
  'strictEqual',
  'notStrictEqual',
  'deepStrictEqual',
  'notDeepStrictEqual',
]);
export interface MonotonicProof {
  identifiers: ReadonlySet<ts.Identifier>;
  builtinCalls: ReadonlySet<ts.CallExpression>;
}

/** A timer must not certify creation of a deferred operation as its synchronous execution. */
export function assertSynchronousTimedSource(file: ts.SourceFile): void {
  function visit(node: ts.Node): void {
    if (
      (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
      ((ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isMethodDeclaration(node)) &&
        node.asteriskToken) ||
      (ts.isIdentifier(node) && node.text === 'fromAsync') ||
      (ts.isStringLiteral(node) &&
        node.text === 'fromAsync' &&
        ((ts.isBindingElement(node.parent) && node.parent.propertyName === node) ||
          (ts.isPropertyAssignment(node.parent) && node.parent.name === node)))
    )
      fail();
    ts.forEachChild(node, visit);
  }
  visit(file);
}

/** Certify a finite interval, never grant a general perf_hooks or host-clock capability. */
export function proveMonotonicInterval(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  eligibleEntry: boolean
): MonotonicProof | undefined {
  let requested = false;
  const scan = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'node:perf_hooks'
    )
      requested = true;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.some(a => ts.isStringLiteral(a) && a.text === 'node:perf_hooks')
    )
      requested = true;
    ts.forEachChild(node, scan);
  };
  scan(file);
  if (!requested) return undefined;
  if (!eligibleEntry) return fail();
  const identifiers = new Set<ts.Identifier>(),
    builtinCalls = new Set<ts.CallExpression>();
  const symbol = (id: ts.Identifier) => checker.getSymbolAtLocation(id);
  const protect = new Map<string, ts.Symbol>();
  function binding(id: ts.Identifier): void {
    const bound = symbol(id);
    if (!bound || protect.has(id.text)) fail();
    protect.set(id.text, bound!);
    identifiers.add(id);
  }
  function reference(id: ts.Expression, declaration: ts.Identifier): id is ts.Identifier {
    if (!ts.isIdentifier(id) || symbol(id) !== symbol(declaration)) return false;
    identifiers.add(id);
    return true;
  }
  function declaration(statement: ts.Statement | undefined): ts.VariableDeclaration {
    if (
      !statement ||
      !ts.isVariableStatement(statement) ||
      statement.modifiers?.length ||
      (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== Number(ts.NodeFlags.Const) ||
      statement.declarationList.declarations.length !== 1
    )
      return fail();
    const d = statement.declarationList.declarations[0];
    if (!d.initializer || d.type || d.exclamationToken) return fail();
    return d;
  }
  function load(d: ts.VariableDeclaration, module: string): ts.CallExpression {
    const call = d.initializer;
    if (
      !call ||
      !ts.isCallExpression(call) ||
      call.questionDotToken ||
      !ts.isIdentifier(call.expression) ||
      call.expression.text !== 'require' ||
      (symbol(call.expression)?.declarations?.length ?? 0) > 0 ||
      call.typeArguments?.length ||
      call.arguments.length !== 1 ||
      !ts.isStringLiteral(call.arguments[0]) ||
      call.arguments[0].text !== module
    )
      return fail();
    builtinCalls.add(call);
    return call;
  }
  function destructured(d: ts.VariableDeclaration, member?: string): ts.Identifier {
    if (!ts.isObjectBindingPattern(d.name) || d.name.elements.length !== 1) return fail();
    const e = d.name.elements[0];
    if (
      !ts.isIdentifier(e.name) ||
      e.propertyName ||
      e.dotDotDotToken ||
      e.initializer ||
      (member && e.name.text !== member)
    )
      return fail();
    return e.name;
  }
  let clock: ts.Identifier | undefined,
    test: ts.Identifier | undefined,
    assert: ts.Identifier | undefined;
  const localFunctions = new Map<ts.Symbol, ts.Identifier>();
  let testCall: ts.CallExpression | undefined;
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      const d = declaration(statement),
        init = d.initializer!;
      if (
        ts.isCallExpression(init) &&
        ts.isIdentifier(init.expression) &&
        init.expression.text === 'require' &&
        init.arguments.length === 1 &&
        ts.isStringLiteral(init.arguments[0])
      ) {
        const module = init.arguments[0].text;
        if (module === 'node:perf_hooks') {
          if (clock) fail();
          load(d, module);
          clock = destructured(d, 'performance');
          binding(clock);
        } else if (module === 'node:test') {
          if (test) fail();
          load(d, module);
          test = destructured(d, 'test');
          binding(test);
        } else if (module === 'node:assert/strict') {
          if (assert || !ts.isIdentifier(d.name)) return fail();
          load(d, module);
          assert = d.name;
          binding(assert);
        } else if (module.startsWith('./') || module.startsWith('../')) {
          const id = destructured(d),
            bound = symbol(id);
          if (!bound) return fail();
          localFunctions.set(bound, id);
        }
      }
    } else if (
      ts.isExpressionStatement(statement) &&
      ts.isCallExpression(statement.expression) &&
      !testCall
    ) {
      testCall = statement.expression;
    } else return fail();
  }
  if (
    !clock ||
    !test ||
    !assert ||
    !testCall ||
    testCall.questionDotToken ||
    !reference(testCall.expression, test) ||
    testCall.typeArguments?.length ||
    testCall.arguments.length !== 2 ||
    !ts.isStringLiteral(testCall.arguments[0])
  )
    return fail();
  const callback = testCall.arguments[1];
  if (
    !ts.isArrowFunction(callback) ||
    callback.parameters.length ||
    callback.modifiers?.length ||
    callback.typeParameters?.length ||
    callback.type ||
    !ts.isBlock(callback.body)
  )
    return fail();
  const statements = callback.body.statements;
  function now(value: ts.Expression | undefined): void {
    if (
      !value ||
      !ts.isCallExpression(value) ||
      value.questionDotToken ||
      value.typeArguments?.length ||
      value.arguments.length ||
      !ts.isPropertyAccessExpression(value.expression) ||
      value.expression.questionDotToken ||
      value.expression.name.text !== 'now' ||
      !reference(value.expression.expression, clock!)
    )
      fail();
  }
  const intervalStarts: number[] = [];
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i];
    if (
      ts.isVariableStatement(s) &&
      s.declarationList.declarations.some(
        d =>
          d.initializer &&
          ts.isCallExpression(d.initializer) &&
          ts.isPropertyAccessExpression(d.initializer.expression) &&
          d.initializer.expression.name.text === 'now'
      )
    )
      intervalStarts.push(i);
  }
  if (intervalStarts.length !== 1) return fail();
  const i = intervalStarts[0];
  const start = declaration(statements[i]),
    result = declaration(statements[i + 1]),
    elapsed = declaration(statements[i + 2]);
  if (
    !ts.isIdentifier(start.name) ||
    !ts.isIdentifier(result.name) ||
    !ts.isIdentifier(elapsed.name)
  )
    return fail();
  binding(start.name);
  binding(elapsed.name);
  now(start.initializer);
  const call = result.initializer!;
  if (
    !ts.isCallExpression(call) ||
    call.questionDotToken ||
    !ts.isIdentifier(call.expression) ||
    call.typeArguments?.length
  )
    return fail();
  const core = localFunctions.get(symbol(call.expression)!);
  if (!core) return fail();
  binding(core);
  reference(call.expression, core);
  const noNestedCalls = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isFunctionLike(node) ||
      ts.isSpreadElement(node)
    )
      fail();
    ts.forEachChild(node, noNestedCalls);
  };
  call.arguments.forEach(noNestedCalls);
  const delta = elapsed.initializer!;
  if (
    !ts.isBinaryExpression(delta) ||
    delta.operatorToken.kind !== ts.SyntaxKind.MinusToken ||
    !reference(delta.right, start.name)
  )
    return fail();
  now(delta.left);
  const check = statements[i + 3];
  if (!check || !ts.isExpressionStatement(check) || !ts.isCallExpression(check.expression))
    return fail();
  const assertion = check.expression;
  if (
    !ts.isPropertyAccessExpression(assertion.expression) ||
    assertion.questionDotToken ||
    assertion.expression.questionDotToken ||
    !reference(assertion.expression.expression, assert) ||
    assertion.expression.name.text !== 'ok' ||
    assertion.typeArguments?.length ||
    assertion.arguments.length !== 1
  )
    return fail();
  const bound = assertion.arguments[0];
  if (
    !ts.isBinaryExpression(bound) ||
    bound.operatorToken.kind !== ts.SyntaxKind.LessThanEqualsToken ||
    !reference(bound.left, elapsed.name) ||
    !ts.isNumericLiteral(bound.right) ||
    !Number.isFinite(Number(bound.right.text)) ||
    Number(bound.right.text) <= 0 ||
    Number(bound.right.text) > 120000
  )
    return fail();
  const validateReferences = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      if (node.text === 'require' && (symbol(node)?.declarations?.length ?? 0) > 0) fail();
      const protectedSymbol = protect.get(node.text);
      if (protectedSymbol && !identifiers.has(node)) {
        const parent = node.parent;
        if (
          symbol(node) !== protectedSymbol ||
          node.text !== assert.text ||
          !ts.isPropertyAccessExpression(parent) ||
          parent.questionDotToken ||
          parent.expression !== node ||
          !assertions.has(parent.name.text) ||
          !ts.isCallExpression(parent.parent) ||
          parent.parent.questionDotToken ||
          parent.parent.expression !== parent ||
          !ts.isExpressionStatement(parent.parent.parent) ||
          parent.parent.parent.parent !== callback.body
        )
          fail();
        identifiers.add(node);
      }
    }
    ts.forEachChild(node, validateReferences);
  };
  validateReferences(file);
  return { identifiers, builtinCalls };
}
