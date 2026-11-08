import {describe,it,expect} from 'vitest';import {readFileSync,existsSync} from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../..'),read=(p:string)=>readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n');
describe('current cross-platform CI deployment contract',()=>{
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
    expect(quality).toContain('scripts/build-workspace.ts');
    expect(quality).toContain('scripts/test-workspace.ts');
    expect(quality.indexOf('scripts/build-workspace.ts')).toBeLessThan(quality.indexOf('scripts/test-workspace.ts'));
  });
  it('configures Windows long paths before checkout and keeps historical evidence outside source EOL checks',()=>{
    for(const file of ['.github/workflows/distribution-smoke.yml','.github/workflows/code-quality.yml']){
      const t=read(file),configure=t.indexOf('core.longpaths'),checkout=t.indexOf('uses: actions/checkout');
      expect(configure,file).toBeGreaterThanOrEqual(0);expect(configure,file).toBeLessThan(checkout);
    }
    expect(read('.github/workflows/code-quality.yml')).toContain(':(exclude)docs/archive/**');
  });
});
