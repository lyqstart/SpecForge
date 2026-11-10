import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fc from 'fast-check';
import {
  compileNodeCommand,
  type FrozenNodeSource,
} from '../../src/verification/node-command-contract';

const frozen = (path: string, content: string): FrozenNodeSource => ({
  path,
  content,
  sha256: createHash('sha256').update(content).digest('hex'),
});
const library = frozen(
  'core.cjs',
  'function calculate(value){return value+1;} module.exports={calculate};'
);
const source = `const {test}=require('node:test');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {calculate}=require('./core.cjs');
test('bounded sync call',()=>{
  const input=41;
  const start=performance.now();
  const result=calculate(input);
  const elapsed=performance.now()-start;
  assert.ok(elapsed<=50);
  assert.equal(result,42);
});`;
const compile = (text = source, dependency = library, name = 'timed.cjs') =>
  compileNodeCommand('node --test ' + name, [frozen(name, text), dependency]);

describe('bounded monotonic interval proof (compilation only; no LPAC acceptance claim)', () => {
  it('versions the exact finite interval while preserving original source, argv and full graph', () => {
    const p = compile();
    expect(p.contract).toBe('readonly-node-command/v2');
    expect(p.semanticProof).toEqual({
      rule: 'single-file-bounded-monotonic-observation/v1',
      inputHashes: { 'timed.cjs': frozen('timed.cjs', source).sha256, 'core.cjs': library.sha256 },
    });
    expect(p.argv).toEqual([
      '--no-addons',
      '--preserve-symlinks',
      '--preserve-symlinks-main',
      '--test-reporter=tap',
      '--test',
      '--test-isolation=none',
      'timed.cjs',
    ]);
    expect(p.inlineSource).toBeNull();
    expect(p.original).toBe('node --test timed.cjs');
  });
  it('is independent of business names, numeric threshold and variable spellings', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 120000 }),
        fc.integer({ min: 0, max: 10000 }),
        (limit, suffix) => {
          const renamed = source
            .replaceAll('start', 'begin' + suffix)
            .replaceAll('elapsed', 'duration' + suffix)
            .replaceAll('calculate', 'operation' + suffix)
            .replace('<=50', '<=' + limit);
          const dep = frozen(
            'core.cjs',
            library.content.replaceAll('calculate', 'operation' + suffix)
          );
          expect(compile(renamed, dep).semanticProof.rule).toBe(
            'single-file-bounded-monotonic-observation/v1'
          );
        }
      ),
      { seed: 20261110, numRuns: 40 }
    );
  });
  it.each([
    ['global clock', s => s.replace("const {performance}=require('node:perf_hooks');", '')],
    ['absolute clock', s => s.replaceAll('performance.now()', 'Date.now()')],
    ['time origin', s => s.replace('performance.now()-start', 'performance.timeOrigin-start')],
    [
      'clock alias',
      s =>
        s.replace(
          'const start=performance.now();',
          'const clock=performance; const start=clock.now();'
        ),
    ],
    [
      'method alias',
      s =>
        s.replace(
          'const start=performance.now();',
          'const now=performance.now; const start=now();'
        ),
    ],
    [
      'binding alias',
      s =>
        s
          .replace('{performance}', '{performance: clock}')
          .replaceAll('performance.now', 'clock.now'),
    ],
    ['extra clock member', s => s.replace('{performance}', '{performance,monitorEventLoopDelay}')],
    ['clock arguments', s => s.replace('performance.now()', 'performance.now(1)')],
    ['optional clock receiver', s => s.replace('performance.now()', 'performance?.now()')],
    ['optional clock call', s => s.replace('performance.now()', 'performance.now?.()')],
    ['optional measured call', s => s.replace('calculate(input)', 'calculate?.(input)')],
    ['optional test call', s => s.replace("test('bounded", "test?.('bounded")],
    ['optional threshold assertion', s => s.replace('assert.ok(elapsed', 'assert.ok?.(elapsed')],
    ['optional result assertion', s => s.replace('assert.equal(result', 'assert?.equal(result')],
    ['extra reading', s => s.replace('const input=41;', 'const input=41; performance.now();')],
    [
      'start escapes',
      s => s.replace('assert.equal(result,42);', 'assert.equal(result,42); const leaked={start};'),
    ],
    ['duration escapes', s => s.replace('assert.equal(result,42);', 'assert.equal(elapsed,0);')],
    [
      'captured clock',
      s => s.replace('const input=41;', 'const input=41; const hidden=()=>performance.now();'),
    ],
    [
      'shadowed clock',
      s =>
        s.replace(
          'const input=41;',
          'const input=41; function fake(performance){return performance.now();}'
        ),
    ],
    ['swapped subtraction', s => s.replace('performance.now()-start', 'start-performance.now()')],
    ['fabricated duration', s => s.replace('performance.now()-start', '0')],
    ['loose comparison', s => s.replace('elapsed<=50', 'elapsed>=50')],
    ['threshold computed', s => s.replace('elapsed<=50', 'elapsed<=25+25')],
    ['threshold zero', s => s.replace('elapsed<=50', 'elapsed<=0')],
    ['threshold over budget', s => s.replace('elapsed<=50', 'elapsed<=120001')],
    [
      'assertion optional',
      s => s.replace('assert.ok(elapsed<=50);', 'if(false){assert.ok(elapsed<=50);}'),
    ],
    [
      'interleaved statement',
      s =>
        s.replace('const result=calculate(input);', 'const result=calculate(input); const gap=1;'),
    ],
    ['nested call', s => s.replace('calculate(input)', 'calculate(Number(input))')],
    [
      'multiple measured calls',
      s => s.replace('calculate(input)', 'calculate(input)+calculate(input)'),
    ],
    ['async callback', s => s.replace("call',()=>{", "call',async()=>{")],
    ['context callback', s => s.replace("call',()=>{", "call',(context)=>{")],
    ['test options', s => s.replace("call',()=>{", "call',{skip:true},()=>{")],
    ['test escapes', s => s.replace('const input=41;', 'const input=41; const alias=test;')],
    ['assert replaced', s => s.replace('const input=41;', 'const input=41; assert.ok=()=>true;')],
    ['assert alias', s => s.replace('const input=41;', 'const input=41; const alias=assert;')],
    [
      'second assert import',
      s =>
        s.replace('const input=41;', "const input=41; const extra=require('node:assert/strict');"),
    ],
    [
      'require shadow',
      s => s.replace('const input=41;', 'const input=41; function unused(require){}'),
    ],
    ['mutable start', s => s.replace('const start=', 'let start=')],
    ['mutable core import', s => s.replace('const {calculate}', 'let {calculate}')],
    [
      'dynamic module',
      s => s.replace("require('node:perf_hooks')", "require('node:'+'perf_hooks')"),
    ],
    ['reflection', s => s.replace('calculate(input)', 'calculate.constructor(input)')],
  ] satisfies [string, (s: string) => string][])(
    'rejects %s without executing source',
    (_name, change) => {
      expect(() => compile(change(source))).toThrow('NODE_COMMAND_UNSUPPORTED:');
    }
  );
  it('does not extend inline, ESM, dependency clocks or transitive builtin mutation', () => {
    expect(() => compile(source, library, 'timed.js')).toThrow();
    expect(() =>
      compileNodeCommand(`node -e "${source.replaceAll('\n', ' ')}"`, [library])
    ).toThrow();
    expect(() =>
      compile(
        source,
        frozen(
          'core.cjs',
          "const a=require('node:assert/strict');a.ok=()=>{};function calculate(value){return value+1;}module.exports={calculate};"
        )
      )
    ).toThrow();
    expect(() =>
      compile(
        source,
        frozen(
          'core.cjs',
          "const {performance}=require('node:perf_hooks');function calculate(value){return performance.now();}module.exports={calculate};"
        )
      )
    ).toThrow();
  });
  it.each([
    'function* calculate(n){let total=0;for(let i=0;i<n;i++){total+=i;}return total;}module.exports={calculate};',
    'function calculate(n){return import("./deferred.cjs");}module.exports={calculate};',
    'function calculate(n){return Array.fromAsync([n]);}module.exports={calculate};',
    'const {fromAsync:calculate}=Array;module.exports={calculate};',
    'const {"fromAsync":calculate}=Array;module.exports={calculate};',
    'const worker={*calculate(n){return n;}};module.exports=worker;',
  ])('does not time deferred bodies as completed synchronous work: %s', content => {
    expect(() =>
      compileNodeCommand('node --test timed.cjs', [
        frozen('timed.cjs', source),
        frozen('core.cjs', content),
        frozen('deferred.cjs', 'module.exports={value:42};'),
      ])
    ).toThrow('NODE_COMMAND_UNSUPPORTED:');
  });
  it('leaves legacy no-clock and static proofs in their exact v1 contract', () => {
    const plain =
      "const {test}=require('node:test');const assert=require('node:assert/strict');test('plain',()=>assert.equal(1,1));";
    const p = compileNodeCommand('node --test plain.cjs', [frozen('plain.cjs', plain)]);
    expect(p).toEqual({
      contract: 'readonly-node-command/v1',
      original: 'node --test plain.cjs',
      kind: 'node-test-file',
      entry: 'plain.cjs',
      inlineSource: null,
      argv: [
        '--no-addons',
        '--preserve-symlinks',
        '--preserve-symlinks-main',
        '--test-reporter=tap',
        '--test',
        '--test-isolation=none',
        'plain.cjs',
      ],
      semanticProof: {
        rule: 'single-file-no-host-observation/v1',
        inputHashes: { 'plain.cjs': frozen('plain.cjs', plain).sha256 },
      },
    });
    expect(compileNodeCommand('node -e "const text=\'node:perf_hooks\';"', []).contract).toBe(
      'readonly-node-command/v1'
    );
    expect(compileNodeCommand('test -f core.cjs', [library]).contract).toBe(
      'readonly-node-command/v1'
    );
  });
});
