const fs = require('fs');
const path = require('path');
const baseDir = 'D:/code/temp/SpecForge';
const filePath = path.join(baseDir, 'specforge', 'specs', 'WI-001', 'impact_analysis.md');
const content = fs.readFileSync(filePath, 'utf-8');

const sectionName = '变更范围';
const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp('^#{2,3}\\s*' + escapedName + '\\s*$', 'im');
const match = pattern.exec(content);

console.log('Match found at index:', match.index);
console.log('Match[0]:', JSON.stringify(match[0]));
console.log('match[0].length:', match[0].length);

const startIdx = match.index + match[0].length;
console.log('startIdx:', startIdx);
console.log('Content at startIdx (first 100 chars):', JSON.stringify(content.slice(startIdx, startIdx + 100)));

const remaining = content.slice(startIdx);
const nextHeadingPattern = /^#{1,3}\s+/m;
const nextMatch = nextHeadingPattern.exec(remaining);

console.log('\nNext heading match:', nextMatch ? 'FOUND at ' + nextMatch.index + ' => "' + nextMatch[0] + '"' : 'NOT FOUND');
console.log('Next heading index in remaining:', nextMatch ? nextMatch.index : 'N/A');

if (nextMatch) {
  const sectionContent = remaining.slice(0, nextMatch.index).trim();
  console.log('Section content length:', sectionContent.length);
  console.log('Section content preview:', JSON.stringify(sectionContent.substring(0, 200)));
}
