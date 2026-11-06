'use strict';const assert=require('node:assert/strict');assert.equal(2+2,4);const role=process.argv[1]||'0';console.log('SFRESOURCE_READY:'+JSON.stringify({kind:'memory',pid:process.pid,role}));
const blocks=[];for(;;)blocks.push(Buffer.alloc(16*1024*1024,0xa5));
