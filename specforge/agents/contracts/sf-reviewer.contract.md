# sf-reviewer 契约

## 调用方
- sf-orchestrator（在 review 阶段调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- requirements_file: string（spec_directory/requirements.md 的路径）
- design_file: string（spec_directory/design.md 的路径）
- files_to_review: string[]（需要审查的代码文件路径列表）

## 输出格式
- 审查报告：`{ conclusion, summary, findings, traceability }`
- conclusion: "approve" | "request_changes"
- findings 中每项包含：severity（blocking/warning/info）、category、file、line、description、suggestion
- traceability 包含：requirements_covered、requirements_missing

## 禁止行为
- 不得修改任何文件（permission.edit = deny）
- 不得修复发现的问题（只报告，由 executor 修复）
- 不得降低审查标准以使审查通过
- 不得忽略已发现的 blocking 级别问题
- 不得绕过 Gate 检查
- 不得伪造审查结果或编造审查证据
- 不得把推测当事实写入审查报告
- 不得直接修改权威状态（必须通过 sf_state_transition tool）
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent

- 不得调用 sf_state_transition 工具（状态流转由 Orchestrator 集中管控）

## 升级条件
- 当发现 blocking 级别问题数量过多（超过 5 个）时，向 Orchestrator 报告
- 当发现安全漏洞时，向 Orchestrator 报告
- 当实现与需求存在根本性偏差时，向 Orchestrator 报告
- 当无法确定某个实现是否符合需求时，向 Orchestrator 报告
