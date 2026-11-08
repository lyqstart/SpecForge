/**
 * Deterministic TypeScript/JavaScript Contract reconciliation.
 *
 * Machine verification is intentionally limited to explicit bindings. Untyped
 * strings are never guessed. Unsupported languages and unverified textual
 * Contract references are surfaced for structured manual review.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';
import {
  readUnifiedContracts,
  resolveCodePathModules,
} from './contracts-registry.js';
import { getFactualChangedFiles } from './write-guard-log.js';

type ChangedFile = { path: string; operation: 'create' | 'modify' | 'delete' };

export type CodeContractIssue = {
  file: string;
  line: number;
  contract_id: string;
  value: string | number;
  message: string;
};

export type CodeContractConsumer = {
  contract_id: string;
  file: string;
  module_code: string;
  verification: 'machine' | 'textual_unverified';
};

export type CodeContractVerification = {
  checked_files: string[];
  unsupported_files: string[];
  ignored_files: string[];
  detected_contract_ids: string[];
  machine_checked_contract_ids: string[];
  actual_consumers: CodeContractConsumer[];
  files_requiring_manual_review: string[];
  registered_contract_ids: string[];
  registry_errors: string[];
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function exactToken(content: string, value: string): boolean {
  if (!value) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(content);
}

async function readChangedFiles(workItemDir: string): Promise<ChangedFile[]> {
  const factual = getFactualChangedFiles(workItemDir);
  if (factual.length > 0) return factual;
  try {
    const workItem = JSON.parse(
      await fs.readFile(path.join(workItemDir, 'work_item.json'), 'utf-8'),
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
  if (ext === '.jsx' || ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.TS;
}

function consumerKey(consumer: CodeContractConsumer): string {
  return `${consumer.contract_id}\u0000${consumer.file}\u0000${consumer.module_code}\u0000${consumer.verification}`;
}

export async function verifyChangedCodeContracts(input: {
  projectRoot: string;
  workItemDir: string;
  changedFiles?: ChangedFile[];
}): Promise<CodeContractVerification> {
  const unified = readUnifiedContracts(input.projectRoot);
  const allContracts = new Map(unified.contracts.map(entry => [entry.id, entry]));
  const enumDefinitions = unified.contracts.filter(entry => entry.kind === 'shared_enum');
  const enums = new Map(
    enumDefinitions.map(entry => [
      entry.id,
      new Set(Array.isArray(entry.raw.values) ? entry.raw.values : []),
    ]),
  );
  const result: CodeContractVerification = {
    checked_files: [],
    unsupported_files: [],
    ignored_files: [],
    detected_contract_ids: [],
    machine_checked_contract_ids: [],
    actual_consumers: [],
    files_requiring_manual_review: [],
    registered_contract_ids: unique(Array.from(allContracts.keys())),
    registry_errors: unified.errors,
    issues: [],
  };

  const consumers = new Map<string, CodeContractConsumer>();
  const detected = new Set<string>();
  const machineChecked = new Set<string>();
  const manualFiles = new Set<string>();
  const changedFiles = input.changedFiles ?? (await readChangedFiles(input.workItemDir));

  const registerConsumer = (
    contractId: string,
    file: string,
    verification: CodeContractConsumer['verification'],
  ): void => {
    if (!allContracts.has(contractId)) return;
    detected.add(contractId);
    const owners = resolveCodePathModules(input.projectRoot, file);
    const consumer: CodeContractConsumer = {
      contract_id: contractId,
      file,
      module_code: owners.length === 1 ? owners[0] : '',
      verification,
    };
    consumers.set(consumerKey(consumer), consumer);
    if (verification === 'textual_unverified') manualFiles.add(file);
  };

  for (const changed of changedFiles) {
    if (changed.operation === 'delete') continue;
    const relative = normalize(changed.path);
    const ext = path.extname(relative).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(ext)) {
      result.ignored_files.push(relative);
      continue;
    }

    const absolute = path.isAbsolute(changed.path)
      ? path.resolve(changed.path)
      : path.resolve(input.projectRoot, relative);
    if (!isWithin(input.projectRoot, absolute)) {
      result.unsupported_files.push(relative);
      manualFiles.add(relative);
      continue;
    }

    let content: string;
    try {
      content = await fs.readFile(absolute, 'utf-8');
    } catch {
      result.unsupported_files.push(relative);
      manualFiles.add(relative);
      continue;
    }

    const textualIds = Array.from(allContracts.keys()).filter(contractId =>
      exactToken(content, contractId),
    );
    for (const contractId of textualIds) {
      registerConsumer(contractId, relative, 'textual_unverified');
    }

    if (!SUPPORTED.has(ext)) {
      result.unsupported_files.push(relative);
      if (allContracts.size > 0) manualFiles.add(relative);
      continue;
    }

    result.checked_files.push(relative);
    const source = ts.createSourceFile(
      absolute,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(absolute),
    );
    const typedIdentifiers = new Map<string, string>();
    const machineCheckedInFile = new Set<string>();

    function report(
      node: ts.Node,
      contractId: string | null,
      value: string | number | null,
    ): void {
      if (!contractId || !enums.has(contractId)) return;
      registerConsumer(contractId, relative, 'machine');
      machineChecked.add(contractId);
      machineCheckedInFile.add(contractId);
      const allowed = enums.get(contractId)!;
      if (value === null || allowed.has(value)) return;
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
      node: ts.VariableDeclaration | ts.ParameterDeclaration,
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
          literalValue(node.right),
        );
      }
      ts.forEachChild(node, visit);
    }
    visit(source);

    // A textual occurrence that was also machine-verified is no longer manual-only.
    for (const contractId of machineCheckedInFile) {
      const fileOwners = resolveCodePathModules(input.projectRoot, relative);
      const textualKey = consumerKey({
        contract_id: contractId,
        file: relative,
        module_code: fileOwners.length === 1 ? fileOwners[0] : '',
        verification: 'textual_unverified',
      });
      consumers.delete(textualKey);
    }
    if (
      !Array.from(consumers.values()).some(
        consumer => consumer.file === relative && consumer.verification === 'textual_unverified',
      )
    ) {
      manualFiles.delete(relative);
    }
  }

  result.checked_files = unique(result.checked_files);
  result.unsupported_files = unique(result.unsupported_files);
  result.ignored_files = unique(result.ignored_files);
  result.detected_contract_ids = unique(Array.from(detected));
  result.machine_checked_contract_ids = unique(Array.from(machineChecked));
  result.actual_consumers = Array.from(consumers.values()).sort((left, right) =>
    consumerKey(left).localeCompare(consumerKey(right)),
  );
  result.files_requiring_manual_review = unique(Array.from(manualFiles));
  return result;
}
