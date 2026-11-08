const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve('.lint-review-a01'),file='packages/daemon-core/tests/v6-authority-consumer-alignment.test.ts',text=fs.readFileSync(path.join(root,file),'utf8');const old=`  it('projects the current Observability principle into both active Doc Lint implementations', () => {
    const principle = '可观测性是一级能力，不是第二套状态系统';

    expect(codeContains(daemonLint, `"${principle}"`)).toBe(true);
    expect(codeContains(userlevelLint, `"${principle}"`)).toBe(true);
    expect(rootLintFixtures).toContain(principle);
    expect(rootLintFixtures).not.toContain('可观测性是一级组件，不是附加能力');
  });`;
assert(text.includes(old));const next=`  it('keeps current Doc Lint under SPS authority while preserving historical principle evidence', () => {
    const principle = '可观测性是一级能力，不是第二套状态系统';
    expect(productSpecification).toContain('Observability 不得拥有第二套 workflow state WAL。');
    expect(codeContains(userlevelLint, `"${principle}"`)).toBe(true);
    for (const source of [daemonLint, userlevelLint]) {
      const tree = ts.createSourceFile('doc-lint.ts', source, ts.ScriptTarget.Latest, true);
      const legacyCalls: string[] = [];
      function visit(node: ts.Node): void {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text.startsWith('checkV6Arch')) legacyCalls.push(node.expression.text);
        ts.forEachChild(node, visit);
      }
      visit(tree);
      expect(legacyCalls).toEqual([]);
    }
    expect(rootLintFixtures).toContain(principle);
    expect(rootLintFixtures).not.toContain('可观测性是一级组件，不是附加能力');
  });`;
const core='packages/daemon-core/src/tools/lib/sf_doc_lint_core.ts',before=fs.readFileSync(path.join(root,core),'utf8');let after=before;const titles=['设计原则','不做边界','北极星目标','发版门槛','平台声明','里程碑'];for(const title of titles){const pattern=new RegExp('/\\*\\*\\n \\* 检查 V6 架构'+title+'节\\n[\\s\\S]*?\\*/\\n\\n');assert(pattern.test(after),title);after=after.replace(pattern,'');}after=after.replace(' * - V6 架构: 检查核心设计原则节\n','');after=after.replace(/  \/\/ V6 架构:[^\n]*\n  \/\/ 检查文档[^\n]*\n/g,'');const note='  /* Historical V6 content algorithms are retained below, but are not current product lint policy. */';assert.equal(after.split(note).length-1,4);after=after.replaceAll(note+'\n\n'+note,'  // Current business lint does not enforce historical V6 product acceptance lists.');
const plan=path.join(__dirname,'doc-lint-authority-regression-plan.json');fs.writeFileSync(plan,JSON.stringify({id:'doc-lint-authority-regression',reason:'0149 isolated actual failure exposes an obsolete source-presence assertion: current SPS forbids historical product authority and current-doc-lint-authority runtime regression already proves V6-named business content must not activate old product acceptance. Unused historical private algorithms were removed during lint repairs; do not re-enable them or add an unused exported constant. Check SPS ownership plus actual absence of legacy calls, retain historical template/fixture text and current business runtime acceptance tests. Remove orphan misleading algorithm comments only.',required_verification:'Affected complete files, real current Doc Lint behavior, full build/lint and actual platform regression',files:[{file,changes:[{from:"import { codeContains } from '../../../tests/helpers/source-structure';\n",to:"import ts from 'typescript';\nimport { codeContains } from '../../../tests/helpers/source-structure';\n"},{from:old,to:next}]},{file:core,changes:[{from:before,to:after}]}]},null,2)+'\n',{flag:'wx'});require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'apply-reviewed-edits.cjs'),plan],{cwd:process.cwd(),stdio:'inherit'});
