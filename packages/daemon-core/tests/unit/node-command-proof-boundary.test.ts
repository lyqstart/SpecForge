import { describe, expect, it } from 'vitest';
import { compileNodeCommand } from '../../src/verification/node-command-contract';
import { createHash } from 'node:crypto';

describe('single-file semantic certificate host boundary', () => {
  it.each([
    "const get=Object.getOwnPropertyDescriptor(Object,'getPrototypeOf').value;const F=Object.getOwnPropertyDescriptor(get(String),'constructor').value;console.log(F('return process')().cwd());",
    'function unused(process){};const p=process;console.log(p.cwd());',
    "function unused(console){};const c=console;c.log('x');",
    'const C=class {};',
    'function unused(URL){};console.log(URL.name);',
    "function unused(process){};const stolen={process};console.log(stolen.process.cwd());",
  ])('rejects reflection and scope-name laundering without executing it: %s', source => {
    expect(() => compileNodeCommand(`node -e "${source}"`, [])).toThrow('NODE_COMMAND_UNSUPPORTED:');
  });
  it('does not turn ambient or type-only declarations into runtime values', () => {
    for(const content of ['declare const URL:any;URL.canParse("x");','import type {URL} from "./types.ts";URL.canParse("x");']) {
      const source={path:'test.ts',content,sha256:createHash('sha256').update(content).digest('hex')};
      expect(()=>compileNodeCommand('node --test test.ts',[source])).toThrow('NODE_COMMAND_UNSUPPORTED:');
    }
  });
});
