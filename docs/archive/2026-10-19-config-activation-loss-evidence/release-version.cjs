const fs = require('node:fs'), path = require('node:path');
const files = ['package.json', 'scripts/package.json', ...fs.readdirSync('packages', { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join('packages', e.name, 'package.json'))).map(e => path.join('packages', e.name, 'package.json')), 'docs/product-specification/specforge-product-specification.md', 'tests/unit/current-product-version-contract.test.ts', 'packages/observability/tests/unit/project-structure.test.ts', 'packages/cli/tests/help-system.test.ts'];
const payload = files.map(file => {
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('1.0.16')) throw new Error('VERSION_BASELINE_MISSING:' + file);
  return { file, target: source.replaceAll('1.0.16', '1.0.17') };
});
for (const { file, target } of payload) fs.writeFileSync(file, target);
console.log(JSON.stringify({ version: '1.0.17', files }));
