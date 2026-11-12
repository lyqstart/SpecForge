import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import { compileNodeCommand } from '../../src/verification/node-command-contract';

const source = (path: string, content: string) => ({
  path,
  content,
  sha256: createHash('sha256').update(content).digest('hex'),
});
const library = 'module.exports={sum};function sum(a,b){return a+b;}';
const prefix =
  "const {test}=require('node:test');const assert=require('node:assert/strict');const api=require('./lib.cjs');";
const prove = (body: string, lib = library) =>
  compileNodeCommand('node --test test.cjs', [
    source('test.cjs', prefix + body),
    source('lib.cjs', lib),
  ]);
const data =
  'const pairs=[];for(let r=0;r<3;r++){pairs.push([r,1]);}for(let i=0;i<pairs.length;i++){assert.strictEqual(api.sum(pairs[i][0],pairs[i][1]),i+1);}';
const keys =
  "const names=Object.keys(api).sort();assert.deepEqual(names,['sum']);for(let i=0;i<names.length;i++){assert.strictEqual(typeof api[names[i]],'function');}";

describe('finite local source proof', () => {
  it('proves numeric indices independently of business names and refuses every string key', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.string({ maxLength: 24 }), (index, key) => {
        expect(prove(`const data=[1,2];data[${index}];`).contract).toBe('readonly-node-command/v3');
        expect(() => prove(`const data=[1,2];data[${JSON.stringify(key)}];`)).toThrow();
      }),
      { numRuns: 50, seed: 26261112 }
    );
  });
  it('proves finite export domains without a business field-name allowlist', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), id => {
        const key = 'entry_' + id;
        expect(
          prove(
            `const names=Object.keys(api).sort();for(let i=0;i<names.length;i++){assert.equal(typeof api[names[i]],'function');}`,
            `module.exports={${key}};function ${key}(){return 1;}`
          ).contract
        ).toBe('readonly-node-command/v3');
      }),
      { numRuns: 30, seed: 26261113 }
    );
  });
  it('certifies closed nested arrays, exact export keys and actual lexical loop bindings', () => {
    const plan = prove("test('data',()=>{" + data + keys + '});');
    expect(plan.contract).toBe('readonly-node-command/v3');
    expect(plan.semanticProof.rule).toBe('single-file-finite-local-keys/v1');
    expect(Object.keys(plan.semanticProof.inputHashes).sort()).toEqual(['lib.cjs', 'test.cjs']);
    expect(plan.argv.slice(-2)).toEqual(['--test-isolation=none', 'test.cjs']);
  });
  it('checks every direct caller of a nonescaping local array parameter', () => {
    expect(
      prove(
        "function verify(rows){for(let i=0;i<rows.length;i++){assert.strictEqual(api.sum(rows[i][0],rows[i][1]),3);}}test('rows',()=>{verify([[1,2],[2,1]]);});"
      ).contract
    ).toBe('readonly-node-command/v3');
  });
  it('distinguishes real lexical local names from forbidden host hook properties', () => {
    expect(
      prove("test('local',()=>{const before=[1];const after=before[0];assert.equal(after,1);});")
        .contract
    ).toBe('readonly-node-command/v3');
    expect(() =>
      prove("const {before}=require('node:test');const a=[1];before(()=>a[0]);")
    ).toThrow();
    expect(() =>
      prove("const {before:hook}=require('node:test');const a=[1];hook(()=>a[0]);")
    ).toThrow();
  });
  it.each([
    "const a=[1];const k='constructor';a[k];",
    "const a=[1];for(let i=0;i<1;i++){i='constructor';a[i];}",
    "const a=[1];for(let i=0;i<1;i++){[i]=['constructor'];a[i];}",
    "const a=[1];for(let i=0;i<1;i++){({x:i}={x:'constructor'});a[i];}",
    "const a=[1];for(let i=0;i<1;i++){for(i of ['constructor']){a[i];}}",
    "const a=[1];for(let i=0;i<1;i++){function change(){i='constructor';}change();a[i];}",
    "const a=[[1]];const alias=a[0];alias.push('constructor');a[0][0];",
    "const a=[1];const alias=a;alias.push('constructor');a[0];",
    'const a=[1];a[0]=2;',
    'const a=[1];delete a[0];',
    'const a=[1];a[0]++;',
    'const a=[1];a?.[0];',
    "const names=Object.keys(api);names.push('constructor');typeof api[names[0]];",
    'const names=Object.keys(api);const alias=names;typeof api[names[0]];',
    'const names=Object.keys(api);names.sort(()=>0);typeof api[names[0]];',
    'const names=Object.keys(api);api.sum=()=>0;typeof api[names[0]];',
    'const names=Object.keys(api);const alias=api;typeof api[names[0]];',
    'const keys=Object.keys;keys(api);',
    "const Object={keys:()=>['sum']};const names=Object.keys(api);typeof api[names[0]];",
    'const names=Object.keys(api);assert.deepEqual=()=>{};typeof api[names[0]];',
    'function check(a){return a[0];}const alias=check;alias([1]);',
    "function check(a){return a[0];}check([1]);check(require('node:test'));",
    'const names=Object.keys(api);const f=api[names[0]];f();',
    'const names=Object.keys(api);Number.isInteger=()=>true;typeof api[names[0]];',
    'Object.keys(api).forEach(name=>{});',
    'function leak(value){}leak(Object.keys(api));',
    'const Number={isInteger:()=>true};const a=[1];a[0];',
    'function bad(module){module.exports={sum};}const a=[1];a[0];',
    "const a=[1];a[0];const {constructor}='';const {constructor:factory}=constructor;factory('return process')();",
    'const a=[1];a[0];const constructor=()=>1;const value={constructor};',
    "const a=[1];const box={a};box.a.push('constructor');a[0];",
    'const names=Object.keys(api);const box={names};typeof api[names[0]];',
    'function read(a){return a[0];}read([1]);module.exports={read};',
    "const a=[1];a[0];import('node:assert/strict').then(copy=>{});",
  ])('rejects escape, mutation or an unproved key: %s', body => {
    expect(() => prove(body)).toThrow();
  });
  it.each([
    'module.exports={get sum(){return ()=>1;}};',
    'module.exports={sum};function sum(a,b){return a+b;}module.exports.extra=sum;',
    'const x={sum};function sum(a,b){return a+b;}module.exports=x;',
    'module.exports={constructor:sum};function sum(a,b){return a+b;}',
    'module.exports={sum};function sum(a,b){return a+b;}const alias=module;',
  ])('rejects an open or unsafe export record', lib => {
    expect(() => prove(keys, lib)).toThrow();
  });
  it('retains a valid old no-index declaration as v1', () => {
    expect(prove("test('sum',()=>assert.strictEqual(api.sum(1,2),3));").contract).toBe(
      'readonly-node-command/v1'
    );
  });
});
