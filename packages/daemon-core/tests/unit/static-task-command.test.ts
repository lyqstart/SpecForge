/** Actual ordinary Node executions below verify normalization only, not LPAC/product acceptance. */
import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {compileNodeCommand} from '../../src/verification/node-command-contract';
const file=(path:string,content:string)=>({path,content,sha256:createHash('sha256').update(content).digest('hex')});
function execute(command:string,content:string,path='input.md'){
  const plan=compileNodeCommand(command,[file(path,content)]);
  expect(plan.semanticProof.rule).toBe('finite-posix-readonly-predicate/v1');
  return spawnSync(process.execPath,plan.argv,{encoding:'utf8',windowsHide:true,timeout:3000,maxBuffer:1048576});
}
describe('finite readonly static Task normalization',()=>{
 it('retains BRE literal parentheses/braces, wildcard dots and exact line counts',()=>{
  const result=execute('grep -c "greet(name: string): string" input.md','greet(name: string): string\ngreet(name: string): string\n');
  expect(result.status).toBe(0);expect(result.stdout).toBe('2\n');
  expect(execute('grep -c \'"dependencies": {}\' input.md','"dependencies": {}\n').status).toBe(0);
  expect(execute('grep -c "a.b" input.md','a-b\n').status).toBe(0);
 });
 it('counts matching lines once across ERE alternatives and accepts escaped literal metacharacters',()=>{
  const r=execute('grep -cE "Ada|Grace" input.md','Ada Grace\nGrace\nnone\n');expect(r.status).toBe(0);expect(r.stdout).toBe('2\n');
  expect(execute('! grep -qE "^import |^import\\{|require\\(" input.md','export function f(){}\n').status).toBe(0);
  expect(execute('! grep -qE "^import |^import\\{|require\\(" input.md','const x=require("x");\n').status).toBe(1);
 });
 it('retains grep empty/final-line/CRLF/quiet/negative exit and output behavior',()=>{
  for(const text of ['', 'missing\n']){const r=execute('grep -c "found" input.md',text);expect(r.status).toBe(1);expect(r.stdout).toBe('0\n');}
  expect(execute('grep -c "found" input.md','found').stdout).toBe('1\n');
  expect(execute('grep -c \'found$\' input.md','found\r\n').status).toBe(1);
  const q=execute('grep -q "found" input.md','found\n');expect(q.status).toBe(0);expect(q.stdout).toBe('');
 });
 it('freezes the entire conjunction file set and does not execute any shell',()=>{
  const sources=[file('package.json','{}\n'),file('tsconfig.json','{}\n')];
  const p=compileNodeCommand('test -f package.json && test -f tsconfig.json',sources);expect(p.semanticProof.inputHashes).toHaveProperty('tsconfig.json');
  expect(spawnSync(process.execPath,p.argv,{windowsHide:true}).status).toBe(0);
  expect(()=>compileNodeCommand(p.original,[sources[0]!])).toThrow('STATIC_INPUT_SET');
 });
 it('does not execute shell-looking file content or read any extra input',()=>{
  const r=execute('grep -c "literal" input.md','literal $(process.exit(99)) `exit 88`\n');expect(r.status).toBe(0);expect(r.stdout).toBe('1\n');
  expect(()=>compileNodeCommand('grep -c "x" input.md',[file('input.md','x'),file('secret.json','do not read')])).toThrow('STATIC_INPUT_SET');
 });
 it.each(['grep -c "a*a*a*b" input.md','grep -cE "(a+)+" input.md','grep -c "$HOME" input.md','grep -c "x" input.md > out.md','grep -c "x" ../input.md','test -f input.md && node evil.cjs','grep -c "x" .specforge/state.json','grep -cE "a||b" input.md','! grep -c "x" input.md','grep -c "x" input.md; echo evil'])('rejects unknown or dangerous declaration %s',command=>{
  expect(()=>compileNodeCommand(command,[file('input.md','text')])).toThrow();
 });
 it('rejects locale-dependent counts and changed raw identities',()=>{
  expect(()=>compileNodeCommand('grep -c "^.$" input.md',[file('input.md','é\n')])).toThrow('STATIC_LOCALE_AMBIGUITY');
  expect(()=>compileNodeCommand('grep -c "x" input.md',[{...file('input.md','x'),sha256:'0'.repeat(64)}])).toThrow('STATIC_SOURCE_IDENTITY');
 });
 it('rejects double-quoted shell backslash transformations instead of certifying another pattern',()=>{
  for(const pattern of [String.fromCharCode(92).repeat(2),String.fromCharCode(92)+'$']){
   expect(()=>compileNodeCommand('grep -qE "'+pattern+'" input.md',[file('input.md','literal\n')])).toThrow();
  }
 });
});
