'use strict';const assert=require('node:assert/strict');assert.equal(2+2,4);const role=process.argv[1]||'0';console.log('SFRESOURCE_READY:'+JSON.stringify({kind:'daemon-crash',pid:process.pid,role}));
assert.throws(()=>process.dlopen({exports:{}},'SYNTHETIC-UNAVAILABLE.node'),e=>e.code==='ERR_DLOPEN_DISABLED');setInterval(()=>{},1000);
