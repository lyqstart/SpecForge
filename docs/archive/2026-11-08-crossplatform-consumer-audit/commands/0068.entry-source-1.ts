/** Current Project Init producer → registration consumer; never reads product-self state. */
import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {ensureProjectInit} from '../../src/tools/lib/sf_project_init_core';
import {precheckProjectRegistrationSchemas,PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS} from '../../src/project/project-schema-descriptors';
describe('current Project Init manifest contract',()=>{
 let root:string,manifestPath:string;
 beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'sf-current-init-contract-'));manifestPath=join(root,'.specforge/project/spec_manifest.json');const result=await ensureProjectInit(root,'synthetic-current-contract',{ensureHostProfile:async()=>{}});expect(result.success,JSON.stringify(result.errors)).toBe(true);});
 afterEach(async()=>{const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1)?.startsWith('sf-current-init-contract-'))throw Error('OWNED_FIXTURE_REQUIRED');await rm(absolute,{recursive:true,force:true});});
 it('produces the descriptor-owned current manifest and canonical module identity',async()=>{
  const descriptor=PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS.find(d=>d.id==='project-spec-manifest')!;
  expect(descriptor.relativePath).toBe('.specforge/project/spec_manifest.json');
  const document=JSON.parse(await readFile(manifestPath,'utf8'));expect(document.schema_version).toBe(descriptor.currentSchemaId);expect(document.default_module).toBe('CORE');expect(document.project_name).toBe('synthetic-current-contract');
  expect((await precheckProjectRegistrationSchemas(root)).ok).toBe(true);
  await expect(access(join(root,'.specforge/manifest.json'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('rejects a foreign schema without rewriting it',async()=>{
  const document=JSON.parse(await readFile(manifestPath,'utf8'));document.schema_version='999.0';const bytes=JSON.stringify(document);await writeFile(manifestPath,bytes);const result=await precheckProjectRegistrationSchemas(root);expect(result.ok).toBe(false);expect(await readFile(manifestPath,'utf8')).toBe(bytes);
 });
 it('rejects missing schema and conflicting canonical identity',async()=>{
  const document=JSON.parse(await readFile(manifestPath,'utf8'));delete document.schema_version;await writeFile(manifestPath,JSON.stringify(document));expect((await precheckProjectRegistrationSchemas(root)).ok).toBe(false);
  document.schema_version='1.0';document.modules[0].module_code='OTHER';await writeFile(manifestPath,JSON.stringify(document));expect((await precheckProjectRegistrationSchemas(root)).ok).toBe(false);
 });
});
