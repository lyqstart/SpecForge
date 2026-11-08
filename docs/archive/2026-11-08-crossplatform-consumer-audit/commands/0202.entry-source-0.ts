import fs from 'node:fs';import path from 'node:path';
import {renderDaemonHttpReferences} from './lib/daemon-http-reference';
const root=path.resolve(import.meta.dir,'..'),check=process.argv.includes('--check');let failed=false;
for(const [file,expected] of Object.entries(renderDaemonHttpReferences(root))){const current=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');if(current!==expected){if(check){console.error('HTTP_REFERENCE_DRIFT:'+file);failed=true;}else fs.writeFileSync(path.join(root,file),expected);}}
if(failed)process.exitCode=1;else console.log(check?'HTTP_REFERENCE_CURRENT':'HTTP_REFERENCE_RENDERED');
