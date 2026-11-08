import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { compileNodeCommand, tokenizeNodeDeclaration, type FrozenNodeSource } from '../../src/verification/node-command-contract';

const source = (path: string, content: string): FrozenNodeSource => ({ path, content,
  sha256: createHash('sha256').update(content).digest('hex') });
const library = source('src/salute.ts', 'export function salute(name: string): string { if (name === "") return "world"; return "hi " + name; }');
const test = source('tests/salute.test.ts', 'import { test } from "node:test"; import assert from "node:assert/strict"; import { salute } from "../src/salute.ts"; test("name",()=>{const name="Ada";assert.strictEqual(salute(name),"hi Ada");});');

describe('frozen readonly Node declaration contract', () => {
  it('proves a deterministic single-file test and its complete local graph', () => {
    const result = compileNodeCommand('node --test tests/salute.test.ts', [library, test]);
    expect(result.original).toBe('node --test tests/salute.test.ts');
    expect(result.argv).toEqual(['--no-addons', '--preserve-symlinks', '--preserve-symlinks-main',
      '--test-reporter=tap', '--test', '--test-isolation=none', 'tests/salute.test.ts']);
    expect(result.semanticProof.inputHashes).toEqual({ [test.path]: test.sha256, [library.path]: library.sha256 });
  });

  it('retains frozen inline source and exit/output behavior without a shell', () => {
    const script = "import('./src/salute.ts').then(m=>{if(m.salute('Ada')!=='hi Ada')process.exit(1);console.log('OK');}).catch(()=>process.exit(1))";
    const result = compileNodeCommand(`node -e "${script}"`, [library]);
    expect(result.inlineSource).toBe(script);
    expect(result.argv.slice(-2)).toEqual(['-e', script]);
    expect(result.semanticProof.inputHashes).toEqual({ [library.path]: library.sha256 });
  });

  it('supports a finite CJS local require graph', () => {
    const a = source('test.cjs', "const {test}=require('node:test'); const assert=require('node:assert/strict'); const {sum}=require('./lib.cjs'); test('sum',()=>assert.strictEqual(sum(2,3),5));");
    const b = source('lib.cjs', 'function sum(a,b){return a+b;} module.exports={sum};');
    expect(compileNodeCommand('node --test test.cjs', [a, b]).semanticProof.inputHashes).toHaveProperty('lib.cjs', b.sha256);
  });

  it.each([
    'node --test ../outside.ts', 'node --test a.ts b.ts', 'node --test tests/salute.test.ts && echo ok',
    'node --import package tests/salute.test.ts', 'node --test C:/outside.ts',
    'node -e "console.log(process.env)"', 'node -e "const p=process;p.cwd()"',
    'node -e "require(\'node:fs\')"', 'node -e "import(\'package\')"',
    'node -e "const c=console;c.log(1)"', 'node -e "Object.getPrototypeOf(()=>1)"',
    'node -e "const {constructor:C}=String;C(\'return process\')()"',
    'node -e "const {[\'constructor\']:C}=String;C(\'return process\')()"',
    'node -e "Math.random()"', 'node -e "Date.now()"', 'node -e "import.meta.url"',
    'node -e "console.log(\'$HOME\')"',
  ])('rejects unsupported or observable declaration %s', command => {
    expect(() => compileNodeCommand(command, [library, test])).toThrow('NODE_COMMAND_UNSUPPORTED:');
  });

  it.each([
    'import {before} from "node:test"; before(()=>{});',
    'import test from "node:test"; test("x",{concurrency:true},()=>{});',
    'import test from "node:test"; test("x",{"timeout":10},()=>{});',
    'import test from "node:test"; test.run();',
    'const moduleCopy=module; moduleCopy.require("node:fs");',
    'const {run: execute}=require("node:test");execute();',
    'const {"constructor": C}=String;C("return process")();',
    'console.log("observed output");',
    'const x=import.meta.url;',
    'const x=require(process.argv[1]);',
  ])('does not certify a test with hidden context %s', text => {
    expect(() => compileNodeCommand('node --test test.cjs', [source('test.cjs', text)])).toThrow();
  });

  it('rejects missing, duplicate or mismatched frozen sources', () => {
    expect(() => compileNodeCommand('node --test tests/salute.test.ts', [test])).toThrow('SOURCE_MISSING');
    expect(() => compileNodeCommand('node --test tests/salute.test.ts', [test, test, library])).toThrow('SOURCE_IDENTITY');
    expect(() => compileNodeCommand('node --test tests/salute.test.ts', [{ ...test, sha256: '0'.repeat(64) }, library])).toThrow('SOURCE_IDENTITY');
  });

  it('refuses shell quote concatenation in either direction', () => {
    expect(() => tokenizeNodeDeclaration('node -e "console.log(1)"suffix')).toThrow('CONCATENATED_QUOTING');
    expect(() => tokenizeNodeDeclaration('node -e prefix"console.log(1)"')).toThrow('CONCATENATED_QUOTING');
  });

  it('checks a real inline.cjs import and rejects the reserved virtual entry', () => {
    expect(() => compileNodeCommand('node -e "require(\'./inline.cjs\')"',
      [source('inline.cjs', 'require("node:fs");')])).toThrow('DEPENDENCY');
    expect(() => compileNodeCommand('node -e "require(\'./__sf_verification_inline.cjs\')"', [])).toThrow('INLINE_INPUT_COLLISION');
  });
});
