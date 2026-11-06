'use strict';const assert=require('node:assert/strict');assert.equal(2+2,4);const role=process.argv[1]||'0';console.log('SFRESOURCE_READY:'+JSON.stringify({kind:'output',pid:process.pid,role}));
const fs=require('node:fs'),b=Buffer.alloc(65536,0x58);for(;;)fs.writeSync(1,b);
