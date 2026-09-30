# SpecForge 当前发布边界与模块收敛实施方案

## 1. 文档职责

本文是 ADR-013 的专题执行方案，回答“按照什么顺序把已批准决策落实到权威、模块、代码、测试和发布证据”。

本文不是：

- V6 产品需求或产品架构权威；
- 架构一致性治理总方案的替代品；
- 当前进度或完成声明；
- 模块已经可以删除的授权。

当前进度只记录在 `current-release-boundary-and-module-convergence-progress.md`。任何步骤完成后只更新进度文件，不回写本方案的步骤定义。

## 2. 目标与完成标准

### 2.1 目标

建立一个与当前真实业务一致、无旧项目兼容分支、模块边界清晰、生产入口与部署内容一致，并能够通过可信全量回归证明的 SpecForge 当前发布基线。

### 2.2 最终完成标准

全部条件同时满足才允许声明本方案完成：

1. V6 requirements 已明确当前发布能力、不做边界和无旧项目兼容边界；
2. V6 design 已给出实际启用模块、依赖、入口、状态权威、数据流和部署拓扑；
3. 每个仓库 package、setup 模块和运行入口都有唯一分类及证据；
4. 19 项修改逐项绑定当前能力与治理依据，保留/调整/删除结论完整；
5. built-not-enabled 与 legacy-only 内容已按批准结论退出构建、部署或仓库；
6. 代码、测试、安装器、脚本、模块 spec 和治理总方案与 V6 权威一致；
7. 定向测试、package 构建、确定性全仓构建、全量回归和真实安装验证全部通过；
8. 错误账本、专题进度、current-handoff 和发布说明与同一证据对账；
9. 没有通过恢复旧行为、降低 Gate 或修改测试期望来掩盖产品缺陷；
10. Git 修改集合经过完整 diff、未跟踪文件、哈希和状态审计后才允许提交。

## 3. 权威与消费者顺序

```text
用户批准的业务决策
→ docs/adr/ADR-013（决策与理由）
→ V6 requirements.md（产品范围权威）
→ V6 design.md（产品架构权威）
→ 架构一致性治理总方案与模块 specs（治理和模块投影）
→ packages / setup / scripts（实现与部署）
→ tests / validation gates（验证消费者）
→ README / handoff / progress / release notes（状态与说明投影）
```

只读证据重建和计划文件不属于产品行为修改。进入产品修改后，第一处变更必须是 V6 requirements；在 requirements 和 design 都冻结以前，禁止删除模块或扩大代码修改。

## 4. 统一判断模型

### 4.1 模块分类

每个模块只能选择一个发布分类：

| 分类 | 业务含义 | 默认动作 |
|---|---|---|
| `CURRENT_RELEASE_CORE` | 当前业务闭环不可缺少 | 保留并完成强回归 |
| `CURRENT_RELEASE_SUPPORTING` | 被核心链路真实调用的支撑能力 | 保留；证明调用和降级边界 |
| `BUILT_NOT_ENABLED` | 有实现但当前产品未启用 | 由当前范围决定启用或删除，禁止无限搁置 |
| `LEGACY_ONLY` | 只服务旧项目、旧协议、旧状态或旧路径 | 从当前发布删除 |
| `HISTORICAL_EVIDENCE_ONLY` | 仅为审计和历史追溯存在 | 保留原文，但退出构建和运行 |

### 4.2 模块证据卡

每个模块必须形成一张证据卡，至少包含：

```text
MODULE_ID=
BUSINESS_CAPABILITY=
PACKAGE_OR_PATH=
PRODUCTION_ENTRY=
DIRECT_CALLERS=
STATE_AUTHORITY=
DATA_INPUT_OUTPUT=
DEPLOYMENT_ENTRY=
RUNTIME_ENABLEMENT=
CURRENT_TEST_COVERAGE=
GOVERNANCE_SOURCE=
LEGACY_DEPENDENCY=
CLASSIFICATION=
DISPOSITION=KEEP|ENABLE|REMOVE|HISTORICAL_ONLY
EVIDENCE_STRENGTH=CONFIRMED|CORROBORATED|INSUFFICIENT_EVIDENCE
```

