const assert=require('node:assert/strict'),crypto=require('node:crypto');const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function normalized(bytes){
 const b=Buffer.from(bytes),pe=b.readUInt32LE(0x3c);assert.equal(b.toString('ascii',pe,pe+4),'PE\0\0');const sections=b.readUInt16LE(pe+6),optional=pe+24,size=b.readUInt16LE(pe+20),magic=b.readUInt16LE(optional);assert([0x10b,0x20b].includes(magic));
 function rva(value){for(let i=0;i<sections;i++){const s=optional+size+i*40,v=b.readUInt32LE(s+12),n=Math.max(b.readUInt32LE(s+8),b.readUInt32LE(s+16));if(value>=v&&value<v+n)return b.readUInt32LE(s+20)+value-v;}throw Error('RVA_OUTSIDE_SECTION');}
 const directory=optional+(magic===0x20b?112:96),clr=rva(b.readUInt32LE(directory+14*8)),metadata=rva(b.readUInt32LE(clr+8));assert.equal(b.readUInt32LE(metadata),0x424a5342);
 const afterVersion=metadata+16+b.readUInt32LE(metadata+12),count=b.readUInt16LE(afterVersion+2),streams={};let cursor=afterVersion+4;
 for(let i=0;i<count;i++){const offset=b.readUInt32LE(cursor),size=b.readUInt32LE(cursor+4),end=b.indexOf(0,cursor+8),name=b.toString('ascii',cursor+8,end);streams[name]={offset:metadata+offset,size};cursor=(end+4)&~3;}
 assert.equal(streams['#GUID'].size,16,'ONLY_ONE_MODULE_MVID_REQUIRED');const g=streams['#GUID'].offset,hex=b.subarray(g,g+16).toString('hex');const guid=[hex.slice(0,8).match(/../g).reverse().join(''),hex.slice(8,12).match(/../g).reverse().join(''),hex.slice(12,16).match(/../g).reverse().join(''),hex.slice(16,20),hex.slice(20)].join('-').toUpperCase();
 const strings=streams['#Strings'],prefix='<PrivateImplementationDetails>{',needle=Buffer.from(prefix+guid+'}\0'),index=b.indexOf(needle,strings.offset);assert(index>=strings.offset&&index+needle.length<=strings.offset+strings.size,'GENERATED_TYPE_MVID_BINDING');assert.equal(b.indexOf(needle,index+1),-1);
 const regions=[{kind:'COFF TimeDateStamp',offset:pe+8,bytes:4},{kind:'Module MVID',offset:g,bytes:16},{kind:'compiler-generated private type MVID suffix',offset:index+prefix.length,bytes:36}];for(const r of regions)b.fill(0,r.offset,r.offset+r.bytes);
 return {hash:sha(b),regions,module_mvid:guid};
}
module.exports=normalized;
