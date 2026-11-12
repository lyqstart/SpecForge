import ts from 'typescript';
import path from 'node:path';

export const FINITE_COMMAND_CONTRACT = 'readonly-node-command/v3' as const;
export const FINITE_PROOF_RULE = 'single-file-finite-local-keys/v1' as const;
type Source = { path: string; content: string };
type Unit = { file: ts.SourceFile; checker: ts.TypeChecker; nodes: ts.Node[] };
type Shape = { depth: number; record?: ts.Symbol };
function reject(): never {
  throw new Error('NODE_COMMAND_FINITE_SOURCE_UNPROVEN');
}
const plainCall = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) && !n.questionDotToken;
const constant = (d: ts.VariableDeclaration): boolean =>
  ts.isVariableDeclarationList(d.parent) && !!(d.parent.flags & ts.NodeFlags.Const);

/** A closed source-only proof. It never evaluates, imports or rewrites application code. */
export function proveFiniteSource(
  sources: readonly Source[],
  entry: string,
  forbidden: ReadonlySet<string>
): Map<string, Set<number>> | null {
  const units = new Map<string, Unit>();
  let needed = false;
  for (const source of sources) {
    const file = ts.createSourceFile(
      source.path,
      source.content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS
    );
    const nodes: ts.Node[] = [];
    function collect(n: ts.Node): void {
      nodes.push(n);
      ts.forEachChild(n, collect);
    }
    collect(file);
    const host: ts.CompilerHost = {
      getSourceFile: n => (n === source.path ? file : undefined),
      writeFile: () => {},
      getDefaultLibFileName: () => '',
      getCurrentDirectory: () => '',
      getDirectories: () => [],
      fileExists: n => n === source.path,
      readFile: n => (n === source.path ? source.content : undefined),
      getCanonicalFileName: n => n,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    };
    let checker: ts.TypeChecker | undefined;
    units.set(source.path, {
      file,
      nodes,
      get checker() {
        return (checker ??= ts
          .createProgram(
            [source.path],
            { noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.Latest },
            host
          )
          .getTypeChecker());
      },
    });
  }
  const reachable = new Set<string>();
  function reach(name: string): void {
    if (reachable.has(name)) return;
    reachable.add(name);
    const u = units.get(name);
    if (!u) return;
    for (const n of u.nodes) {
      if (ts.isElementAccessExpression(n) || (ts.isIdentifier(n) && n.text === 'Object'))
        needed = true;
      let specifier: string | null = null;
      if (
        ts.isCallExpression(n) &&
        (n.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(n.expression) && n.expression.text === 'require')) &&
        n.arguments.length === 1 &&
        ts.isStringLiteral(n.arguments[0])
      )
        specifier = n.arguments[0].text;
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier &&
        ts.isStringLiteral(n.moduleSpecifier)
      )
        specifier = n.moduleSpecifier.text;
      if (specifier?.startsWith('./') || specifier?.startsWith('../'))
        reach(path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier)));
    }
  }
  reach(entry);
  if (!needed) return null;
  for (const name of units.keys()) if (!reachable.has(name)) units.delete(name);
  if (!entry.endsWith('.cjs') || !units.has(entry)) reject();
  const permissions = new Map<string, Set<number>>();
  const records = new Map<ts.Symbol, Set<string>>();
  const pending = new Set<ts.Symbol>();
  const arrays = new Map<ts.Symbol, Shape>();
  const at = (u: Unit, n: ts.Identifier): ts.Symbol => u.checker.getSymbolAtLocation(n) ?? reject();
  const declaration = (s: ts.Symbol): ts.Declaration =>
    s.declarations?.length === 1 ? s.declarations[0] : reject();
  const refs = (u: Unit, s: ts.Symbol): ts.Identifier[] =>
    u.nodes.filter(
      (n): n is ts.Identifier =>
        ts.isIdentifier(n) &&
        (ts.isShorthandPropertyAssignment(n.parent)
          ? u.checker.getShorthandAssignmentValueSymbol(n.parent)
          : u.checker.getSymbolAtLocation(n)) === s
    );
  const isName = (n: ts.Identifier): boolean =>
    (ts.isVariableDeclaration(n.parent) ||
      ts.isParameter(n.parent) ||
      ts.isFunctionDeclaration(n.parent) ||
      ts.isBindingElement(n.parent)) &&
    n.parent.name === n;
  function readPosition(n: ts.Node): boolean {
    for (let child = n, p = n.parent; p; child = p, p = p.parent) {
      if (
        ts.isBinaryExpression(p) &&
        p.left === child &&
        p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        p.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      )
        return false;
      if ((ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === child)
        return false;
      if (
        ts.isDeleteExpression(p) ||
        ts.isPostfixUnaryExpression(p) ||
        (ts.isPrefixUnaryExpression(p) &&
          [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(p.operator))
      )
        return false;
      if (ts.isStatement(p) || ts.isFunctionLike(p)) break;
    }
    return true;
  }
  function numeric(u: Unit, n: ts.Expression): boolean {
    if (ts.isNumericLiteral(n)) return Number.isSafeInteger(Number(n.text)) && Number(n.text) >= 0;
    if (!ts.isIdentifier(n)) return false;
    const s = at(u, n),
      d = declaration(s);
    if (
      !ts.isVariableDeclaration(d) ||
      !d.initializer ||
      !ts.isNumericLiteral(d.initializer) ||
      !numeric(u, d.initializer) ||
      !ts.isVariableDeclarationList(d.parent) ||
      !(d.parent.flags & ts.NodeFlags.Let) ||
      d.parent.declarations.length !== 1 ||
      !ts.isForStatement(d.parent.parent)
    )
      return false;
    const loop = d.parent.parent,
      inc = loop.incrementor;
    if (
      !inc ||
      !ts.isPostfixUnaryExpression(inc) ||
      inc.operator !== ts.SyntaxKind.PlusPlusToken ||
      !ts.isIdentifier(inc.operand) ||
      at(u, inc.operand) !== s
    )
      return false;
    return refs(u, s).every(r => isName(r) || r === inc.operand || readPosition(r));
  }
  function assertion(u: Unit, call: ts.CallExpression): boolean {
    if (
      !plainCall(call) ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.questionDotToken ||
      !ts.isIdentifier(call.expression.expression)
    )
      return false;
    if (
      ![
        'ok',
        'strictEqual',
        'notStrictEqual',
        'deepEqual',
        'deepStrictEqual',
        'notDeepEqual',
        'notDeepStrictEqual',
        'equal',
        'notEqual',
      ].includes(call.expression.name.text)
    )
      return false;
    const d = declaration(at(u, call.expression.expression));
    return (
      ts.isVariableDeclaration(d) &&
      constant(d) &&
      !!d.initializer &&
      requireOf(d.initializer) === 'node:assert/strict'
    );
  }
  function requireOf(n: ts.Expression): string | null {
    return plainCall(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'require' &&
      n.arguments.length === 1 &&
      ts.isStringLiteral(n.arguments[0])
      ? n.arguments[0].text
      : null;
  }
  function record(u: Unit, n: ts.Identifier): ts.Symbol {
    const s = at(u, n);
    if (records.has(s)) return s;
    if (pending.has(s)) reject();
    pending.add(s);
    const d = declaration(s);
    if (!ts.isVariableDeclaration(d) || !constant(d) || !d.initializer) reject();
    let literal: ts.ObjectLiteralExpression;
    const dep = requireOf(d.initializer);
    if (dep !== null) {
      if (!dep.startsWith('./') && !dep.startsWith('../')) reject();
      const name = path.posix.normalize(path.posix.join(path.posix.dirname(u.file.fileName), dep));
      const imported = units.get(name);
      if (!imported || !name.endsWith('.cjs')) reject();
      const moduleRefs = imported.nodes.filter(
        (x): x is ts.Identifier =>
          ts.isIdentifier(x) && ['module', 'exports', 'require'].includes(x.text)
      );
      // No alternate exports, module aliases, re-exports or a hidden require graph in the record owner.
      if (moduleRefs.length !== 2) reject();
      const exportNodes = imported.file.statements.filter(
        st =>
          ts.isExpressionStatement(st) &&
          ts.isBinaryExpression(st.expression) &&
          ts.isPropertyAccessExpression(st.expression.left) &&
          ts.isIdentifier(st.expression.left.expression) &&
          st.expression.left.expression.text === 'module' &&
          st.expression.left.name.text === 'exports'
      );
      if (exportNodes.length !== 1) reject();
      const assignment = (exportNodes[0] as ts.ExpressionStatement)
        .expression as ts.BinaryExpression;
      if (
        assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
        !ts.isObjectLiteralExpression(assignment.right)
      )
        reject();
      literal = assignment.right;
      // The JS checker synthesizes a CommonJS export symbol. The exact reference
      // census above excludes a separate local module/exports declaration or use.
    } else {
      if (!ts.isObjectLiteralExpression(d.initializer)) reject();
      literal = d.initializer;
    }
    const keys = new Set<string>();
    for (const p of literal.properties) {
      if (!ts.isShorthandPropertyAssignment(p) && !ts.isPropertyAssignment(p)) reject();
      if (!ts.isIdentifier(p.name) && !ts.isStringLiteral(p.name)) reject();
      const key = p.name.text;
      if (forbidden.has(key) || keys.has(key)) reject();
      keys.add(key);
    }
    for (const r of refs(u, s)) {
      if (isName(r)) continue;
      const p = r.parent;
      if (
        ts.isPropertyAccessExpression(p) &&
        p.expression === r &&
        keys.has(p.name.text) &&
        !p.questionDotToken &&
        plainCall(p.parent) &&
        p.parent.expression === p
      )
        continue;
      if (
        ts.isElementAccessExpression(p) &&
        p.expression === r &&
        readPosition(p) &&
        ts.isTypeOfExpression(p.parent)
      )
        continue;
      if (
        plainCall(p) &&
        p.arguments.length === 1 &&
        p.arguments[0] === r &&
        ts.isPropertyAccessExpression(p.expression) &&
        ts.isIdentifier(p.expression.expression) &&
        p.expression.expression.text === 'Object' &&
        p.expression.name.text === 'keys'
      )
        continue;
      reject();
    }
    records.set(s, keys);
    pending.delete(s);
    return s;
  }
  function keysCall(u: Unit, n: ts.Expression): ts.Symbol | null {
    if (
      plainCall(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'sort' &&
      n.arguments.length === 0 &&
      !n.expression.questionDotToken
    )
      return keysCall(u, n.expression.expression);
    if (
      !plainCall(n) ||
      !ts.isPropertyAccessExpression(n.expression) ||
      n.expression.questionDotToken ||
      !ts.isIdentifier(n.expression.expression) ||
      n.expression.expression.text !== 'Object' ||
      n.expression.name.text !== 'keys'
    )
      return null;
    if (
      u.checker.getSymbolAtLocation(n.expression.expression) ||
      n.arguments.length !== 1 ||
      !ts.isIdentifier(n.arguments[0])
    )
      reject();
    permissions.get(u.file.fileName)!.add(n.expression.expression.getStart());
    return record(u, n.arguments[0]);
  }
  function array(u: Unit, n: ts.Expression): Shape {
    if (ts.isArrayLiteralExpression(n)) {
      let depth = Infinity;
      for (const e of n.elements) {
        if (ts.isSpreadElement(e) || ts.isOmittedExpression(e)) reject();
        const d = numeric(u, e) ? 0 : array(u, e).depth;
        depth = Math.min(depth, d);
      }
      return { depth: depth === Infinity ? 1 : depth + 1 };
    }
    if (ts.isElementAccessExpression(n)) {
      if (n.questionDotToken || !numeric(u, n.argumentExpression) || !readPosition(n)) reject();
      const parent = array(u, n.expression);
      if (parent.depth < 2 || parent.record) reject();
      return { depth: parent.depth - 1 };
    }
    if (!ts.isIdentifier(n)) reject();
    const s = at(u, n);
    if (arrays.has(s)) return arrays.get(s)!;
    if (pending.has(s)) reject();
    pending.add(s);
    const d = declaration(s);
    let shape: Shape;
    if (ts.isVariableDeclaration(d) && constant(d) && d.initializer) {
      const rec = keysCall(u, d.initializer);
      if (rec) shape = { depth: 1, record: rec };
      else {
        if (!ts.isArrayLiteralExpression(d.initializer)) reject();
        const inserts: ts.Expression[] = [...d.initializer.elements] as ts.Expression[];
        for (const r of refs(u, s)) {
          const p = r.parent;
          if (
            ts.isPropertyAccessExpression(p) &&
            p.expression === r &&
            p.name.text === 'push' &&
            plainCall(p.parent) &&
            p.parent.expression === p
          )
            inserts.push(...p.parent.arguments);
        }
        let depth = Infinity;
        for (const e of inserts) depth = Math.min(depth, numeric(u, e) ? 0 : array(u, e).depth);
        shape = { depth: depth === Infinity ? 1 : depth + 1 };
      }
    } else if (
      ts.isParameter(d) &&
      ts.isFunctionDeclaration(d.parent) &&
      d.parent.name &&
      !d.dotDotDotToken &&
      !d.initializer
    ) {
      const fn = d.parent,
        fs = at(u, fn.name!),
        index = fn.parameters.indexOf(d);
      const calls = refs(u, fs).filter(r => !isName(r));
      if (calls.length === 0) reject();
      let depth = Infinity;
      for (const r of calls) {
        const p = r.parent;
        if (!plainCall(p) || p.expression !== r || p.arguments.length <= index) reject();
        const value = array(u, p.arguments[index]);
        if (value.record) reject();
        depth = Math.min(depth, value.depth);
      }
      shape = { depth };
    } else reject();
    for (const r of refs(u, s)) {
      if (isName(r)) continue;
      const p = r.parent;
      if (
        ts.isElementAccessExpression(p) &&
        p.expression === r &&
        !p.questionDotToken &&
        numeric(u, p.argumentExpression) &&
        readPosition(p)
      )
        continue;
      if (ts.isPropertyAccessExpression(p) && p.expression === r && !p.questionDotToken) {
        if (p.name.text === 'length' && readPosition(p)) continue;
        if (
          !shape.record &&
          p.name.text === 'push' &&
          plainCall(p.parent) &&
          p.parent.expression === p &&
          ts.isExpressionStatement(p.parent.parent)
        )
          continue;
      }
      if (shape.record && plainCall(p) && assertion(u, p)) continue;
      reject();
    }
    arrays.set(s, shape);
    pending.delete(s);
    return shape;
  }
  for (const [name] of units) permissions.set(name, new Set());
  for (const [name, u] of units) {
    if (!name.endsWith('.cjs')) reject();
    for (const n of u.nodes) {
      if (
        ts.isImportDeclaration(n) ||
        ts.isExportDeclaration(n) ||
        ts.isExportAssignment(n) ||
        n.kind === ts.SyntaxKind.ExportKeyword ||
        n.kind === ts.SyntaxKind.ImportKeyword
      )
        reject();
      if (
        ts.isGetAccessor(n) ||
        ts.isSetAccessor(n) ||
        ts.isSpreadAssignment(n) ||
        ts.isSpreadElement(n)
      )
        reject();
      if (
        ts.isIdentifier(n) &&
        ['Array', 'String', 'Number', 'Boolean', 'BigInt', 'Math', 'JSON', 'RegExp'].includes(
          n.text
        )
      ) {
        const p = n.parent;
        if (
          !(
            n.text === 'Number' &&
            ts.isPropertyAccessExpression(p) &&
            p.expression === n &&
            p.name.text === 'isInteger' &&
            !p.questionDotToken &&
            plainCall(p.parent) &&
            p.parent.expression === p
          )
        )
          reject();
      }
      // Prevent replacement or escape of the fixed assertion and test host surfaces.
      if (
        ts.isVariableDeclaration(n) &&
        n.initializer &&
        requireOf(n.initializer) === 'node:assert/strict'
      ) {
        if (!constant(n) || !ts.isIdentifier(n.name)) reject();
        for (const r of refs(u, at(u, n.name))) {
          if (isName(r)) continue;
          const p = r.parent;
          if (!ts.isPropertyAccessExpression(p) || !plainCall(p.parent) || !assertion(u, p.parent))
            reject();
        }
      }
      if (ts.isCallExpression(n) && requireOf(n) === 'node:test') {
        const d = n.parent;
        if (
          !ts.isVariableDeclaration(d) ||
          !constant(d) ||
          d.initializer !== n ||
          !ts.isObjectBindingPattern(d.name) ||
          d.name.elements.length !== 1
        )
          reject();
        const b = d.name.elements[0];
        if (
          b.propertyName ||
          b.initializer ||
          b.dotDotDotToken ||
          !ts.isIdentifier(b.name) ||
          b.name.text !== 'test'
        )
          reject();
        for (const r of refs(u, at(u, b.name))) {
          if (isName(r)) continue;
          const call = r.parent;
          if (
            !plainCall(call) ||
            call.expression !== r ||
            call.arguments.length !== 2 ||
            !ts.isStringLiteral(call.arguments[0]) ||
            !ts.isArrowFunction(call.arguments[1]) ||
            call.arguments[1].parameters.length !== 0
          )
            reject();
        }
      }
      if (ts.isIdentifier(n) && n.text === 'Object') {
        const p = n.parent;
        if (
          !ts.isPropertyAccessExpression(p) ||
          p.expression !== n ||
          !plainCall(p.parent) ||
          !keysCall(u, p.parent)
        )
          reject();
        let value: ts.Node = p.parent;
        while (
          ts.isPropertyAccessExpression(value.parent) &&
          value.parent.expression === value &&
          value.parent.name.text === 'sort' &&
          plainCall(value.parent.parent) &&
          value.parent.parent.expression === value.parent &&
          value.parent.parent.arguments.length === 0
        )
          value = value.parent.parent;
        const owner = value.parent;
        if (
          !ts.isVariableDeclaration(owner) ||
          owner.initializer !== value ||
          !ts.isIdentifier(owner.name)
        )
          reject();
        array(u, owner.name);
      }
      if (ts.isElementAccessExpression(n)) {
        if (!readPosition(n) || n.questionDotToken) reject();
        if (numeric(u, n.argumentExpression)) {
          const shape = array(u, n.expression),
            p = n.parent;
          if (shape.depth > 1 && !(ts.isElementAccessExpression(p) && p.expression === n)) reject();
          if (shape.record && !(ts.isElementAccessExpression(p) && p.argumentExpression === n))
            reject();
        } else {
          if (!ts.isIdentifier(n.expression) || !ts.isElementAccessExpression(n.argumentExpression))
            reject();
          const key = n.argumentExpression;
          if (!numeric(u, key.argumentExpression)) reject();
          const shape = array(u, key.expression);
          if (
            !shape.record ||
            shape.record !== record(u, n.expression) ||
            !ts.isTypeOfExpression(n.parent)
          )
            reject();
        }
        permissions.get(name)!.add(n.getStart());
      }
    }
  }
  return permissions;
}
