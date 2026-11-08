const fs=require('node:fs'),path=require('node:path');
const [directory,name,rule='all',scope='all']=process.argv.slice(2);
const raw=path.join(__dirname,directory,name+'.stdout.raw'),payload=JSON.parse(fs.readFileSync(fs.existsSync(raw)?raw:path.join(__dirname,directory,name+'.json')));
for(const f of payload.results){if(scope==='src'&&!f.filePath.replaceAll('\\','/').includes('/src/'))continue;
const lines=(f.output??f.source??fs.readFileSync(f.filePath,'utf8')).split(/\r?\n/);
for(const m of f.messages)if(rule==='all'||m.ruleId?.includes(rule))console.log(JSON.stringify({file:path.relative(path.resolve('.lint-review-a01'),f.filePath).replaceAll('\\','/'),line:m.line,column:m.column,rule:m.ruleId,message:m.message,source:lines[m.line-1]}));}
