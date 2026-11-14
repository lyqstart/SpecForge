import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  collectNodeCommandInputs,
  compileNodeCommand,
} from '../../src/verification/node-command-contract';

const file = 'docs/result.md',
  other = 'docs/other.md';
const command = (body: string) => `node -e "${body}"`;
const prefix = "const fs=require('fs');const t=fs.readFileSync('docs/result.md','utf8');";
const data = (name = file, content = '# Result\n你好 success') => ({
  path: name,
  content,
  sha256: createHash('sha256').update(content).digest('hex'),
});
const compile = (body: string) => compileNodeCommand(command(body), [data()], [file]);

describe('finite frozen UTF8 proof (compile only, not native acceptance)', () => {
  it('binds exact data bytes and original inline code without parsing Markdown as JS', () => {
    const body =
      prefix +
      "for(const k of ['你好','success']){if(!t.includes(k)){console.error('missing: '+k);process.exit(1)}};console.log('ok')";
    const plan = compile(body);
    expect(plan.contract).toBe('readonly-node-command/v4');
    expect(plan.semanticProof).toEqual({
      rule: 'single-process-frozen-utf8-read/v1',
      inputHashes: { [file]: data().sha256 },
    });
    expect(plan.inlineSource).toBe(body);
    expect(plan.argv).toEqual([
      '--no-addons',
      '--preserve-symlinks',
      '--preserve-symlinks-main',
      '-e',
      body,
    ]);
  });
  it('accepts literal node:fs and cross-document Boolean checks', () => {
    const body =
      prefix.replace("'fs'", "'node:fs'") +
      "const d=fs.readFileSync('docs/other.md','utf8');if(!t.includes('success')||!d.includes('你好')){console.error('missing');process.exit(1)}else{console.log('ok')}";
    expect(
      compileNodeCommand(command(body), [data(), data(other)], [file, other]).semanticProof
        .inputHashes
    ).toEqual({ [file]: data().sha256, [other]: data(other).sha256 });
  });
  it.each([
    'const x=fs;',
    'const {readFileSync}=fs;',
    'fs=console;',
    'fs.readFileSync=console.log;',
    "fs.writeFileSync('x','bad');",
    "fs.readdirSync('.');",
    'console.log(fs);',
    'console.log(process);',
    'console.log(t.constructor);',
    "console.log(t['constructor']);",
    'const f=t.includes;',
    "const x=require('node:os');",
    "console.log?.('x');",
    "console['error']('x');",
    "console.log(...['x']);",
    'process.exit(t);',
    "for(let k of ['x']){console.log(k)}",
    'for(const k of t){console.log(k)}',
    "for(const k of ['x']){k='y'}",
    'while(true){}',
    'function f(){return t}',
    'const x=()=>t;',
    'throw t;',
    'try{}catch(e){}',
    "const process='x';",
    "const console='x';",
    "const require='x';",
    'const x={value:fs};',
    "if(t.includes('x')){const t='y'}",
    'console.log(globalThis);',
    "console.log(eval('x'));",
    "const x=fs.readFileSync('docs/result.md', 'hex');",
    "const p='docs/result.md';const x=fs.readFileSync(p,'utf8');",
    "const x=fs?.readFileSync('docs/result.md','utf8');",
    "const x=fs.readFileSync('docs/result.md','utf8',{});",
    "const x=fs.readFileSync('docs/unapproved.md','utf8');",
  ])('rejects unsupported semantics: %s', suffix => {
    expect(() => compile(prefix + suffix)).toThrow();
  });
  it.each([
    '../outside.md',
    '/absolute.md',
    'C:/outside.md',
    'docs/./x.md',
    'docs//x.md',
    'docs/NUL',
    'docs/x.',
    '.git/config',
    '.specforge/project/x.md',
    'node_modules/x.md',
    '.ssh/key',
    '.aws/config',
    '.config/key',
    '.opencode/key',
    '.env',
    '.env.local',
    'auth.json',
    'credentials.json',
    'host-profile.json',
    'opencode.jsonc',
  ])('rejects protected or ambiguous path even when allowlisted: %s', name => {
    const body = `const fs=require('fs');const t=fs.readFileSync('${name}','utf8');console.log(t)`;
    expect(() => compileNodeCommand(command(body), [data(name)], [name])).toThrow();
  });
  it('requires permission, exact inputs and valid identities', () => {
    expect(() => compileNodeCommand(command(prefix), [data()])).toThrow();
    expect(() => compileNodeCommand(command(prefix), [data()], ['DOCS/RESULT.MD'])).toThrow();
    expect(() =>
      compileNodeCommand(command(prefix), [data(), data(other)], [file, other])
    ).toThrow();
    expect(() => compileNodeCommand(command(prefix), [data(), data()], [file])).toThrow();
    expect(() =>
      compileNodeCommand(command(prefix), [{ ...data(), sha256: 'a'.repeat(64) }], [file])
    ).toThrow();
    expect(() => compileNodeCommand(command(prefix), [data(file, '\ud800')], [file])).toThrow();
    expect(() =>
      compileNodeCommand(command(prefix), [data(file, 'x'.repeat(16 * 1024 * 1024 + 1))], [file])
    ).toThrow();
  });
  it('proves every data edge before invoking the physical reader', async () => {
    const reader = vi.fn(async () => Buffer.from('ok'));
    await expect(
      collectNodeCommandInputs(
        '/synthetic',
        command(prefix + "const x=fs.readFileSync('docs/unapproved.md','utf8');"),
        [file],
        reader,
        [file]
      )
    ).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    await expect(
      collectNodeCommandInputs('/synthetic', command(prefix), [], reader, [file])
    ).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
  });
  it('rejects malformed UTF8 rather than accepting replacement characters', async () => {
    const reader = vi.fn(async () => Buffer.from([0xc0, 0xaf]));
    await expect(
      collectNodeCommandInputs('/synthetic', command(prefix), [file], reader, [file])
    ).rejects.toThrow('SOURCE_ENCODING');
  });
  it('deduplicates repeated literal reads and selects only the approved data graph', async () => {
    const reader = vi.fn(async () => Buffer.from(data().content));
    const result = await collectNodeCommandInputs(
      '/synthetic',
      command(prefix + "const second=fs.readFileSync('docs/result.md','utf8');"),
      [file, other, 'package.json'],
      reader,
      [file]
    );
    expect(result.inputPaths).toEqual([file]);
    expect(result.sources).toEqual([data()]);
    expect(reader).toHaveBeenCalledTimes(1);
  });
  it('leaves old inline canonical output unchanged', () => {
    const original = command("console.log('ok')");
    expect(compileNodeCommand(original, [], [file])).toEqual(compileNodeCommand(original, []));
    expect(compileNodeCommand(original, []).contract).toBe('readonly-node-command/v1');
  });
  it('keeps special object-key filenames as owned hash entries', () => {
    const body =
      "const fs=require('fs');const t=fs.readFileSync('__proto__','utf8');console.log(t)";
    const plan = compileNodeCommand(command(body), [data('__proto__')], ['__proto__']);
    expect(Object.keys(plan.semanticProof.inputHashes)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(plan.semanticProof.inputHashes)).toBe(Object.prototype);
    expect(plan.semanticProof.inputHashes['__proto__']).toBe(data().sha256);
  });
});
