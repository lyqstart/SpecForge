const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const file=path.join(process.env.SystemRoot,'System32','ws2_32.dll'),raw=fs.readFileSync(file);
const pe=raw.readUInt32LE(60),count=raw.readUInt16LE(pe+6),optional=pe+24,sections=optional+raw.readUInt16LE(pe+20);
if(raw.readUInt32LE(pe)!==0x4550||raw.readUInt16LE(optional)!==0x20b||count>96)throw Error('PE');
const offset=rva=>{for(let i=0;i<count;i++){const s=sections+i*40,start=raw.readUInt32LE(s+12),size=raw.readUInt32LE(s+16);if(rva>=start&&rva-start<size)return raw.readUInt32LE(s+20)+rva-start;}throw Error('RVA');};
const ascii=at=>{const end=raw.indexOf(0,at);if(end<at||end-at>4096)throw Error('STRING');return raw.subarray(at,end).toString('ascii');};
const imports=[];let descriptor=offset(raw.readUInt32LE(optional+120));
for(let n=0;n<256;n++,descriptor+=20){const name=raw.readUInt32LE(descriptor+12);if(!name)break;const library=ascii(offset(name)),lookup=raw.readUInt32LE(descriptor)||raw.readUInt32LE(descriptor+16);let t=offset(lookup);
 for(let i=0;i<65536;i++,t+=8){const value=raw.readBigUInt64LE(t);if(value===0n)break;if(value>>63n)continue;const symbol=ascii(offset(Number(value))+2);if(/RegOpen|RegQuery|RegClose|NtOpen|NtQuery|GetLastError/i.test(symbol))imports.push({library,symbol});}
}
const result={utc:new Date().toISOString(),file,sha256:crypto.createHash('sha256').update(raw).digest('hex'),method:'Read-only PE import parsing; no DLL execution',imports,inner_exit_code:0};
fs.writeFileSync(path.join(__dirname,'winsock-imports.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));
