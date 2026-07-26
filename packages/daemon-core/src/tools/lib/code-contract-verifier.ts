/**
 * Deterministic TypeScript/JavaScript contract reconciliation.
 *
 * This deliberately checks only literals with an explicit type binding:
 * declarations/defaults, `as`/`satisfies`, and assignments to explicitly typed
 * variables. Untyped strings are not guessed. Unsupported source languages are
 * reported as coverage warnings instead of being silently treated as verified.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';
import { readContractsRegistry } from './contracts-registry.js';
import { getFactualChangedFiles } from './write-guard-log.js';

type ChangedFile = { path: string; operation: 'create' | 'modify' | 'delete' };

export type CodeContractIssue = {
  file: string;
  line: number;
  contract_id: string;
  value: string | number;
  message: string;
};

export type CodeContractVerification = {
  checked_files: string[];
  unsupported_files: string[];
  ignored_files: string[];
  issues: CodeContractIssue[];
};

const SUPPORTED = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);
const SOURCE_EXTENSIONS = new Set([
  ...SUPPORTED,
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.cs',
  '.c',
  '.cc',
  '.cpp',
  '.rb',
  '.php',
  '.swift',
]);

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function readChangedFiles(workItemDir: string): Promise<ChangedFile[]> {
  const factual = getFactualChangedFiles(workItemDir);
  if (factual.length > 0) return factual;
  try {
    const workItem = JSON.parse(
      await fs.readFile(path.join(workItemDir, 'work_item.json'), 'utf-8')
    ) as Record<string, unknown>;
    if (!Array.isArray(workItem.actual_changed_files)) return [];
    return workItem.actual_changed_files
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => {
        const raw = entry as Record<string, unknown>;
        return {
          path: String(raw.path ?? ''),
          operation: String(raw.operation ?? 'modify') as ChangedFile['operation'],
        };
      })
      .filter(entry => entry.path.length > 0);
  } catch {
    return [];
  }
}

function typeName(typeNode: ts.TypeNode | undefined, source: ts.SourceFile): string | null {
  if (!typeNode) return null;
  const text = typeNode.getText(source).trim();
  const simple = text.split('.').at(-1) ?? text;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(simple) ? simple : null;
}

function literalValue(node: ts.Node | undefined): string | number | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(node.operand)
  ) {
    const value = Number(node.operand.text);
    return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  return null;
}

function scriptKind(filePath: string): ts.ScriptKind {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx' || ext === '.js' || ext === '.mjs' || ext === '.cjs') return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

export async function verifyChangedCodeContracts(input: {
  projectRoot: string;
  workItemDir: string;
  changedFiles?: ChangedFile[];
}): Promise<CodeContractVerification> {
  const registry = readContractsRegistry(input.projectRoot);
  const enums = new Map(registry.shared_enums.map(entry => [entry.id, new Set(entry.values)]));
  const result: CodeContractVerification = {
    checked_files: [],
    unsupported_files: [],
    ignored_files: [],
    issues: [],
  };
  if (enums.size === 0) return result;

  const changedFiles = input.changedFiles ?? (await readChangedFiles(input.workItemDir));
  for (const changed of changedFiles) {
    if (changed.operation === 'delete') continue;
    const relative = normalize(changed.path);
    const ext = path.extname(relative).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) {
      result.ignored_files.push(relative);
      continue;
    }
    if (!SUPPORTED.has(ext)) {
      result.unsupported_files.push(relative);
      continue;
    }
    const absolute = path.isAbsolute(changed.path)
      ? path.resolve(changed.path)
      : path.resolve(input.projectRoot, relative);
    if (!isWithin(input.projectRoot, absolute)) {
      result.unsupported_files.push(relative);
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(absolute, 'utf-8');
    } catch {
      result.unsupported_files.push(relative);
      continue;
    }
    result.checked_files.push(relative);
    const source = ts.createSourceFile(
      absolute,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(absolute)
    );
    const typedIdentifiers = new Map<string, string>();

    function report(
      node: ts.Node,
      contractId: string | null,
      value: string | number | null
    ): void {
      if (!contractId || value === null) return;
      const allowed = enums.get(contractId);
      if (!allowed || allowed.has(value)) return;
      const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
      result.issues.push({
        file: relative,
        line: pos.line + 1,
        contract_id: contractId,
        value,
        message: `${JSON.stringify(value)} is not registered in shared_enum:${contractId}`,
      });
    }

    function declarationType(
      node: ts.VariableDeclaration | ts.ParameterDeclaration
    ): string | null {
      return typeName(node.type ?? ts.getJSDocType(node), source);
    }

    function visit(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
        const contractId = declarationType(node);
        if (contractId && enums.has(contractId)) {
          if (ts.isIdentifier(node.name)) typedIdentifiers.set(node.name.text, contractId);
          report(node.initializer ?? node, contractId, literalValue(node.initializer));
        }
      } else if (ts.isPropertyDeclaration(node)) {
        const contractId = typeName(node.type ?? ts.getJSDocType(node), source);
        if (contractId && enums.has(contractId)) {
          report(node.initializer ?? node, contractId, literalValue(node.initializer));
        }
      } else if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
        const contractId = typeName(node.type, source);
        report(node.expression, contractId, literalValue(node.expression));
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left)
      ) {
        report(
          node.right,
          typedIdentifiers.get(node.left.text) ?? null,
          literalValue(node.right)
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return result;
}
