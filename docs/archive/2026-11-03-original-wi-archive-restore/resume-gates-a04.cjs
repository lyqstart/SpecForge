const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7', session = 'ses_e8e849253ffeo8tI9ZIOUEjSZ5';
const out = path.join(__dirname, 'native-resume-gates-a04'); fs.mkdirSync(out);
const save = (name, value) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const prompt = "继续原会话、唯一原 WI-0001，完成已授权的 Candidate 修订，直到真实 Candidate 审批边界停止。上轮有界正式 Gate attempt-0003 已完成：9过1失败；外部独立 sf_state_read 已核验 gates_failed。保留所有旧 Attempt，不重建项目、不重做归档恢复、不创建重复 WI。\n\n先正式读取当前状态、最新 seal/handoff 和 attempt-0003/trace_gate.json，核对仍为同一失败再行动。直接一手证据：trace_data_DATA-CORE-003 失败；当前 candidates/trace_delta.md 只有 DATA-CORE-001/002/004 的 constrained_by Architecture 边，没有 DATA-CORE-003；data_model.candidate.md 的 DATA-CORE-003 段也只有契约对应说明，没有 Architecture 约束声明。删除早先非法的 DATA→Module Contract 边，只解决了非法关系，没有满足每个 DATA 必须有 Architecture 约束的既有契约。真实实现 packages/daemon-core/src/tools/lib/project-governance-v2.ts:1724-1739 对每个 model.dataModelIds 都检查 model.trace 中存在相应 DATA constrained_by 已声明 Architecture ID 的边。不是放宽 Gate、增加新产品能力或改正式 Project 真相源的理由。\n\n按现有恢复合同从 gates_failed 合法回 candidate_preparing，交由真实 sf-design owner 从现有 Architecture 的实际语义选择正确约束，在 DATA-CORE-003 段补对应明确声明，交付新 design handoff；再由真实 sf-task-planner owner 同步 trace_delta.md 的规范四列 ADD 边、边数/自检与必要追溯描述，交付新 handoff。不得随意硬编码与语义不符的 ARCH ID，也不要重复已成功的其它修订。保持已有六REQ、18AC、设计/任务ID、Project Contract PI-0001 及其四source_refs边和 Module Contract schema；不改变业务需求。所有候选和handoff只通过合法受控工具、真实专业Agent写入；传入agent参数不能替代真实身份，不用shell旁路D18。\n\n父Agent以实际文件和工具结果核验两个对应声明/Trace边一致、handoff有效，重新封存后执行全部 required Candidate Gates 一次。成功则转到真实 approval_required，展示冻结候选身份、10 Gate真实结果、greet(name)两行为和五个实施路径，并停止。用户同意归档恢复并不是 Candidate批准；不得 user_approved、Merge、CodePermission、实现或Close。若当前已 approval_required 则只展示并停止；若状态或候选漂移则先报告实际差异，不复写。\n\n模型用同一 glm-5.3 low variant，并显式保持 sf-orchestrator 及专业owner角色。若服务429持续导致无法完成，保留已成功写入和真实状态后返回，不无限重派，不伪造产品HardStop。不要让通用task completed或载体退出0冒充业务通过。\n";
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
    for (let tick = 0; tick < 80; tick++) {
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
