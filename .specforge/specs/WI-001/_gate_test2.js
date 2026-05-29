const fs = require('fs');
const path = require('path');
const baseDir = 'D:/code/temp/SpecForge';
const filePath = path.join(baseDir, 'specforge', 'specs', 'WI-001', 'impact_analysis.md');
const content = fs.readFileSync(filePath, 'utf-8');

// Simulate Gate check
const requiredSections = ['变更范围', '风险评估', '回归测试范围', 'KG 关联'];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSections(content, requiredSections) {
  const sections = Object.create(null);
  for (const sectionName of requiredSections) {
    const escapedName = escapeRegExp(sectionName);
    const pattern = new RegExp('^#{2,3}\\s*' + escapedName + '\\s*$', 'im');
    const match = pattern.exec(content);
    if (match) {
      const startIdx = match.index + match[0].length;
      const nextHeadingPattern = /^#{1,3}\s+/m;
      const remaining = content.slice(startIdx);
      const nextMatch = nextHeadingPattern.exec(remaining);
      const sectionContent = nextMatch ? remaining.slice(0, nextMatch.index).trim() : remaining.trim();
      sections[sectionName] = sectionContent;
    } else {
      sections[sectionName] = '';
    }
  }
  return sections;
}

const sections = parseSections(content, requiredSections);
console.log('Parsed sections:');
for (const [name, value] of Object.entries(sections)) {
  console.log(`  "${name}": "${value.substring(0, 80)}..." (${value.length} chars)`);
}

const missing = requiredSections.filter(s => !sections[s]?.trim());
if (missing.length === 0) {
  console.log('\nGATE RESULT: PASS');
} else {
  console.log('\nGATE RESULT: FAIL - missing sections:', missing.join(', '));
}
