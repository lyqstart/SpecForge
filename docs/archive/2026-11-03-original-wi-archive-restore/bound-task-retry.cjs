const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, 'native-resume'), identity = JSON.parse(fs.readFileSync(path.join(root, 'identity.json')));
const text = '外部一手证据补充：任务规划子会话 ses_e5e8e927effeUmNgRiHfnXwxwY 的 assistant info.finish=length，只有读取与约 80541 字符的 reasoning，未调用受控写入、未产生新 handoff；task completed/空结果不是专业完成。请勿重复相同大提示。优先用该 task_id 恢复同一 sf-task-planner，将剩余工作拆成可核验小步：本回合只在受控工具中完成 tasks.md 字段和正式 REQ/AC/DD 引用修订，下一小步再完成 trace_delta 并核对交叉引用，全部完成后才写本轮 owner-bound handoff 和返回 success。每小步仍由同一 owner 执行、不变更职责、不推进状态、不重复已成功文件、不通过 shell/其他执行器处理；中间部分成果只能报告 in_progress，不能冒充完整交接。任务只需保持现有语义并按已规范化上游做有限替换，不扩展分析或架构。若这次有界恢复仍因 provider/length 限制不能产出，保存真实错误与断点并返回 blocked，不无限重派、不伪造产品 HardStop。';
(async () => {
  const request = { noReply: true, agent: 'sf-orchestrator', model: { providerID: 'zhipuai-coding-plan', modelID: 'glm-5.3' }, parts: [{ type: 'text', text }] };
  const response = await fetch(`${identity.base}/session/${identity.session}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error('DELIVERY_' + response.status);
  fs.writeFileSync(path.join(root, 'bounded-task-recovery-request.json'), JSON.stringify({ utc: new Date().toISOString(), request, status: response.status, inner_exit_code: 0 }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ status: response.status, agent: request.agent, inner_exit_code: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
