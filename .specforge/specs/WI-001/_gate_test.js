const fs = require('fs');
const path = require('path');
const baseDir = 'D:/code/temp/SpecForge';
const specDir = path.join(baseDir, 'specforge', 'specs', 'WI-001');
const filePath = path.join(specDir, 'impact_analysis.md');
const content = fs.readFileSync(filePath, 'utf-8');
const sections = ['变更范围', '风险评估', '回归测试范围', 'KG 关联'];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const s of sections) {
  const escapedName = escapeRegExp(s);
  const pat = new RegExp('^#{2,3}\\s*' + escapedName + '\\s*$', 'im');
  const m = pat.exec(content);
  console.log(s + ':', m ? 'FOUND at ' + m.index + ' => "' + m[0] + '"' : 'NOT FOUND');
}
