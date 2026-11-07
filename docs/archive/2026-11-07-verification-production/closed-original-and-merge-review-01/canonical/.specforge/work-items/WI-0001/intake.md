# Intake — WI-0001

Work Item: WI-0001
Created: 2026-10-25T05:17:46.998Z（Runtime 生成）
Workflow: feature_spec / requirement_change_path（Runtime 依据 11 项事实分类路由）
模块归属：CORE（spec_manifest.json 唯一已声明模块，default_module=CORE）

## 用户原始目标

在隔离的 Greeting Library 业务项目中，通过 SpecForge 当前正式 feature_spec 流程实现首个功能：新增 `src/greet.ts`，导出 `greet(name: string): string`；非空名称返回 `Hello, <name>!`，空名称返回 `Hello, world!`；补充可验证这两个行为的测试和使用说明；从项目初始化、Work Item、分析、候选和 Gate 持续推进到真实用户审批边界，展示候选及待批准内容后停止等待批准。

## 明确事实

1. 用户原话明确的行为契约：
   - "新增 src/greet.ts，导出 greet(name: string): string"
   - "非空名称返回 Hello, <name>!"
   - "空名称返回 Hello, world!"
   - "补充可验证这两个行为的测试和使用说明"
2. 用户原话明确的流程约束：
   - "只使用当前正式工具、已安装 Agent 和 Skill"
   - "严格遵守 D18，不得直接编辑 .specforge 真相源、伪造证据或通过其他执行器运行禁止的测试"
   - "从项目初始化、Work Item、分析、候选和 Gate 持续推进到真实用户审批边界；展示当前候选及需要批准的具体内容后停止，不能把本条需求当作候选批准"
   - "如遇无法合法恢复的 HardStop 或缺失能力，保存正式阻断证据并明确最后成功点"
3. 项目观测事实（2026-10-25 只读取证）：
   - README.md 标题 "Greeting Library"，正文："A synthetic TypeScript greeting library for an isolated governance acceptance run. No production data."（TypeScript 库；隔离验收运行；无生产数据）
   - 项目根仅有 `.git/`、`.specforge/`、`README.md`；无 package.json、tsconfig.json、`src/`、`tests/` → 本功能为项目首个正式功能（greenfield）
   - `.specforge/project/spec_manifest.json`：project_spec_version=PSV-0001，default_module=CORE，唯一已声明模块 CORE（active，尚无 code_paths）
   - `.specforge/project/architecture.md` 为占位（"> TODO: 由首次 intake 阶段填充"）→ 首份正式架构、数据模型、模块契约由本 WI 创建
   - `.specforge/config/project-rules.md`、`.specforge/config/prod-environment.md` 为占位文件（sf_project_init placeholderFiles 证实）
4. 环境事实：win32；项目为 Git 仓库（`.git/` 存在，无远程配置证据）；工作目录为隔离临时目录。

## 用户结果

交付可验证的 TypeScript Greeting Library 首个功能：

1. `src/greet.ts` 存在并导出 `greet(name: string): string`；
2. 非空名称调用返回 `Hello, <name>!`；空名称调用返回 `Hello, world!`；
3. 存在覆盖上述两条行为的自动化测试（批准后实现并取证）；
4. 存在使用说明（调用方式与两种返回行为）；
5. 全程通过 SpecForge feature_spec 治理链（候选 → Gate → 用户批准边界）。

## 未知项

1. 项目无 package.json/tsconfig/测试框架配置：测试运行器与最小工程配置选型待设计阶段以零依赖方案优先决策并取证。
2. Node.js/TypeScript 具体可用版本未取证（D18 当前禁止外部命令，无法实测 `node --version` 等；设计将优先采用零依赖 Node 内置测试方案规避版本与安装风险，并在实现/验证阶段以真实运行证据确认）。

## 决策边界

可由项目事实推导（无需用户逐项确认）：

- 模块归属：`src/greet.ts`、测试与使用说明属于已声明默认模块 CORE。
- 技术栈基线：TypeScript 库（README 明示）；零依赖优先。
- 候选产物结构、REQ/AC/DD/TASK 编号与追溯格式：由各专业 Agent 按当前正式规范生成。

必须由用户确认（本轮审批边界）：

- 需求候选、设计候选（含首份架构/数据模型/模块契约）、任务与追溯候选的批准；
- 项目配置说明（project-rules.md / prod-environment.md，本轮基于 README 与用户原话推导生成，可要求修改）。

## 禁止假设

- 不得假设存在任何包管理器依赖、构建脚本或 CI 可用；项目当前无 package.json。
- 不得假设 `greet` 在两条明确规则之外还有其他分支（如 null/undefined/纯空白输入的额外行为）——需求以"字符串输入、空与非空"为界，额外分支未经批准不得实现。
- 不得假设用户已批准任何候选：本条用户消息本身不构成候选批准（用户原话明确）。
- 不得假设测试已被执行或通过：D18 当前禁止测试执行；缺乏合法验证证据前，任何"测试通过"表述均为禁止。
- 不得把 README 与目录观测之外未取证的能力（npm registry、网络、外部执行器）当作事实。

## 建议调查项

1. 设计阶段：确认零依赖测试方案（Node 内置 node:test）与 TypeScript 编译/类型检查路径，形成 DD 决策。
2. 任务规划：将 package.json/tsconfig/测试/README 使用说明全部纳入受控任务与 allowed_write_files 候选范围。
3. 批准后实现与验证阶段：在 D18 允许的执行边界内以真实运行证据验证两条 AC；若执行被治理拒绝，按可恢复 HardStop 协议处理并保留证据。

## 项目配置说明生成方式

用户本轮明确要求"持续推进到真实用户审批边界"，sf-intake B1–B4 的交互式提问以 README 与用户原话的既有事实替代：project-rules.md 与 prod-environment.md 于 intake_ready 窗口受控生成，随候选包在审批边界一并展示，用户可要求修改。
