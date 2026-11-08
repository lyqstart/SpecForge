import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {describe,it,expect} from 'vitest';

import { qualifyTemporaryEnvironment } from '../../../scripts/lib/qualification-environment.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),read=(p:string): string =>readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
describe('current cross-platform CI deployment contract',()=>{
  it('uses the same physical temporary target through an owned alias without changing product guards',()=>{
    const parent=realpathSync(tmpdir()),owned=mkdtempSync(path.join(parent,'sf-qualification-temp-')),physical=path.join(owned,'physical'),alias=path.join(owned,'alias');
    try {
      mkdirSync(physical);symlinkSync(physical,alias,process.platform==='win32'?'junction':'dir');
      const result=qualifyTemporaryEnvironment(alias);
      expect(result.canonical).toBe(realpathSync(physical));
      expect(result.environment).toEqual({TMPDIR:result.canonical,TEMP:result.canonical,TMP:result.canonical});
      expect(result.ancestors.some(item=>item.path===alias&&item.kind==='symlink')).toBe(true);
      expect(()=>qualifyTemporaryEnvironment(path.join(owned,'missing'))).toThrow();
      for(const file of ['scripts/test-workspace.ts','scripts/run-root-tests.mjs','scripts/run-ci-regression.mjs'])expect(read(file),file).toContain('...temporary.environment');
    } finally {
      if(realpathSync(owned)!==owned||path.dirname(owned)!==parent||!path.basename(owned).startsWith('sf-qualification-temp-'))throw new Error('UNOWNED_TEMP_CLEANUP');
      rmSync(owned,{recursive:true,force:true});
    }
  });
  it('uses the official current release and isolated userlevel installer instead of retired tarball deployment',()=>{
    const workflow=read('.github/workflows/distribution-smoke.yml');
    expect(workflow).not.toContain('scripts/smoke-runner.ts');
    expect(workflow).not.toContain('bun pack');
    expect(workflow).toContain('scripts/verify-platform-release.ts');
    expect(existsSync(path.join(root,'scripts/verify-platform-release.ts'))).toBe(true);
    for(const os of ['windows-latest','macos-latest','ubuntu-latest'])expect(workflow).toContain(os);
  });
  it('builds current workspace packages before their tests and never restores disabled packages through a wildcard',()=>{
    const quality=read('.github/workflows/code-quality.yml');
    expect(quality).not.toContain('for pkg in packages/*/');
    const carrier=read('scripts/run-ci-regression.mjs');
    expect(carrier).toContain("build: ['scripts/prepare-current-release.ts']");
    expect(carrier).toContain("workspace: ['scripts/test-workspace.ts']");
    expect(carrier).toContain("root: ['run', 'test:root']");
    expect(carrier).toContain("lint: ['run', 'lint']");
    const phases=[...quality.matchAll(/run: node scripts\/run-ci-regression\.mjs (build|lint|workspace|root)/g)].map(match=>match[1]);
    expect(phases).toEqual(['build','lint','workspace','root']);
    for(const os of ['windows-latest','macos-latest','ubuntu-latest'])expect(quality).toContain(os);
    expect(carrier).toContain('CI_SOURCE_DIRTY_BEFORE_PHASE');
    expect(quality).toContain('actions/upload-artifact@v4');
  });
  it('configures Windows long paths before checkout and keeps historical evidence outside source EOL checks',()=>{
    for(const file of ['.github/workflows/distribution-smoke.yml','.github/workflows/code-quality.yml']){
      const t=read(file),configure=t.indexOf('core.longpaths'),checkout=t.indexOf('uses: actions/checkout');
      expect(configure,file).toBeGreaterThanOrEqual(0);expect(configure,file).toBeLessThan(checkout);
    }
    expect(read('.github/workflows/code-quality.yml')).toContain(':(exclude)docs/archive/**');
  });
});