没有生产入口命中不能单独证明模块未使用；必须同时核对动态注册、配置加载、安装清单、插件注册、Workflow/Gate registry 和运行时分发。

### 4.3 19 项修改证据卡

每项修改必须回答：

```text
CHANGE_PATH=
OWNING_ACTIVE_CAPABILITY=
RESPONSIBILITY_LAYER=
ERROR_LEDGER_REFERENCE=
AUTHORITATIVE_REQUIREMENT=
PRODUCTION_CONSUMERS=
TEST_EVIDENCE=
LEGACY_ONLY=YES|NO
DECISION=KEEP|ADJUST|REMOVE
```

历史 ERR 和隔离测试能证明修改曾解决真实问题，但不能单独证明对应模块仍属于当前发布；最终去留必须同时满足当前 V6 权威和真实生产使用证据。

## 5. 实施步骤

### Step 0：冻结基线、决策和执行入口

目的：保证后续工作不会重新从零分析，也不会丢失当前 dirty patch 历史。

输入：main HEAD、origin/main、Git status、current-handoff、错误账本、现有回归证据。

产物：

- ADR-013；
- 本实施方案；
- 专题进度文件；
- 当前基线和禁止动作。

验收：三个文件职责不重叠，路径可解析，进度与 Git/测试事实一致。

### Step 1：重建真实架构与模块使用清单（只读）

目的：回答“系统现在实际上怎样运行”，不依赖 README 或历史摘要推断。

必须核对：

1. Daemon、CLI、OpenCode plugin、installer/service 的真实启动入口；
2. HTTP/Tool/Workflow/Gate/Agent 的实际调用链；
3. events/WAL、state、Project Spec、Candidate、Gate Attempt、Audit 的权威所有者；
4. package import 依赖与动态 registry；
5. setup、installer、用户级部署和 manifest 的实际文件集合；
6. feature flags、模式分支、未注册 handler、未部署 package；
7. 真实测试入口和当前回归失败集合。

产物：实际架构图、package 依赖图、模块证据卡全集、现役主链路、built-not-enabled 清单。

停止条件：任一模块的生产入口、部署状态或责任层证据不足时标记 `INSUFFICIENT_EVIDENCE`，不得据此删除。

### Step 2：先修改 V6 requirements 产品范围权威

这是本方案进入产品变更后的第一步。

必须更新：

1. Introduction/Glossary 中当前发布定义；
2. “V6 不兼容 V5”与 Requirement 2.3 的冲突；
3. 当前发布做什么、不做什么；
4. 无旧项目兼容的精确定义；
5. 历史证据保留与产品兼容支持的区别；
6. built-not-enabled 的产品决策规则；
7. 当前发布验收条件。

禁止同时修改 README、代码或构建脚本来抢先表达尚未冻结的需求。

验收：需求内部无互斥条款，Glossary、User Story、Acceptance Criteria 使用同一边界。

### Step 3：修改 V6 design 架构权威

必须更新：

1. 当前真实进程拓扑；
2. 启用模块和明确退出模块；
3. package 依赖与跨模块调用；
4. 状态、数据和事件的唯一权威；
5. 运行、部署和安装拓扑；
6. built-not-enabled 模块的启用或删除目标；
7. 无旧项目兼容后的迁移、恢复和错误处理边界；
8. 与 requirements 每条变更的映射。

验收：设计能够解释所有现役生产入口；任何代码中存在但设计未容纳的能力都被显式列为缺陷或待删除项。

### Step 4：同步 ADR、治理总方案和模块 specs

目的：让决策理由、治理执行机制和模块局部设计成为 V6 权威的受控消费者。

必须处理：

- ADR-013 与 V6 权威的交叉引用；
- `SpecForge架构一致性治理最终实施方案.md` 中 legacy read、schema compatibility、reconstruction 等规则的逐条分类；
- 各 module spec 的范围、依赖和状态；
- V6 spec-local ADR 索引与仓库级 ADR 命名空间说明。

不得把“无旧项目兼容”扩大解释为删除当前发布的数据安全、失败关闭或历史审计证据。

### Step 5：冻结模块去留与 19 项修改结论

基于 Step 1–4 的权威和证据，输出两个最终矩阵：

