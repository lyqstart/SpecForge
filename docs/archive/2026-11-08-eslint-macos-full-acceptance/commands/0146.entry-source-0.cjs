const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve('.lint-review-a01'),file='packages/daemon-core/src/tools/lib/architecture-governance-v7-regression.test.ts',text=fs.readFileSync(path.join(root,file),'utf8');const importLine="import { codeContains } from '../../../../../tests/helpers/source-structure';\n";assert(text.includes(importLine));const helper=`import ts from 'typescript';
function hasRequiredModuleFiles(text: string): boolean {
  const expected = ['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md'];
  const tree = ts.createSourceFile('contract.ts', text, ts.ScriptTarget.Latest, true);
  let found = false;
  function visit(node: ts.Node): void {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === expected.length && node.elements.every((element, index) => ts.isStringLiteral(element) && element.text === expected[index])) found = true;
    ts.forEachChild(node, visit);
  }
  visit(tree); return found;
}
`;
let after=text.replace(importLine,'');const position=after.indexOf('function source(');assert(position>0);after=after.slice(0,position)+helper+'\n'+after.slice(position);const pattern=/codeContains\(\s*(gateRunner|mergeRunner),\s*"\['module\.json', 'requirements\.md', 'design\.md', 'contracts\.json', 'trace\.md'\]"\s*\)/g;assert.equal([...after.matchAll(pattern)].length,2);after=after.replace(pattern,(_,variable)=>'hasRequiredModuleFiles('+variable+')');const anchor="describe('Architecture governance v7 closure', () => {";assert(after.includes(anchor));after=after.replace(anchor,anchor+`\n  it('does not treat comments or incomplete module file arrays as the required contract', () => {\n    expect(hasRequiredModuleFiles("// ['module.json', 'requirements.md', 'design.md', 'contracts.json', 'trace.md']")).toBe(false);\n    expect(hasRequiredModuleFiles("const files = ['module.json', 'requirements.md', 'design.md', 'trace.md'];")).toBe(false);\n  });`);
const plan=path.join(__dirname,'embedded-test-source-owner-plan.json');fs.writeFileSync(plan,JSON.stringify({id:'embedded-test-source-owner',reason:'0145 actual TS6059: embedded src test cannot import a root TS helper outside production rootDir. Keep the assertion helper inside that existing src test, inspect actual array literals, add negative cases, preserve compiler rootDir/include.',required_verification:'Complete build and whole affected regression file',files:[{file,changes:[{from:text,to:after}]}]},null,2)+'\n',{flag:'wx'});require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'apply-reviewed-edits.cjs'),plan],{cwd:process.cwd(),stdio:'inherit'});
