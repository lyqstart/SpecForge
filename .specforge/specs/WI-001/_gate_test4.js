const fs = require('fs');
const path = require('path');
const baseDir = 'D:/code/temp/SpecForge';
const content = fs.readFileSync(path.join(baseDir, 'specforge', 'specs', 'WI-001', 'impact_analysis.md'), 'utf-8');

// Fix: use /^#{1,2}\s+/m instead of /^#{1,3}\s+/m
// This way ### (h3) won't terminate a ## section
const requiredSections = ['变更范围', '风险评估', '回归测试范围', 'KG 关联'];

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSectionsFixed(content, requiredSections) {
  const sections = Object.create(null);
  for (const sectionName of requiredSections) {
    const escapedName = escapeRegExp(sectionName);
    const pattern = new RegExp('^#{2,3}\\s*' + escapedName + '\\s*$', 'im');
    const match = pattern.exec(content);
    if (match) {
      const startIdx = match.index + match[0].length;
      // FIX: use #{1,2} to only match h1/h2 level headings (same or higher level)
      // instead of #{1,3} which incorrectly matches h3 subsections
      const nextHeadingPattern = /^#{1,2}\s+/m;
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

const sections = parseSectionsFixed(content, requiredSections);
console.log('Parsed sections (fixed):');
for (const [name, value] of Object.entries(sections)) {
  console.log(`  "${name}": ${value.length} chars, preview: "${value.substring(0, 80)}..."`);
}

const missing = requiredSections.filter(s => !sections[s]?.trim());
if (missing.length === 0) {
  console.log('\nGATE RESULT: PASS');
} else {
  console.log('\nGATE RESULT: FAIL - missing:', missing.join(', '));
}
