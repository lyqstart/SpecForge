const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const a=fs.readFileSync('C:/Users/lyq/.config/opencode/sf-user/bin/specforged.exe'),b=fs.readFileSync(path.resolve(__dirname,'../../../.wal-patched-a01/release/bin/specforged.exe'));
assert.equal(a.length,b.length);const regions=[];let count=0;
for(let i=0;i<a.length;i++){if(a[i]===b[i])continue;const start=i;while(i+1<a.length&&a[i+1]!==b[i+1])i++;const n=i-start+1;count+=n;regions.push({offset:start,bytes:n,installed_hex:a.subarray(start,Math.min(i+1,start+32)).toString('hex'),fresh_hex:b.subarray(start,Math.min(i+1,start+32)).toString('hex')});}
const pe=a.readUInt32LE(0x3c);assert.equal(a.toString('ascii',pe,pe+4),'PE\0\0');
const report={utc:new Date().toISOString(),bytes:a.length,total_different_bytes:count,region_count:regions.length,regions:regions.slice(0,100),complete_region_inventory:regions.length<=100,pe_offset:pe,coff_timestamp_offset:pe+8,optional_checksum_offset:pe+24+64,sha256:{installed:crypto.createHash('sha256').update(a).digest('hex'),fresh:crypto.createHash('sha256').update(b).digest('hex')},limits:'Byte locations only; no claim that unspecified differences are metadata.'};
fs.writeFileSync(path.join(__dirname,'daemon-build-differences.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
