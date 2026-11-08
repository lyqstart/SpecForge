import {describe,it,expect} from 'vitest';
import {reviewRaceTimers,reviewPathLiterals} from '../../../scripts/lint/source-policy';
describe('syntax-aware source audit boundaries',()=>{
 it('rejects a genuine losing timer, including one created before the race',()=>{
  expect(reviewRaceTimers('async function f(){let timer;const timeout=new Promise(r=>{timer=setTimeout(r,30)});return await Promise.race([fetch("x"),timeout]);}')).toHaveLength(1);
  expect(reviewRaceTimers('async function f(){try{return await Promise.race([fetch("x"),new Promise(r=>setTimeout(r,30))]);}finally{cleanup();}}')).toHaveLength(1);
 });
 it('requires cleanup of every owned timer on the overall race, not the losing promise',()=>{
  expect(reviewRaceTimers('async function f(){let t;const p=new Promise(r=>{t=setTimeout(r,30)}).finally(()=>clearTimeout(t));return await Promise.race([fetch("x"),p]);}')).toHaveLength(1);
 });
 it('accepts outer cleanup beyond a line window and ignores comments/strings',()=>{
  expect(reviewRaceTimers('async function f(){let t;try{await Promise.race([fetch("x"),new Promise(r=>{t=setTimeout(r,30)})]);'+ '\n'.repeat(80)+'}finally{clearTimeout(t);}}')).toHaveLength(0);
  expect(reviewRaceTimers('/** Promise.race setTimeout */ const s="Promise.race setTimeout";')).toHaveLength(0);
 });
 it('rejects real path literals while preserving command names and comments',()=>{
  expect(reviewPathLiterals('const p=join(projectRoot,".specforge","project");')).toHaveLength(1);
  expect(reviewPathLiterals('const p=join(projectRoot,"specforge","project");')).toHaveLength(1);
  expect(reviewPathLiterals('const p=".specforge/project/state.json";')).toHaveLength(1);
  expect(reviewPathLiterals('const command="specforge"; // ".specforge"\nconst p=join(root,SPEC_DIR_NAME,"project");')).toHaveLength(0);
 });
});
