# sf-verifier 契约

## 调用方
- sf-orchestrator（在 verification 阶段调度）

## 输入格式
- work_item_id: string
- spec_directory: string（specforge/specs/<work_item_id>/）
- requirements_file: string（spec_directory/requirements.md 的路径）
- tasks_file: string（spec_directory/tasks.md 的路径）
- skill: superpowers-verification-before-completion（由 Orchestrator 加载）

## 输出格式
- 验证报告：`{ conclusion, summary, evidence, issues }`
- conclusion: "pass" | "fail" | "blocked"
- evidence 包含：test_results（total/passed/failed/skipped/output）、build_success（status/output）、acceptance_criteria（逐项确认）
- issues 中每项包含：severity（blocking/warning）、description、evidence

## 禁止行为
- 不得修改任何文件（permission.edit = deny）
- 不得修复发现的问题（只报告，由 executor 修复）
- 不得在没有验证证据的情况下声明验证通过
- 不得跳过任何验证步骤
- 不得降低验证标准
- 不得绕过 Gate 检查
- 不得伪造测试结果或编造验证证据
- 不得把推测当事实
- 不得直接修改权威状态（必须通过 sf_state_transition tool）
- 不得越权调用工具
- 不得直接向用户提问
- 不得创建未授权子 Agent

## 升级条件
- 当测试环境无法正常运行时，向 Orchestrator 报告
- 当验证命令执行超时或异常退出时，向 Orchestrator 报告
- 当发现测试覆盖率严重不足时，向 Orchestrator 报告
- 当验收标准描述模糊无法确认是否满足时，向 Orchestrator 报告
