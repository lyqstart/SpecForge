const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, 'native-resume'), identity = JSON.parse(fs.readFileSync(path.join(root, 'identity.json')));
const options = JSON.parse(fs.readFileSync(path.join(__dirname, 'model-options.json')));
if (options.model?.variants?.low?.reasoningEffort !== 'low') throw Error('LOW_VARIANT_NOT_PROVEN');
(async () => {
  const children = await fetch(`${identity.base}/session/${identity.session}/children`).then(r => { if (!r.ok) throw Error('CHILDREN_READ'); return r.json(); });
  const statuses = await fetch(identity.base + '/session/status').then(r => { if (!r.ok) throw Error('STATUS_READ'); return r.json(); });
  const active = children.filter(child => child.title.includes('@sf-task-planner') && ['busy', 'retry'].includes(statuses[child.id]?.type));
  if (active.length > 1) throw Error('MULTIPLE_ACTIVE_TASK_PLANNERS');
  const targets = [[identity.session, 'sf-orchestrator'], ...active.map(child => [child.id, 'sf-task-planner'])], records = [];
  for (const [session, agent] of targets) {
    const request = { noReply: true, agent, model: { providerID: 'zhipuai-coding-plan', modelID: 'glm-5.3' }, variant: 'low',
      parts: [{ type: 'text', text: '本条保持原真实 Agent 与同一模型，单次续跑显式选择服务已公布的 low variant（reasoningEffort=low），不改全局设置。上一轮任务规划 finish=length 时 reasoning=31865、普通输出=135，合计32000；不能把空完成当作交接。请按已下发的有界小步，仅做既有候选字段/ID与引用的必要修订，先保存任务小步，再保存追溯小步，全部核验后持久化 owner-bound handoff；保持现有语义、治理角色、正式工具与审批边界。若再次达到长度/服务限额且无合法产出，报告真实断点，不无限重试、不制造产品 HardStop。' }] };
    const response = await fetch(`${identity.base}/session/${session}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
    records.push({ utc: new Date().toISOString(), session, agent, request, status: response.status });
    if (!response.ok) throw Error('VARIANT_MESSAGE_REJECTED_' + response.status);
  }
  fs.writeFileSync(path.join(root, 'bounded-variant-request.json'), JSON.stringify({ utc: new Date().toISOString(), records, interpretation: 'Parameter delivery only; subsequent model metadata and owner results must prove effect.', inner_exit_code: 0 }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ targets: records.map(record => ({ session: record.session, agent: record.agent, status: record.status })), variant: 'low', inner_exit_code: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
