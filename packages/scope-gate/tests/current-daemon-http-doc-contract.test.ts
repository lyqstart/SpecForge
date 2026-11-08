import {readFileSync} from 'node:fs';import path from 'node:path';

import {describe,it,expect} from 'vitest';

import {collectDaemonHttpReference,renderDaemonHttpReferences} from '../../../scripts/lib/daemon-http-reference';
const root=path.resolve(import.meta.dirname,'../../..');
describe('current Daemon HTTP documentation consumer',()=>{
 it('matches the exact registered route and static error-code owners',()=>{for(const [file,text] of Object.entries(renderDaemonHttpReferences(root)))expect(readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),file).toBe(text);});
 it('resolves controlled Project Init and excludes unregistered legacy routes',()=>{const {routes,codes}=collectDaemonHttpReference(root);expect(routes.find(r=>r.path==='/api/v1/project/ensure')).toMatchObject({method:'POST',handler:'handleProjectEnsure'});expect(codes.some(c=>c.code==='INVALID_JSON')).toBe(true);expect(routes.some(r=>r.path==='/session/create')).toBe(false);});
});
