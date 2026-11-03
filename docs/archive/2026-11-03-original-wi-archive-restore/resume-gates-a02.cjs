const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7', session = 'ses_e8e849253ffeo8tI9ZIOUEjSZ5';
const out = path.join(__dirname, 'native-resume-gates-a02'); fs.mkdirSync(out);
const save = (name, value) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const prompt = "继续原会话和原 WI-0001，仅从当前真实权威状态恢复尚未完成的 Gate 修订，不创建或初始化项目，不重复归档恢复。前一外部取证进程的60分钟观察窗口结束，若它取消了未完成调用，这是观察者断点，不是用户取消、产品HardStop或业务失败。先正式 sf_state_read 并核对当前 Gate Attempt、Candidate seal、最新 owner handoff 与实际文件，再决定下一步。已完成：原路径319文件由Recovery owner恢复；规范REQ/AC/DD与baseline绑定；sf_contract_register创建了项目公共接口PI-0001；首次正式封存成功；attempt-0001运行10 Gate，6过4失败。失败三类：DATA-CORE-003错误消费Module PI-CORE-001、PI-0001四个source_refs缺正式Trace边、Architecture缺analysis_scope:system_governance。相关设计和任务owner已于13:11/13:12实际保存修订并产生新handoff，请先核验这些已完成成果，禁止重复覆写或把中断说成零写入。只在合法candidate_preparing恢复窗口由原专业owner补真实缺项，重新封存并跑全部required Gates。保留旧Attempt与全部拒绝记录。当前模型为同一glm-5.3的已配置low variant，继续保持真实sf-orchestrator/专业Agent身份；不得传工具agent参数冒充角色，不用shell或其他执行器绕过D18。若已达到approval_required则只展示当前冻结候选与Gate证据并停止，不重跑或推进。原授权仅为归档恢复，绝不是Candidate批准；不得写user_approved，不合并、不实现。若仍有不能合法容纳的能力缺口，保留原始证据，说明首次责任层与下一合法动作。";
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
    for (let tick = 0; tick < 120; tick++) {
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
