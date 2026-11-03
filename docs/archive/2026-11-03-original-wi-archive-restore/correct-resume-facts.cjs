const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, 'native-resume'), identity = JSON.parse(fs.readFileSync(path.join(root, 'identity.json')));
const attempt = process.argv[2] || 'initial';
if (!/^[a-z0-9-]+$/.test(attempt)) throw Error('UNSAFE_ATTEMPT');
const output = path.join(root, `recovery-fact-correction-${attempt}.json`);
if (fs.existsSync(output)) throw Error('RECEIPT_EXISTS');
const text = '外部独立审计纠正恢复事实（不构成 Candidate 批准，不要求重复任何成功步骤）：首次设计修复子会话 ses_e5ea3c781ffexOAlCZo8pe1loi 并非零写入。真实 sf_artifact_write 已成功保存 architecture.candidate.md（7393 bytes）与 data_model.candidate.md（5387 bytes），随后才因 provider HTTP 429/code 1302 失败，未产生新设计 handoff。重试提示中“未能启动、零写入”不符合原始工具证据，不能当作事实。请先完整核对当前五份文件和前次工具成功结果，保留已完成且核验正确的两份；仅补尚未完成或经证据证明仍有错误的候选。design.candidate.md、module.candidate.json、contracts.candidate.json 尚须核验实际字段与引用。新 handoff 应明确继承的成功输出与本次新增/修订输出及其来源，不得声称本次覆写了未覆写的文件，也不得把未交接当作所有文件未写。若当前 provider 继续限流、无法合法完成交接，请保留正式错误和最后成功步骤并返回 blocked；不得循环无界重派。保持原 WI-0001=candidate_preparing 的合法窗口，禁止伪造 Gate/审批、禁止改由其他角色代写。';
(async () => {
  const records = [];
  for (const [session, agent] of [['ses_e5e9c2900ffeoa6VzybWd4iIWQ', 'sf-design'], [identity.session, 'sf-orchestrator']]) {
    const body = { noReply: true, agent, model: { providerID: 'zhipuai-coding-plan', modelID: 'glm-5.3' }, parts: [{ type: 'text', text: '本条恢复消息显式绑定原 Agent，保持真实角色元数据；前一条 noReply 控制消息遗漏 agent 后触发默认 build，随后两次 ARTIFACT_OWNER_MISMATCH 拒绝正确且没有写入。不得靠工具参数冒充角色；只按本条明确的原专业角色继续。\n' + text }] };
    const response = await fetch(`${identity.base}/session/${session}/message`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    records.push({ utc: new Date().toISOString(), session, agent, request: body, status: response.status });
    if (!response.ok) throw Error('CORRECTION_DELIVERY_FAILED_' + response.status);
  }
  fs.writeFileSync(output, JSON.stringify({ utc: new Date().toISOString(), text, records, inner_exit_code: 0 }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ delivered: records, inner_exit_code: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
