const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.join(__dirname, 'native-resume'), identity = JSON.parse(fs.readFileSync(path.join(root, 'identity.json')));
const sources = ['docs/product-specification/specforge-product-specification.md', 'packages/daemon-core/src/tools/lib/implementation-baseline.ts',
  'packages/daemon-core/src/tools/lib/candidate-generation-integrity.ts', 'packages/daemon-core/src/tools/lib/artifact-schema-validation.ts'].map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') }));
const text = '外部审计给出上位合同核对结果（只澄清既有合同，不批准 Candidate，不放宽 Gate）：当前 Product Specification §6.3 第8条明确要求 Architecture、Design、Tasks Candidate 绑定同一 implementation_baseline_id；第9条把 implementation_baseline.json 纳入固定 seal 集。生产 implementation-baseline.ts 的 walkCandidateMarkdown 精确检查 architecture.candidate.md/design.candidate.md/tasks.md；artifact-schema-validation.ts:526 的 Module Contract 顶层必须恰为 contracts/owner_module/schema_version；candidate-generation-integrity.ts 的 candidateSealInputPaths 把 candidates/** 的所有文件和 implementation_baseline.json 一起封存。因此，调度提示中给 contracts.candidate.json 额外添加第4个顶层字段的要求没有这份产品合同依据，应修正该提示，保持现有三键 schema；不需要让用户在“保持现状”与“扩 schema”之间补做产品裁决，也不能用兄弟文件自述替代正式 seal 验证。请按上述明确的载体职责核验当前 Design、Architecture、Tasks 绑定与完整 seal 集，继续专业交接/任务规划；若实际 Runtime 再给出不同拒绝，保留原错误按首次责任层定位，不能绕过。';
(async () => {
  const request = { noReply: true, agent: 'sf-orchestrator', model: { providerID: 'zhipuai-coding-plan', modelID: 'glm-5.3' }, parts: [{ type: 'text', text }] };
  const r = await fetch(`${identity.base}/session/${identity.session}/message`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw Error('CLARIFICATION_DELIVERY_FAILED_' + r.status);
  fs.writeFileSync(path.join(root, 'baseline-contract-clarification.json'), JSON.stringify({ utc: new Date().toISOString(), sources, request, status: r.status, inner_exit_code: 0 }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ status: r.status, agent: request.agent, source_count: sources.length, inner_exit_code: 0 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
