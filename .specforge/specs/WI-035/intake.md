# Intake: 新项目初始化流程跳过 .specforge/ 目录创建和环境扫描

## Bug 描述

### 当前行为
在新项目目录（如 `D:\code\temp\wzq`）中启动 SpecForge 时：
1. orchestrator 检测到 `.specforge/` 目录不存在
2. **应该**创建目录 → 实际：跳过，未创建
3. **应该**执行开发环境扫描（intake A 阶段）→ 实际：跳过
4. 直接跳转到 Work Item 创建（intake B 阶段）

### 预期行为
根据 orchestrator agent 规范的"启动流程"：
- 步骤 1：检测 `.specforge/` 不存在 → **创建目录**，进入"项目初始化"流程
- 步骤 2：加载 intake skill 的 A 阶段 → **扫描开发环境**，生成/更新 `dev-environment.md`

### 复现步骤
1. 新建空项目目录
2. 在目录中用 OpenCode 发起 SpecForge 开发请求（如"开发一个网页版游戏"）
3. 观察 `.specforge/` 是否被创建

### 影响范围
- 新项目首次使用时，缺失项目配置（`dev-environment.md`、`project-rules.md`）
- 后续 WI 的 design 阶段缺少技术栈决策依据
- personal 模式下 `.specforge/.gitignore` 不会自动生成（该逻辑在 ProjectManager 中，但目录结构初始化由 orchestrator 负责）

### 环境
- SpecForge v6.0-dev
- Windows 11
- OpenCode + sf-orchestrator agent
