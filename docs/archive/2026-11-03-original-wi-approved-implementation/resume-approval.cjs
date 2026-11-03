const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const target = 'C:\\Users\\lyq\\AppData\\Local\\Temp\\sf-conformance-business-R6ttE7', session = 'ses_e8e849253ffeo8tI9ZIOUEjSZ5';
const out = path.join(__dirname, 'native-resume-approval'); fs.mkdirSync(out);
const save = (name, value) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const prompt = "当前最新用户已明确回复：批准。\n这是对刚展示的原 WI-0001 冻结 Candidate（attempt-0005，10/10 passed）的真实新批准。用户已允许规格合并和后续受控实现，先前“仅到 Candidate 审批停止”的边界由此解除至现有受控后续流程；不是把归档授权或旧任务指令冒充批准。user_response_quote 必须逐字为“批准”，不要写成我的整段控制提示，不用 auto_approved，不从 comments 解析审批。原会话 ses_e8e849253ffeo8tI9ZIOUEjSZ5；唯一原项目 C:UserslyqAppDataLocalTempsf-conformance-business-R6ttE7；只继续原 WI-0001。\n\n先正式 sf_state_read，再只读核验当前 Candidate/Manifest、最新 passed Gate 和原 Project Spec 基线。原 attempt-0005/input-snapshot.json 的 SHA-256 为 3012dc9895dd145465dc5a704411fb1b04ad22e9fa990d745b744e18970bca54，Candidate Manifest c1098af5ec6c5b232eaa936aabf077edcc8e1826163ee32d5e3942611cc77ab7，原实现 HEAD 8a692e88c0823984647622294f5199c18bb0c587。外部新阶段 before-authorized-continuation.json 已独立核验同一整代 Candidate 当前字节无漂移。不要重复初始化、归档恢复、旧 owner 修订、重新封存或 Candidate Gate。若发现漂移，保留证据并停止，不能把此次批准套到另一代。\n\n仍为 approval_required 且正式 preconditions 成立时，调用 sf_user_decision_record(action=record,decision_status=approved,decision_type=user_approved,user_response_quote=\"批准\",decision_scope=full)，由正式 Recorder 写决策并推进状态。若该精确批准已成功落盘，先核验并消费，不重复记录。随后通过 sf_merge_run 进行一次实际 Atomic Spec Merge；不要使用不确定是否实现的 dry_run 试探，不手动强推 approved→merge_ready。按实际返回核验 merge_report、PSV、post_merge_gate 与 StateManager；已完成步骤不重复。如果正式工具失败，分类来源/缺口后停止该依赖链，禁止改 Project 真相源或重建 Candidate 来迎合 Runtime。\n\n规格合并后，请完成 sf_git_preflight 与 sf_git_branch_plan(work_item_id=WI-0001,title=\"greet library\",work_item_type=feature)，展示实际分支/HEAD/dirty path 分类和语义分支建议，然后停止等待尚缺的具体分支决定。重要：原仓库是用户明确接受归档恢复后得到的 detached HEAD；旧默认分支/旧索引无法证明，不能宣称或创建为“已恢复旧 main”。当前用户批准了候选内容，但此前没有向用户展示并确认语义分支名。sf_git_branch_create 的 confirmed=true 只能在真实用户确认具体语义分支名后使用，不能将本次 Candidate 批准推断为分支名确认。不要先创建 main、不要传 --detach/HEAD 等伪 base_branch 绕过当前 owner 的参数语义。若现有 Git owner 无法容纳该恢复形态，报告精确实际证据、首个责任层和最小能力缺口，不运行已知必败的 branch-create 或 code-permission。\n\n本次有界续跑只落实已批准的决策、规格合并和可审阅 Git 计划；真实分支决定/能力合同未齐备前，不启用 Code Permission、不实施，不向默认主线做 Git 合并。保持 sf-orchestrator 与专业 Agent 的真实身份、同一 glm-5.3 low variant。只读使用正式 read/glob/grep/受控工具；所有治理写入必须其正式 owner。D18 仍禁止脚本/解释器/子进程/构建/测试，不得换执行器或让外部 Codex 手写真相源代替。不制造 HardStop、不伪造报告通过或 Close。服务失败保留实际成功步骤并有界返回，不无限重派。\n";
save('request', { utc: new Date().toISOString(), target, session, agent: 'sf-orchestrator', model: 'zhipuai-coding-plan/glm-5.3', prompt,
  expected_writes: 'OpenCode storage/logs plus actual approved decision and owned Spec Merge/post-merge artifacts; read-only Git preflight/plan; no branch create, Code Permission or implementation until required branch decision' });
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
    save('owners', agents.filter(agent => ['sf-orchestrator', 'sf-requirements', 'sf-design', 'sf-task-planner', 'sf-executor', 'sf-reviewer', 'sf-verifier'].includes(agent.name)).map(agent => ({ name: agent.name, prompt_sha256: hash(agent.prompt || ''), tools: agent.tools })));
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
