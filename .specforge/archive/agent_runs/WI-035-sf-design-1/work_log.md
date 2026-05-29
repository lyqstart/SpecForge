# Work Log: WI-035 Design Phase

## 任务摘要

为 WI-035（新项目初始化流程跳过 .specforge/ 目录创建和环境扫描）生成 design.md，包含：
- 根因分析确认（prompt 竞争条件）
- 三重修复方案设计（prompt 守卫 + 代码守卫 + manifest.json 引导）
- 不变行为保护策略
- 测试策略和正确性属性

## 执行过程

### 1. 信息收集（并行读取）
- 读取 `specforge/specs/WI-035/bugfix.md` — 根因分析和不变行为
- 读取 `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` (498行) — 用户级 orchestrator 定义
- 读取 `D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md` (223行) — 项目级 orchestrator 定义
- 读取 `C:\Users\luo\.config\opencode\tools\sf_state_transition.ts` — 工具定义
- 读取 `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` — daemon handler
- 读取 `packages/daemon-core/src/project/ProjectManager.ts` — 项目管理器
- 读取 `packages/daemon-core/src/tools/lib/sf_doctor_core.ts` — doctor 核心逻辑
- 读取 `packages/workflow-runtime/src/WorkflowEngine.ts` — transitionFull 方法
- 检查 `.specforge/dev-environment.md` — 不存在（当前项目非测试目标）
- 检查 `.specforge/prod-environment.md` — 不存在
- 检查 `.specforge/project-rules.md` — 不存在

### 2. 根因确认
- 确认根因为 prompt 设计缺陷：启动流程和意图分类的"第一步"声明冲突
- 确认不存在代码级 guard 阻止跳过启动流程
- 确认 manifest.json 的预期创建者（orchestrator 启动流程）未被执行
- 确认 ProjectManager 和 WorkflowEngine 各自正确但职责不同

### 3. 方案评估
- 方案 A（仅 prompt）：改动最小但无硬性保障
- 方案 B（仅代码）：硬性保障但错误恢复路径不完整
- 方案 C（组合）：prompt 主路径 + 代码兜底 + manifest.json 引导 → **推荐**

### 4. 设计编写
- 编写了 5 个设计决策（DD-1 至 DD-5）
- 绘制了架构依赖图（Mermaid）
- 定义了 4 个正确性属性（CP-1 至 CP-4）
- 制定了 5 层测试策略
- 进行了 5 条架构属性自检（A1-A5）

### 5. 质量检查
- `sf_doc_lint`: ✅ pass（无结构问题）
- `sf_design_gate`: ✅ pass（第一次因缺少 REQ 引用失败，补充需求追溯映射后通过）
- KG 同步：+5 nodes

## 遇到的问题

1. **Design gate 初次失败**：设计文档使用了 `bugfix.不变行为.INV-1` 等参考格式，但 gate 要求 `REQ-N` 格式。解决方案：添加"需求追溯映射"章节，将 bugfix.md 中的预期行为和不变行为映射为 REQ-1 至 REQ-11 编号，并更新所有 DD-N 和 CP-N 的 refs 字段。

2. **配置文件缺失**：`.specforge/dev-environment.md`、`prod-environment.md`、`project-rules.md` 在当前项目根目录不存在。这不影响本次设计（WI-035 本身就是修复这些文件缺失的问题），但意味着 constrained_by 字段无法引用这些配置。

3. **manifest.json 字段命名不一致**：当前 `specforge/manifest.json` 使用 `data_schema_version`，而 orchestrator prompt 引用 `schema_version`。在设计中将此作为 DD-3 的一部分提出统一方案。

## 最终结论

**产出文件**：`specforge/specs/WI-035/design.md`

**设计核心**：组合方案（prompt 守卫 + 代码守卫 + manifest.json 引导），从根本上消除 prompt 竞争条件，同时提供代码级硬守卫作为防御深度。

**修改文件清单**：
1. `C:\Users\luo\.config\opencode\agents\sf-orchestrator.md` — DD-1 prompt 重组
2. `D:\code\temp\SpecForge\.opencode-\agents\sf-orchestrator.md` — DD-1 同步修复
3. `packages/daemon-core/src/tools/handlers/sf-state-transition.ts` — DD-2 代码守卫
4. `specforge/manifest.json` — DD-3 字段统一

**工具调用统计**：
- `read`: ~15 次
- `grep`: ~4 次
- `glob`: ~3 次
- `write`: 1 次（design.md）
- `edit`: 9 次（ref 更新）
- `sf_doc_lint`: 1 次
- `sf_design_gate`: 2 次
- `sf_artifact_write`: 1 次（work_log）
