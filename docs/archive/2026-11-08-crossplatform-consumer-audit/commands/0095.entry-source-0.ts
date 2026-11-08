import {describe,it,expect} from 'vitest';import {readFileSync} from 'node:fs';import path from 'node:path';import ts from 'typescript';
import * as configuration from '../../configuration/src/index';
import * as observability from '../../observability/src/index';
const root=path.resolve(import.meta.dirname,'../../..'),read=(p:string)=>readFileSync(path.join(root,p),'utf8');
describe('current operating documentation contracts',()=>{
  it('documents actual observability runtime exports and the StateManager authority boundary',()=>{
    const text=read('packages/observability/README.md');const blocks=[...text.matchAll(/```typescript\r?\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n'),source=ts.createSourceFile('observability-doc.ts',blocks,ts.ScriptTarget.Latest,true);let checked=0;
    for(const n of source.statements)if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text==='@specforge/observability'&&!n.importClause?.isTypeOnly&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings))for(const element of n.importClause.namedBindings.elements)if(!element.isTypeOnly){checked++;expect(Object.prototype.hasOwnProperty.call(observability,element.propertyName?.text??element.name.text),element.name.text).toBe(true);}
    expect(checked).toBeGreaterThan(0);expect(text).toContain('StateManager');expect(text).not.toContain('new QueryAPI');expect(text).not.toContain('new EventLogger');
  });
  it('uses actual public configuration exports and does not invent a ConfigManager API',()=>{
    const text=read('packages/configuration/README.md');const code=[...text.matchAll(/```typescript\r?\n([\s\S]*?)```/g)].map(m=>m[1]).join('\n'),source=ts.createSourceFile('documentation.ts',code,ts.ScriptTarget.Latest,true);let checked=0;
    for(const n of source.statements)if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&n.moduleSpecifier.text==='@specforge/configuration'&&n.importClause?.namedBindings&&ts.isNamedImports(n.importClause.namedBindings))for(const element of n.importClause.namedBindings.elements){checked++;expect(Object.prototype.hasOwnProperty.call(configuration,element.propertyName?.text??element.name.text),element.name.text).toBe(true);}
    expect(checked).toBeGreaterThan(0);expect(text).toContain('sf_project_config');
  });
  it('documents release preparation before userlevel source installation',()=>{
    for(const p of ['docs/user/install.md','docs/cli/installation-setup.md']){const text=read(p);expect(text,p).toContain('scripts/prepare-current-release.ts');expect(text.indexOf('scripts/prepare-current-release.ts')).toBeLessThan(text.indexOf('scripts/sf-installer.ts install'));}
  });
  it('keeps active Daemon guides on independent CLI lifecycle and current handshake schema',()=>{
    for(const p of ['packages/daemon-core/docs/README.md','packages/daemon-core/docs/cli-integration.md','packages/daemon-core/docs/thin-plugin-integration.md']){const text=read(p);expect(text,p).toContain('specforge daemon start --detach');expect(text,p).not.toContain('auto-exit on idle');expect(text,p).not.toContain('exits after 30 seconds');expect(text,p).not.toContain('Start as thin plugin');}
    const authentication=read('packages/daemon-core/docs/authentication.md');expect(authentication).toContain('schema_version');expect(authentication).toContain('artifact_contract_versions');expect(authentication).not.toContain('"schemaVersion"');
  });
  it('keeps Adapter deployment guidance on the official installed production consumer',()=>{
    const text=read('packages/opencode-adapter/docs/installation.md');expect(text).toContain('scripts/sf-installer.ts');expect(text).not.toContain('npm install @specforge/opencode-adapter');expect(text).toContain('unknown');
  });
});
