# SpecForge v1.1.5 Agent / Skill / Tool Contract Alignment Report

## Fix01

初版失败原因不是治理规则失败，而是 contract 文本与测试断言不一致：

- contract 初版写法：`` `work_item.json` is metadata only. ``
- 测试断言：`work_item.json is metadata only`

Fix01 同时修正 contract 与测试：
- contract 改为纯文本关键句：`work_item.json is metadata only.`
- 测试读取 markdown 时去掉反引号，避免 Markdown inline code 影响关键规则断言。

## 目标

本轮不是继续修改 daemon 状态控制面，也不是重跑人工 P1/P2/P3。目标是把 v1.1.3/v1.1.4 已经验证并自动化覆盖的最终治理规则，下沉到 userlevel Agent/Skill 文档层，防止运行时被旧文档提示带偏。

## 修改策略

统一采用“Final Governance Contract Block”方式：

1. 扫描 `setup/userlevel-opencode/agents/**/*.md`；
2. 扫描 `setup/userlevel-opencode/AGENTS.md`；
3. 扫描 `setup/userlevel-opencode/skills/sf-*/*.md` 及其子目录；
4. 对每个目标 Markdown 文件插入或替换：
   `SPECFORGE_V11_FINAL_GOVERNANCE_CONTRACT` 块；
5. 通过自动化测试强制所有目标文件都带同一个最终治理契约；
6. 通过测试禁止目标文档继续出现明确旧主链路指令。

## 自动化测试

新增：

`packages/daemon-core/tests/v11-agent-skill-contract-alignment.test.ts`

测试内容：

1. 所有 userlevel SpecForge Agent/Skill 文档必须包含 contract block；
2. contract block 必须包含关键最终治理规则；
3. contract block 之外不得出现明确旧状态主链路推进指令；
4. setup wrapper 必须保留最终治理字段；
5. daemon handler 必须仍满足核心规则。
