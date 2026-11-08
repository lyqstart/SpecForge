const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');const root=path.resolve('.lint-review-a01'),ts=createRequire(path.join(root,'package.json'))('typescript'),files=[];function add(file,changes){files.push({file,changes});}const helper='tests/helpers/source-structure.ts';
files.push({file:helper,content:`import ts from 'typescript';

/** Compare code tokens, retaining literal values/operators but ignoring quote style and trivia. */
function tokens(text: string): string[] {
  const source = ts.createSourceFile('contract.ts', text, ts.ScriptTarget.Latest, true);
  const result: Array<{ kind: ts.SyntaxKind; value: string }> = [];
  function visit(node: ts.Node): void {
    if (node.kind === ts.SyntaxKind.EndOfFileToken || (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode)) return;
    const children = node.getChildren(source);
    if (children.length) { for (const child of children) visit(child); return; }
    if (node.end === node.pos || node.kind === ts.SyntaxKind.SyntaxList) return;
    result.push({ kind: node.kind, value: ts.isStringLiteralLike(node) ? node.text : node.getText(source) });
  }
  visit(source);
  // Only a separator after an actual element may be optional; preserve array holes.
  const normalized = result.filter((token, index) => token.kind !== ts.SyntaxKind.CommaToken || ![ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken].includes(result[index + 1]?.kind) || index === 0 || [ts.SyntaxKind.CommaToken, ts.SyntaxKind.OpenParenToken, ts.SyntaxKind.OpenBracketToken, ts.SyntaxKind.OpenBraceToken].includes(result[index - 1].kind));
  return normalized.map(token => JSON.stringify([token.kind, token.value]));
}
export function codeContains(source: string, fragment: string): boolean {
  const actual = tokens(source), expected = tokens(fragment);
  if (!expected.length) throw new Error('SOURCE_CONTRACT_EMPTY_FRAGMENT');
  return actual.some((_, start) => expected.every((token, index) => actual[start + index] === token));
}
export function hasCallArgument(source: string, callee: string, argument: string): boolean {
  const tree = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true);
  let found = false;
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === callee && node.arguments.some(value => ts.isIdentifier(value) && value.text === argument)) found = true;
    ts.forEachChild(node, visit);
  }
  visit(tree); return found;
}
`});
const imports=(prefix,names='codeContains')=>({from:'',to:''});
function sourceFile(file,relative,changes,names='codeContains'){const text=fs.readFileSync(path.join(root,file),'utf8').replace(/\r*\n/g,'\n'),first=text.split('\n')[0];add(file,[{from:first+'\n',to:`import { ${names} } from '${relative}';\n`+first+'\n'},...changes]);}
sourceFile('packages/scope-gate/tests/current-permission-write-guard-boundary.test.ts','../../../tests/helpers/source-structure',[
{from:"expect(daemonWriteGuard).toContain('targetDetails: WriteTargetDetails = {},');",to:"expect(codeContains(daemonWriteGuard, 'targetDetails: WriteTargetDetails = {}')).toBe(true);"},
{from:"expect(daemonWriteGuard).toContain(\n      'return decideWritePermission(ctx, targetPath, operation, targetDetails);',\n    );",to:"expect(codeContains(daemonWriteGuard, 'return decideWritePermission(ctx, targetPath, operation, targetDetails);')).toBe(true);"},
{from:"expect(daemonHttp).toContain('checkNativeTool(this.deps,');",to:"expect(codeContains(daemonHttp, 'checkNativeTool(this.deps,')).toBe(true);"}
]);
sourceFile('packages/daemon-core/tests/design-governance-orchestrator-closure.test.ts','../../../tests/helpers/source-structure',[{from:'expect(stateMachine).toContain(`${workflowType}: "${workflowPath}"`);',to:'expect(codeContains(stateMachine, `${workflowType}: "${workflowPath}"`)).toBe(true);'}]);
sourceFile('packages/daemon-core/tests/v11-final-governance-regression.test.ts','../../../tests/helpers/source-structure',[{from:'expect(transition).toContain(\'state_authority: "StateManager"\');',to:'expect(codeContains(transition, \'state_authority: "StateManager"\')).toBe(true);'},{from:'expect(closeGate).toContain(\'expected_state: "verification_done"\');',to:'expect(codeContains(closeGate, \'expected_state: "verification_done"\')).toBe(true);'}]);
sourceFile('packages/daemon-core/tests/v6-authority-consumer-alignment.test.ts','../../../tests/helpers/source-structure',[{from:'expect(daemonLint).toContain(`"${principle}"`);',to:'expect(codeContains(daemonLint, `"${principle}"`)).toBe(true);'},{from:'expect(userlevelLint).toContain(`"${principle}"`);',to:'expect(codeContains(userlevelLint, `"${principle}"`)).toBe(true);'}]);
sourceFile('packages/daemon-core/tests/unit/candidate-gate-historical-attempt-reconcile.test.ts','../../../../tests/helpers/source-structure',[{from:"expect(chain).toContain('sealInputPaths,');",to:"expect(hasCallArgument(chain, 'buildGateAttemptInputSnapshot', 'sealInputPaths')).toBe(true);"}],'hasCallArgument');
sourceFile('packages/daemon-core/tests/unit/candidate-runtime-truth-contract.test.ts','../../../../tests/helpers/source-structure',[{from:"expect(transition).toContain('materializeImplementationBaseline(projectPath, workItemId)');",to:"expect(codeContains(transition, 'materializeImplementationBaseline(projectPath, workItemId)')).toBe(true);"}]);
sourceFile('packages/daemon-core/tests/unit/current-project-layout-boundary.test.ts','../../../../tests/helpers/source-structure',[{from:'expect(transitionSource).toMatch(\n      /SPEC_DIR_NAME,\\s*"project",\\s*"spec_manifest\\.json"/,\n    );',to:'expect(codeContains(transitionSource, \'SPEC_DIR_NAME, "project", "spec_manifest.json"\')).toBe(true);'}]);
sourceFile('packages/daemon-core/tests/unit/err155-159-contract-governance-recovery.test.ts','../../../../tests/helpers/source-structure',[{from:'expect(handler).toContain("[\'add\',\'update\',\'reset\']");',to:'expect(codeContains(handler, "[\'add\',\'update\',\'reset\']")).toBe(true);'},{from:'expect(userTool).toContain("[\'add\', \'update\', \'reset\']");',to:'expect(codeContains(userTool, "[\'add\', \'update\', \'reset\']")).toBe(true);'}]);
sourceFile('packages/daemon-core/src/tools/lib/architecture-governance-v7-regression.test.ts','../../../../../tests/helpers/source-structure',[{from:"expect(gateRunner).toContain(\n      \"['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md']\"\n    );",to:"expect(codeContains(gateRunner, \"['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md']\")).toBe(true);"},{from:"expect(mergeRunner).toContain(\n      \"['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md']\"\n    );",to:"expect(codeContains(mergeRunner, \"['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md']\")).toBe(true);"}]);
const source=fs.readFileSync(path.join(root,'packages/daemon-core/src/tools/lib/sf_knowledge_base_core.ts'),'utf8'),sourceAst=ts.createSourceFile('core.ts',source,ts.ScriptTarget.Latest,true),functionNode=sourceAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='validateKnowledgeStore');assert(functionNode);const mirror='setup/userlevel-opencode/tools/lib/sf_knowledge_base_core.ts',mirrorText=fs.readFileSync(path.join(root,mirror),'utf8').replace(/\r*\n/g,'\n'),mirrorAst=ts.createSourceFile(mirror,mirrorText,ts.ScriptTarget.Latest,true),oldFunction=mirrorAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='validateKnowledgeStore');assert(oldFunction);add(mirror,[{from:mirrorText.slice(oldFunction.getStart(mirrorAst),oldFunction.end),to:source.slice(functionNode.getStart(sourceAst),functionNode.end)}]);
files.push({file:'packages/daemon-core/tests/unit/source-structure-contract.test.ts',content:`import { describe, expect, it } from 'vitest';
import { codeContains, hasCallArgument } from '../../../../tests/helpers/source-structure';
describe('source contract syntax normalization', () => {
  it('preserves the same string values and optional trailing separators', () => {
    expect(codeContains('const paths = ["a", \\n "b",];', "['a', 'b']")).toBe(true);
    expect(codeContains('feature_spec: "requirement_change_path"', "feature_spec: 'requirement_change_path'")).toBe(true);
  });
  it('does not hide changed literal values, operators, array holes or comments', () => {
    expect(codeContains('const paths = ["a", "changed"];', "['a', 'b']")).toBe(false);
    expect(codeContains('const value = left - right;', 'left + right')).toBe(false);
    expect(codeContains('const value = [1,,];', '[1,]')).toBe(false);
    expect(codeContains('// target(call);\\nconst value = "target(call)";', 'target(call)')).toBe(false);
  });
  it('requires the real named call and argument instead of text mention', () => {
    expect(hasCallArgument('snapshot(root, paths);', 'snapshot', 'paths')).toBe(true);
    expect(hasCallArgument('other(root, paths);', 'snapshot', 'paths')).toBe(false);
    expect(hasCallArgument('snapshot(root, other);', 'snapshot', 'paths')).toBe(false);
  });
});
`});
const target=path.join(__dirname,'source-contract-repairs-plan.json');fs.writeFileSync(target,JSON.stringify({id:'source-contract-repairs',reason:'0136 actual 12 test failures: retain meaningful semantic code requirements across quote/wrapping/trailing-comma changes, strengthen snapshot argument assertion to actual AST call, synchronize existing duplicated knowledge validation projection exactly. Negative parser canaries reject changed values/operators/array holes/comments/callees.',required_verification:'All affected files, full build/lint, complete frozen platform suite',files},null,2)+'\n',{flag:'wx'});require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'apply-reviewed-edits.cjs'),target],{cwd:process.cwd(),stdio:'inherit'});
