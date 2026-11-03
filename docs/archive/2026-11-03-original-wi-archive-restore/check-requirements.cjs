const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7', wi = path.join(root, '.specforge/work-items/WI-0001');
const file = path.join(wi, 'candidates/project/modules/CORE/requirements.candidate.md'), bytes = fs.readFileSync(file), text = bytes.toString();
const baseline = JSON.parse(fs.readFileSync(path.join(wi, 'implementation_baseline.json')));
const result = { utc: new Date().toISOString(), interpretation: 'Independent bounded text/identity check, not a formal Gate', file,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'), definitions: [...text.matchAll(/^###\s+(REQ-CORE-\d{3})\b/gm)].map(match => match[1]),
  acceptance_definitions: [...text.matchAll(/^\s*-\s+(AC-CORE-\d{3})\b/gm)].map(match => match[1]),
  short_req_refs: [...text.matchAll(/\bREQ-\d{3}\b/g)].map(match => match[0]),
  baseline_binding: text.includes(`implementation_baseline_id: ${baseline.snapshot_id}`),
  handoffs: fs.readdirSync(path.join(wi, 'handoffs')).filter(name => name.includes('sf-requirements')).map(name => {
    const raw = fs.readFileSync(path.join(wi, 'handoffs', name)); return { name, sha256: crypto.createHash('sha256').update(raw).digest('hex'), value: JSON.parse(raw) };
  }) };
fs.writeFileSync(path.join(__dirname, 'requirements-independent-check.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ definitions: result.definitions, ac_count: result.acceptance_definitions.length, short_refs: result.short_req_refs.length, baseline_binding: result.baseline_binding, handoffs: result.handoffs.length, inner_exit_code: 0 }));