1. 模块：`KEEP / ENABLE / REMOVE / HISTORICAL_ONLY`；
2. 19 项修改：`KEEP / ADJUST / REMOVE`。

每个删除结论必须列出全部生产调用者、测试、部署消费者和恢复影响；任何未对账消费者都会阻断删除。

### Step 6：实施代码、测试、安装和脚本收敛

执行顺序：

1. 测试先固定当前合同的正向/反向行为；
2. 由各 owner 的真实枚举 API 生成来源哈希绑定的只读 release snapshot；禁止用正则扫描源码或调用方自报集合冒充动态 registry / installer 事实；
3. 由 Scope Gate 消费 owner snapshot，生成 package、build、registry、installer、manifest、runtime 六个独立表面报告；
4. 修正现役代码中的旧 ID、旧状态、旧路径、旧协议；
5. 删除 legacy-only 兼容分支；
6. 删除已批准退出的 built-not-enabled 模块；
7. 同步 package exports/dependencies、registry、setup、installer 和 manifest；
8. 删除失效测试消费者，但保留错误账本和历史治理文档。

动态 registry / installer snapshot 的最小闭环必须同时满足：Tool 集合来自 `ToolDispatcher` 实际注册表，Workflow 集合来自 `WorkflowLoader` 实际加载结果，installer 集合来自 `SHARED_COMPONENT_REGISTRY` 及其真实 source asset；每个 owner 输出必须带 owner id、来源文件 SHA-256、完整性声明和确定性排序。任何 owner 缺失、来源 hash 漂移、重复 ID、无法加载或只提供源码文本扫描结果都必须失败关闭。

禁止为减少 diff 而留下不可达半模块，也禁止用删除失败测试代替产品修复。

### Step 7：分层定向验证

从近到远执行：

1. 独立缺陷回归；
2. 模块单元/属性测试；
3. package 构建与类型检查；
4. 跨模块集成；
5. setup/installer/deployment consistency；
6. 真实 daemon/OpenCode 边界验证。

每个新失败先记 ERR、分类、复读经验门禁，再决定修复动作。

### Step 8：可信全量回归与发布证明

可信全量回归必须满足：

- 测试集合只消费当前权威，不包含被误当作现役合同的历史夹具；
- 全部 package 和部署内容与设计模块集合一致；
- 失败集合为零，或每个批准的非阻断失败有独立、明确、非产品归属证据；
- 构建前后生成文件集合受控；
- fresh root 与当前工作区结果可比较；
- 当前 release artifact 与源码、manifest、installer 一致。

### Step 9：下游文档、Git 与发布收口

最后同步 README、current-handoff、专题进度和发布说明。提交前执行完整 diff/status/未跟踪文件/哈希审计；未经用户后续明确授权不提交、不推送、不部署。

## 6. 每步更新进度的规则

每完成一个步骤，进度文件必须追加或更新：

```text
STEP_ID=
STEP_STATUS=
EVIDENCE=
FILES_CHANGED=
TEST_RESULT=
OPEN_ERRORS=
INSUFFICIENT_EVIDENCE=
NEXT_LEGAL_ACTION=
```

步骤状态只能使用稳定生命周期值：`IDENTIFIED`、`FIX_IMPLEMENTED`、`ISOLATED_VALIDATED`、`REAL_APPLIED`、`COMMITTED`、`USERLEVEL_DEPLOYED`、`REAL_PROJECT_VALIDATED`、`CLOSED`；尚未开始使用 `NOT_STARTED`。

子步骤完成不能关闭父方案。只有 Step 0–9 全部满足完成标准后，`PLAN_STATUS` 才能变为 `CLOSED`。

## 7. 当前禁止动作

- 在 V6 requirements/design 对齐前物理删除模块；
- 为旧项目恢复废止状态、ID、路径或协议；
- 把历史文档中的字符串命中当成现役生产调用；
- 先改 README、handoff、构建脚本或测试来定义产品范围；
- 未冻结模块矩阵就批量删除 package；
- 未完成定向分类就反复运行宽泛全量回归；
- 删除 ERR、Gate Attempt、审计记录或 Git 历史；
- 未完成验证就提交、推送或用户级部署。
