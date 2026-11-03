const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) =>
    [key,
      /^(?:set-cookie|cookie|authorization|x-api-key|api_key|access_token)$/i.test(key) ? '[REDACTED]' : redact(entry)]));
}
if (process.argv[2] === '--redact-prior') {
  const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'native-compaction-result.json'), 'utf8'));
  original.redaction = 'Sensitive response-header values removed; original retained locally and excluded from Git.';
  fs.writeFileSync(path.join(__dirname, 'native-compaction-result-redacted.json'), JSON.stringify(redact(original), null, 2) + '\n', { flag: 'wx' });
  console.log('Redacted copy created; original preserved.');
  process.exit(0);
}
const retry = process.argv[2] === '--glm53';
const out = path.join(__dirname, retry ? 'native-compaction-glm53-result.json' : 'native-compaction-result.json');
if (fs.existsSync(out)) throw Error('RECEIPT_ALREADY_EXISTS');
const started = new Date().toISOString();
const previous = JSON.parse(fs.readFileSync(path.join(__dirname, 'checkpoint-persistence-result.json'), 'utf8'));
const handshake = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/opencode/sf-user/runtime/handshake.json'), 'utf8'));
const fixture = previous.fixture;
const record = { run_id: 'CODEX-SF-20261103-SPS-GAP-REPAIR-A01', started_utc: started, fixture,
  cwd: process.cwd(), command: `node docs/archive/2026-11-03-sps-conformance-repair/native-compaction-probe.cjs${retry ? ' --glm53' : ''}`,
  purpose: 'Invoke actual OpenCode summarize API and independently verify native callback checkpoint',
  expected_writes: 'New synthetic OpenCode session/messages, model summary, isolated fixture checkpoint, plugin diagnostics, receipt',
  model: { providerID: 'zhipuai-coding-plan', modelID: retry ? 'glm-5.3' : 'glm-5.3-highspeed' }, observations: [] };
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let nativeSession;
async function request(base, method, endpoint, body, daemon = false) {
  const url = new URL(endpoint, base);
  if (!daemon) url.searchParams.set('directory', fixture);
  const response = await fetch(url, { method,
    headers: { 'content-type': 'application/json', ...(daemon ? { authorization: `Bearer ${handshake.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const text = await response.text();
  let value; try { value = text ? JSON.parse(text) : null; } catch { value = text; }
  record.observations.push({ utc: new Date().toISOString(), method, endpoint, status: response.status, response: value });
  if (!response.ok) throw Error(`${endpoint}: HTTP ${response.status}`);
  return value;
}
(async () => {
  try {
    const health = await request('http://127.0.0.1:4096', 'GET', '/global/health');
    record.host_version = health.version;
    const doc = await request('http://127.0.0.1:4096', 'GET', '/doc');
    // Keep only the exercised primary API contract in the evidence record.
    record.observations.pop();
    record.summarize_contract = doc.paths['/session/{sessionID}/summarize'].post.requestBody;
    const providers = await request('http://127.0.0.1:4096', 'GET', '/provider');
    record.observations.pop();
    if (!providers.connected.includes(record.model.providerID) || !providers.all.find(p => p.id === record.model.providerID)?.models?.[record.model.modelID]) throw Error('CONFIGURED_MODEL_UNAVAILABLE');
    const session = await request('http://127.0.0.1:4096', 'POST', '/session', { title: 'Native compaction checkpoint acceptance only' });
    nativeSession = session.id;
    await request('http://127.0.0.1:4096', 'POST', `/session/${session.id}/message`, {
      noReply: true, model: record.model,
      parts: [{ type: 'text', text: 'Isolated acceptance fixture. Remember marker SPECFORGE-NATIVE-COMPACTION-01. There is no coding task. Do not call tools or change files. Preserve this marker in the session summary.' }],
    });
    const registration = await request(`http://127.0.0.1:${handshake.port}`, 'POST', '/api/v1/ingest/register', { projectPath: fixture }, true);
    if (registration.data?.mode !== 'personal') throw Error('UNEXPECTED_RUNTIME_MODE');
    const checkpointPath = path.join(fixture, '.specforge/runtime/checkpoints', `${registration.data.sessionId}.json`);
    const before = fs.existsSync(checkpointPath) ? fs.readFileSync(checkpointPath) : null;
    record.before_checkpoint = before ? { sha256: hash(before), bytes_base64: before.toString('base64') } : null;
    console.log(JSON.stringify({ phase: 'native_summarize_started', utc: new Date().toISOString(), sessionId: session.id }));
    const summary = await request('http://127.0.0.1:4096', 'POST', `/session/${session.id}/summarize`, { ...record.model, auto: false });
    record.summary_api_returned = summary;
    record.messages = await request('http://127.0.0.1:4096', 'GET', `/session/${session.id}/message`);
    const bytes = fs.readFileSync(checkpointPath);
    const checkpoint = JSON.parse(bytes.toString());
    if (checkpoint.opencodeSessionId !== session.id || checkpoint.projectPath !== fixture || checkpoint.source !== 'opencode.experimental.session.compacting' ||
        Date.parse(checkpoint.capturedAt) < Date.parse(started)) throw Error('NATIVE_CHECKPOINT_BINDING_NOT_PROVEN');
    record.checkpoint = checkpoint;
    record.checkpoint_sha256 = hash(bytes);
    record.checkpoint_path = checkpointPath;
    record.native_callback_to_disk = 'CONFIRMED';
    const summaryMessage = record.messages.find(message => message.info?.role === 'assistant' && message.info?.summary === true);
    const summaryText = summaryMessage?.parts?.filter(part => part.type === 'text').map(part => part.text).join('\n') ?? '';
    record.summary_generation = summaryMessage && !summaryMessage.info.error && summaryText.includes('SPECFORGE-NATIVE-COMPACTION-01') ? 'CONFIRMED_WITH_MARKER' : 'NOT_PROVEN';
    if (retry && record.summary_generation !== 'CONFIRMED_WITH_MARKER') throw Error('SUMMARY_MESSAGE_FAILED_OR_MARKER_MISSING');
    record.inner_exit_code = 0;
  } catch (error) {
    record.error = String(error); record.inner_exit_code = 1; process.exitCode = 1;
    if (nativeSession) {
      try { await request('http://127.0.0.1:4096', 'POST', `/session/${nativeSession}/abort`, {}); } catch {}
    }
  } finally {
    record.finished_utc = new Date().toISOString(); record.carrier_exit_code = record.inner_exit_code;
    fs.writeFileSync(out, JSON.stringify(redact(record), null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ receipt: out, native_callback_to_disk: record.native_callback_to_disk, error: record.error, inner_exit_code: record.inner_exit_code }));
  }
})();
