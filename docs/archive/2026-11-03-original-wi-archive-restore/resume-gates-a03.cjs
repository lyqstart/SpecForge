const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7', session = 'ses_e8e849253ffeo8tI9ZIOUEjSZ5';
const out = path.join(__dirname, 'native-resume-gates-a03'); fs.mkdirSync(out);
const save = (name, value) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const prompt = "继续原会话和唯一原 WI-0001，执行一次有界的正式 Gate 续跑，到真实 Candidate 审批边界停止。原服务在上一轮最后以 HTTP 429/code1302 结束；取证工具退出0只表示Agent返回，不是业务成功。外部正式StateManager刚核验当前gates_running；attempt-0001/0002保留，后一次8过2失败。针对DATA-CORE-003架构约束和Architecture七章节/capability_verdict的owner修订及新handoff已经落盘，随后已经重新封存并进入gates_running，但第三个Gate Attempt尚未产生。先正式sf_state_read，核验当前seal与最新handoff/实际文件是否解决前次阻塞。若当前已approval_required，只展示当前冻结候选和真实Gate证据并停止。若仍gates_running且前次已知阻塞已由实际修订解决，直接通过正式sf_gate_run执行全部required candidate Gates，不重复初始化、归档恢复、已成功修订、封存或状态推进；不要手改任何真相源。若仍有已知未解决项，不运行已知必败的Gate，不为制造恢复状态而造失败，只报告精确证据和合法断点。使用同一glm-5.3的low variant，保持真实sf-orchestrator/专业Agent身份、所有权限与Gate。成功后展示greet两行为、5个实施路径、冻结Candidate身份和Gate结果。原授权仅为封存归档恢复，绝不是Candidate批准；不得写user_approved、Merge、CodePermission、实现或Close。若再次服务限流，不无限重派，不制造产品HardStop，保留实际状态和错误后返回。\n";
save('request', { utc: new Date().toISOString(), target, session, agent: 'sf-orchestrator', model: 'zhipuai-coding-plan/glm-5.3', prompt,
  expected_writes: 'OpenCode session storage/plugin logs and original WI owner-controlled candidate/handoff/Gate artifacts only; no Candidate approval or implementation' });
const child = cp.spawn('C:/Users/lyq/AppData/Roaming/npm/node_modules/opencode-ai/bin/opencode.exe', ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: target, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const log = fs.createWriteStream(path.join(out, 'host.log'), { flags: 'wx' });
let raw = '', base;
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { raw += chunk; log.write(chunk); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(method, endpoint, body) {
  const response = await fetch(base + endpoint, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const text = await response.text(); if (!response.ok) throw Error(`NATIVE_HTTP_${response.status}:${endpoint}:${text.slice(0,300)}`);
  return text ? JSON.parse(text) : null;
}
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(authorization|token|cookie|set-cookie|api_key|apiKey|access_token)$/i.test(key) ? '[REDACTED]' : redact(item)]));
  if (result.type === 'tool' && result.tool === 'read' && /host-profile\.json$/.test(result.state?.input?.filePath || '') && result.state?.output) {
    result.state.output_sha256 = hash(result.state.output); result.state.output = '[Host inventory redacted]';
  }
  return result;
}
(async () => {
  let before = [], completed = false;
  try {
    for (let i = 0; i < 300; i++) {
      base = raw.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]; if (base) break;
      if (child.exitCode !== null) throw Error('NATIVE_HOST_EXITED'); await sleep(100);
    }
    if (!base) throw Error('NATIVE_HOST_START_TIMEOUT');
    save('identity', { utc: new Date().toISOString(), base, pid: child.pid, target, session });
    await request('GET', `/session/${session}`);
    before = await request('GET', `/session/${session}/message`);
    save('baseline', { utc: new Date().toISOString(), message_count: before.length, message_ids: before.map(message => message.info?.id) });
    const agents = await request('GET', '/agent');
    save('owners', agents.filter(agent => ['sf-orchestrator', 'sf-requirements', 'sf-design', 'sf-task-planner'].includes(agent.name)).map(agent => ({ name: agent.name, prompt_sha256: hash(agent.prompt || ''), tools: agent.tools })));
    await request('POST', `/session/${session}/prompt_async`, { agent: 'sf-orchestrator', model: { providerID: 'zhipuai-coding-plan', modelID: 'glm-5.3' }, variant: 'low', parts: [{ type: 'text', text: prompt }] });
    for (let tick = 0; tick < 60; tick++) {
      await sleep(15000);
      const statuses = await request('GET', '/session/status'), messages = await request('GET', `/session/${session}/message`);
      const last = messages.flatMap(message => message.parts || []).filter(part => part.type === 'tool').at(-1);
      const progress = { utc: new Date().toISOString(), status: statuses[session], messages: messages.length, last_tool: last?.tool, last_status: last?.state?.status };
      fs.appendFileSync(path.join(out, 'progress.jsonl'), JSON.stringify(progress) + '\n'); console.log(JSON.stringify(progress));
      if (messages.length > before.length && (!statuses[session] || statuses[session].type === 'idle')) {
        const ids = new Set(before.map(message => message.info?.id));
        save('new-messages', redact(messages.filter(message => !ids.has(message.info?.id))));
        save('children', await request('GET', `/session/${session}/children`));
        save('result', { utc: new Date().toISOString(), session, target, inner_exit_code: 0, interpretation: 'Native agent returned; workflow outcome must be independently audited from owner artifacts and formal state.' });
        completed = true; break;
      }
    }
    if (!completed) throw Error('OBSERVATION_WINDOW_EXPIRED');
  } catch (error) {
    save('failure', { utc: new Date().toISOString(), error: String(error), inner_exit_code: 1 });
    try { await request('POST', `/session/${session}/abort`); } catch {}
    process.exitCode = 1;
  } finally { child.kill(); log.end(); }
})();
