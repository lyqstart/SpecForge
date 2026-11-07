---
name: superpowers-verification-before-completion
description: 声明完成前逐项核验当前原始证据，缺少必需证据则阻断，不扩大执行权限
---

# Superpowers Verification Before Completion

## 当前执行边界

本 Skill 服从 SPS §9.2 / D18，不授予额外工具权限。`sf_safe_bash` 仅支持 Runtime 内部有限只读操作；脚本、测试、构建、lint、类型检查、安装依赖和启动应用均不可由它执行。不得转到 Shell、解释器、其他工具或另一个 Agent 绕过限制。

D23支持的固定单进程只读Node验证只走真实sf-orchestrator的sf_verification_plan及真实sf-verifier的sf_verification_run。先prepare取得Attempt，再run；源、Task、目的、独立许可、完整退出与清理由共同消费者重验。不能为只读验证重新释放代码权限，实施目的结果不能替代formal目的结果。失败/中断保留原Attempt，取消及自有资源回收走cancel/recover，不盲重跑或换宿主。

sf_verification_run的动作参数不混传：prepare仅`action/work_item_id/plan_id`，run/cancel/recover仅`action/work_item_id/attempt_record_id`且省略plan_id。所有字段由真实输入证明，不靠自述；启动前参数拒绝不产生应用退出码或通过回执，须先纠正调用合同。

已有D23执行回执直接以`verification-owner:receipt:<id>`进入evidence_manifest，共同消费者验真；不另造verification_evidence包装或probe。verification_evidence只承载另有合同要求的独立观测，文件名主体ASCII字母数字开头、仅字母数字._-、最多101字符，扩展名仅jsonl/txt/png/webp/jpg/jpeg。未公布或不满足的字段先核对合同，连续同类拒绝即停止，不盲猜。

客户端超时或DAEMON_OPERATION_OUTCOME_UNKNOWN不等于owner操作失败或回滚；停止重发，由Orchestrator只读核验规范产物、Gate与StateManager实际结果，复用已完成步骤。缺少确定结果时保持unknown，不能再造证据或把执行重做当作对账。

有限test -f/grep可以由Runtime按finite-posix-readonly-predicate/v1证明并转换为同一隔离Node检查；记录原声明和实际argv，不称作shell/grep程序执行。未支持或不能证明语义的声明继续拒绝。

验证要求不等于执行能力。其余验证只能通过受控读取入口核验合法原始证据；没有合法获取路径时返回blocked，命令记skipped、required evidence记not_executed。通过的执行条目必须引用可信receipt_id及Task/类别/序号，Evidence绑定同一内容身份；不能以自由文本、旧输出或不可信stdout生成通过结论。

## 逐项证据核验

按正式需求、任务、变更事实和风险确定适用项，不增加上位规格未要求的测试义务：

1. **测试与回归**：核验原始执行命令、实际发现的测试文件/用例、数字退出码、完整输出和跳过原因。证据必须绑定当前实现，不能以测试文件存在或旧结果证明本次通过。
2. **构建与工具链**：需要构建、类型检查、lint 或依赖验证时，核验实际运行环境和原始结果。没有记录时明确缺失，不尝试启动被禁用的进程。
3. **验收标准**：为每个适用标准登记已满足、未满足或证据不足及原始 Evidence 引用；测试绿色不能替代业务结果。
4. **端到端结果**：核验真实操作记录、请求/响应、结果落点和时间。模拟服务、静态检查、Agent 自述不能替代真实宿主和用户操作；不得将 Agent 技术测试写成用户人工验收。

## 报告与责任

- 原执行时间、原执行者、实现版本和本次核验时间分别记录。证据身份与引用必须可复算，未来时间和不相关版本不能作为通过依据。
- Verifier 仅通过 `sf_artifact_write` 写入其拥有的 `verification_report`、`evidence_manifest` 和允许的原始证据；不得改业务代码、手写状态或调用 Gate。
- 所有适用必需证据满足后才能报告 pass。已有失败则如实报告 fail；无法取得必需证据则 blocked。
- 向 Orchestrator 返回具体缺口、责任方和合法恢复条件。Orchestrator 不得口头豁免必需证据、伪造批准，或重复调度同一不可执行任务代替能力恢复。
- 发现问题交给其责任 owner 修复；Verifier 不代为修复。恢复后重新核验受影响证据，不覆盖历史失败。
