const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7';
const observation = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-resume/inspection-design-return.json')));
const first = observation.childMessages.find(child => child.session === 'ses_e5ea3c781ffexOAlCZo8pe1loi');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), results = [];
for (const part of first.messages.flatMap(message => message.parts || []).filter(part => part.type === 'tool' && part.tool === 'sf_artifact_write')) {
  let result; try { result = JSON.parse(part.state.output); } catch { continue; }
  if (!result.success || !['candidate_architecture', 'candidate_data_model'].includes(result.file_type)) continue;
  const source = Buffer.from(part.state.input.content, 'utf8'), current = fs.readFileSync(path.join(target, result.path));
  results.push({ file: result.path, source_owner_session: first.session, source_sha256: sha(source), current_sha256: sha(current),
    size: current.length, identical_to_first_success: source.equals(current) });
}
if (results.length !== 2 || results.some(result => !result.identical_to_first_success)) throw Error('INHERITED_OUTPUT_DRIFT');
const output = { utc: new Date().toISOString(), method: 'Compare original successful controlled tool payload bytes with independent current file reads', results, inner_exit_code: 0 };
fs.writeFileSync(path.join(__dirname, 'inherited-design-proof.json'), JSON.stringify(output, null, 2), { flag: 'wx' });
console.log(JSON.stringify(output));
