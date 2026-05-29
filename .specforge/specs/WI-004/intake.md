# WI-004 Intake: SpecForge 工具裂缝修复（change_request）

## 变更背景和动机

WI-002 investigation 工作流在执行过程中发现了 SpecForge 自身工具实现的 8 条同源裂缝（详见 `.specforge/specs/WI-002/findings_report.md` §7.2）。
其中 4 条直接影响日常使用，需要通过 change_request 工作流修复，提升 SpecForge 作为开发框架的可用性。

## 受影响的功能模块

1. **Gate 工具实现**（`sf_requirements_gate` / `sf_design_gate`）
   - 硬编码文件名检查（design.md vs findings_report.md）
   - mode-blind 需求引用检查（investigation 不产生 requirements.md）
   - 隐式 H2 intro body 要求（skill 文档未明示）
2. **目录约定**（`.specforge/` vs `specforge/`）
   - spec 产物路径、配置文件、runtime 数据分布在两个目录下
   - 工具实现和 skill 文档中的路径引用不一致
3. **Skill 文档**
   - 各工作流 skill 中路径引用需统一
   - Gate 约束条件需明示（如选择路径 b for #4）

## 变更范围（4 条裂缝）

### #3 双目录约定不一致
- **现象**：`.specforge/`（带点）vs `specforge/`（不带点）
  - spec 产物路径写 `specforge/specs/`，但 `sf_artifact_write` 写到 `.specforge/specs/`
  - `specforge/config/project.json` 在不带点目录，配置三件套在 `.specforge/` 顶层
- **修复方向**：选定单一约定（推荐 `.specforge/` 作为标准），统一所有工具实现、skill 文档、系统 prompt 中的路径引用

### #4 Gate 隐式 intro body 要求
- **现象**：`sf_requirements_gate` / `sf_design_gate` 要求 H2 标题下必须有非空 intro 段落（直接接 H3 会被拒绝），但 skill 文档未明示此约束
- **修复方向**（二选一）：
  - (a) 修 Gate 实现，允许 H2 直接接 H3
  - (b) 在 skill 文档中明示此约束，由各 sub-agent 在生成时遵守

### #7 sf_design_gate 硬编码 design.md
- **现象**：investigation 工作流产物按 skill 文档约定是 `findings_report.md`，但 Gate 实现硬编码检查 `design.md`
- **修复方向**：让 Gate 实现根据 mode 参数路由到正确的文件名

### #8 sf_design_gate mode-blind 要求 requirements 引用
- **现象**：investigation 工作流不产生 `requirements.md`，但 Gate 实现仍要求文档引用"需求 X / REQ-XXX / Requirement X"
- **修复方向**：让 Gate 实现根据 `mode=investigation` 跳过该检查

## 明确排除

以下裂缝不在本 WI 范围：
- #1 WI-001 内存幽灵（属于 daemon 重设计 Phase 1）
- #2 manifest.json 缺失阻塞（属于初始化流程改造）
- #5 sf_safe_bash 不可用（属于环境问题）
- #6 task 工具静默返回（属于 OpenCode 平台问题）

## 期望产出

1. Gate 实现的代码修复（`packages/daemon-core` 或 tools/ 下相关 Gate 工具）
2. Skill 文档同步更新（如果选择路径 (b) for #4）
3. 双目录约定的迁移/统一方案
4. e2e 测试：完整跑一遍 investigation 工作流端到端，验证不再触发任何 workaround

## 约束

- **低成本优先**，串行执行
- **修复时优先选影响面小的方案**——4 条裂缝中如果某一条修复成本过高，可独立拆分为子 WI
- **写代码前必须用户明确同意**

## 引用

- `.specforge/specs/WI-002/findings_report.md` §7.2 — 8 条同源裂缝实证的完整背景
- `.specforge/specs/WI-002/research/07-limitations.md` §7.3 — 每条裂缝的代码位置和现象描述
