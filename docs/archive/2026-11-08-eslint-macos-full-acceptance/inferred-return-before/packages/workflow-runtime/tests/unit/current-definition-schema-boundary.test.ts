import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';

import {afterEach,beforeEach,describe,it,expect} from 'vitest';

import {WorkflowLoader} from '../../src/engine/WorkflowLoader';import {CompositeGateSerializer,type SerializedSimpleGate} from '../../src/gates/CompositeGateSerializer';
import {WorkflowDefinitionLoader} from '../../src/loaders/WorkflowDefinitionLoader';
const definition=(version='1.0')=>({schema_version:version,id:'synthetic-definition',displayName:'Synthetic definition',intent:'Read-only schema fixture',stateMachine:{schema_version:version,initial:'start',states:{start:{schema_version:version,agent:'sf-design',gate:{schema_version:version,type:'simple',id:'check',name:'Check'},skills:[]}}},artifacts:[]});
describe('current definition persistent schema boundary',()=>{
 let root:string;beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'sf-definition-schema-'));});afterEach(async()=>{const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1)?.startsWith('sf-definition-schema-'))throw Error('OWNED_FIXTURE_REQUIRED');await rm(root,{recursive:true,force:true});});
 it.each(['1.0','2.0'])('accepts explicitly supported definition schema %s without conversion',version=>{const input=definition(version),before=JSON.stringify(input),result=new WorkflowDefinitionLoader().loadFromObject(input);expect(result.schema_version).toBe(version);expect(JSON.stringify(input)).toBe(before);});
 it('rejects a missing identity without mutating an object',()=>{const input:Record<string,unknown>=definition();delete input.schema_version;const before=JSON.stringify(input);expect(()=>new WorkflowDefinitionLoader().loadFromObject(input)).toThrow(/schema_version/);expect(JSON.stringify(input)).toBe(before);});
 it('rejects missing persistent schema and preserves source bytes',async()=>{const input:Record<string,unknown>=definition();delete input.schema_version;const bytes=JSON.stringify(input),file=join(root,'missing.json');await writeFile(file,bytes);await expect(new WorkflowLoader().loadFromFile(file)).rejects.toThrow(/schema_version/);expect(await readFile(file,'utf8')).toBe(bytes);});
 it('fails a directory as a whole on unsupported schema without partial registration',async()=>{const loader=new WorkflowLoader();await writeFile(join(root,'a-current.json'),JSON.stringify(definition()));const file=join(root,'b-unknown.json'),bytes=JSON.stringify({...definition(),id:'unknown',schema_version:'999.0'});await writeFile(file,bytes);await expect(loader.loadFromDirectory(root)).rejects.toThrow();expect(loader.getAllLoadedDefinitions()).toEqual([]);expect(await readFile(file,'utf8')).toBe(bytes);});
 it('does not replace a missing required builtin with an empty successful set',async()=>{await expect(new WorkflowLoader().loadBuiltinWorkflows(root)).rejects.toThrow();});
 it('does not expose schema conversion as a current loader responsibility',()=>{const loader=new WorkflowLoader();expect(Reflect.get(loader,'migrate')).toBeUndefined();expect(Reflect.get(loader,'registerMigration')).toBeUndefined();});
 it('keeps serialized Gate schema independent and never converts definition 2.0 to serialized 1.0',()=>{
  const gate={schema_version:'2.0',type:'simple',id:'check',name:'Check'} as const;expect(()=>CompositeGateSerializer.serializeSimpleGate(gate)).toThrow('SERIALIZED_GATE_SCHEMA_UNSUPPORTED');
  for(const version of [undefined,'999.0','2.0']){const wire={...gate,schema_version:version};expect(CompositeGateSerializer.validateSerializedGate(wire).valid).toBe(false);expect(()=>CompositeGateSerializer.deserializeSimpleGate(wire as unknown as SerializedSimpleGate)).toThrow();}
  const valid={...gate,schema_version:'1.0'} as const;expect(CompositeGateSerializer.serializeSimpleGate(valid)).toMatchObject(valid);
 });
});
