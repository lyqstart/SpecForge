const fs=require('node:fs'),path=require('node:path');const prior=path.resolve(__dirname,'../2026-11-04-winsock-isolation-diagnosis');
for(const file of ['cleanup-observation.cjs','verify-unaffected.cjs','cleanup-runtime-copies.cjs'])fs.copyFileSync(path.join(prior,file),path.join(__dirname,file),fs.constants.COPYFILE_EXCL);
console.log(JSON.stringify({prepared:'host cleanup, original identities, exact owned copy cleanup',inner_exit_code:0}));
