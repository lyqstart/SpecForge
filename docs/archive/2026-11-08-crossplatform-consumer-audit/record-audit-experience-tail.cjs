const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),file='docs/rule/specforge-development-error-ledger-and-experience.md',before=fs.readFileSync(file),sha=b=>crypto.createHash('sha256').update(b).digest('hex');assert(!before.toString().includes('### ERR-2031：'));
const tail=`
### ERR-2031：Bun usage-only 输出被误计为测试通过

- 实际回执0043/0053只有 Bun usage，虽然数字退出0，却未执行目标测试。0103的完整命令回执扫描明确撤销这两项通过结论；旧字节保留。ERR-2027中“0043独立Linux通过”的旧句被本条纠正，不能继续引用为覆盖证据。后续使用真实package cwd的 run test，或已核验的 run --cwd 形式，并要求实际测试/构建结果标记与退出码同时成立；根 test:project-bootstrap 也修正相同错误顺序。

### ERR-2032：实际 Linux 帮助输出被诊断日志污染

- 0063真实安装生命周期失败于 help JSON stdout，configuration logger把正常诊断写入stdout。保留红例并将诊断统一送stderr；0069及后续实际Linux0081/Windows0119平台通过。HTTP race及ingest全局timer、重连timer所有权也有独立计数/settlement红绿回归，见0067—0080；不以源码邻近文本或消失的日志代替运行证据。

### ERR-2033：当前 Design Gate 与定义 Loader 仍消费退役契约

- 当前 feature_spec 的 design-phase Candidate被按完整REQ阶段检查，旧feature_spec_design_first字符串才选正确策略；Linux大小写敏感又暴露了夹具使用core而正式MODULE_CODE为CORE。当前fixture由真实Init建立，Gate读取严格validated Candidate phase并拒绝注册入口mode覆盖；0104/0108/0109及当前全套证据分别记录覆盖。Workflow Loader另有注册迁移钩子、缺schema自动补值和无效目录跳过；当前严格已知1.0/2.0定义不做转换，独立Gate wire仍1.0，0112/0117/0118证明测试与构建。

### ERR-2034：文档与遗留工具库提供不符合当前产品的指导

- 当前配置/Observability文档虚构构造器或安装方式、Daemon文档旧生命周期/字段/路由、Job私有库冒充公开入口、ADR旧兼容段落与模板权限暗示均已逐owner重核。原始文档完整保留，不通过删除历史消除冲突。D18遗留规则虽不参与真实只读执行，仍建议临时bash/python脚本；现改为当前parser只读语法query，去掉不被调用的HostProfile合成，旧本地Design Gate执行明确blocked。0140及后续原始回执证明当前与安装副本拒绝。语法清单和零keyword命中均不能自动作为全量语义PASS。

### ERR-2035：边运行全套边改输入、未先重建发布清单

- 0145/0146实际全套失败必须保留：模板/Tool编辑后未重新生成发布集合，scope-gate的真实仓库安装集测试正确拒绝hash_mismatch；Windows全套还读到了不同时间的handler/test输入，不能算某个固定版本通过。后续必须先冻结source哈希、再生成清单、再执行完整回归；运行期间不得继续修改被测源码/测试。一次注册fetch报告bad port却未记录实际端口，不能凭经验断为并发或特定端口原因，明确INSUFFICIENT_EVIDENCE，先补取证诊断。失败不可以只重跑到绿后删除。

### ERR-2036：公开契约登记会切换到未启用工作流

- 当前Agent指令使用 feature_spec/contract_change_path，但原登记库会强制workflow_type=contract_change；公开Handler缺自身角色、StateManager冻结及当前主体边界。现由真实sf-orchestrator在可变Candidate状态调用，严格读取当前WI/路径、HardStop和Registry Schema，拒绝链接/硬链接、未知参数及未启用动作；当前Subject不转换已有非当前Candidate。0156、0158和后续记录当前正例、拒绝及历史库算法回归。历史算法存在不等于其workflow获发布授权。

### ERR-2037：语义关闭允许输入选择历史验收profile

- 公开metadata推荐Investigation profile，producer可由参数、现有文件或Verification Report中的profile选择历史validator，与当前唯一feature_spec工作流冲突。现公开metadata和producer都拒绝非当前workflow/profile，不把历史纯库测试当公开能力。0157/0158含三种输入来源拒绝及当前feature正例；旧quick_change正例fixture同步到当前workflow，spec_migration公共调用测试改为真实拒绝。仍须冻结后全量与部署验收，不在此提前宣称完成。

### ERR-2038：完整lint入口存在配置/依赖及诊断失败，不能称全检查通过

- 0136完整当前包lint数字1。第一次A/B夹具遗漏根tsconfig导致baseline build失败（0147），补齐固定输入后0150在同一自有worktree、同一冻结外部依赖和Bun/命令下证明baseline/current build都0、lint都1；完整raw输出保留于lint-ab-02。具体错误归因须按稳定诊断键比较，不能笼统声称全部都是历史债务，更不能静默取消检查或篡改规格。该检查与当前release CI中明确的path/async/typecheck/回归覆盖分别陈述。
`;
fs.writeFileSync(path.join(__dirname,'ledger-before-audit-tail.raw'),before,{flag:'wx'});fs.appendFileSync(file,tail);fs.writeFileSync(path.join(__dirname,'ledger-tail-record.json'),JSON.stringify({utc:new Date().toISOString(),path:file,before_sha256:sha(before),after_sha256:sha(fs.readFileSync(file)),applied_active_rules:['EXP-076','EXP-179','EXP-180','EXP-182','EXP-193','EXP-251','EXP-260','EXP-261','EXP-283','EXP-287'],new_active_rule_created:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({recorded:'ERR-2031..2038'}));
