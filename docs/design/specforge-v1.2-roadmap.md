# SpecForge v1.2 Roadmap

## 1. v1.2 总目标

v1.2 不应继续在 v1.1 的状态机和治理闭环上打补丁。v1.1 已经完成：

- 状态唯一真相源；
- 最终治理规则；
- Agent / Skill / Tool 契约；
- installer / live 用户目录一致性；
- OpenCode 真实运行验收。

v1.2 的核心目标应转向：

```text
项目级规格体系 + 程序级 Write Guard + Extension Subflow + 多 WI 规格演进
```

## 2. v1.2 的主线问题

### 2.1 项目级规格体系

当前 WI 目录承载了大量过程产物，但长期规格不能散落在每个 WI 中。

v1.2 应明确：

```text
.specforge/project/** 是项目级规格主线。
.specforge/work-items/WI-XXXX/** 是变更过程、证据、决策和验证记录。
```

WI 可以产生候选规格变更，但最终应合并到项目级规格主线。

### 2.2 Write Guard 程序级控制

v1.1 已经要求 `sf_code_permission` 和 changed files audit，但 v1.2 需要更强：

- AI 不能绕过 SpecForge 直接写文件；
- OpenCode edit/write/bash 等写入能力必须被程序控制；
- 允许写入的路径必须来自 WI 的 code permission；
- 所有写入必须可审计；
- 越权写入必须 fail-fast，并进入 blocked 或 gates_failed。

### 2.3 Extension Subflow

v1.2 要解决主流程中发现缺失扩展类型、缺失 workflow 类型、缺失 artifact 类型时如何闭环。

Extension Subflow 应当：

- 由主流程发起；
- 由独立 extension agent / tool 执行；
- 产出 extension proposal；
- 通过用户审批；
- 合并 extension registry；
- 返回主流程继续执行；
- 不允许子 agent 无限递归开子 agent。

### 2.4 多模块大型项目规格演进

v1.2 需要支持大型项目：

- project-level spec；
- module-level spec；
- requirements / design / architecture / trace 的分层；
- 多 WI 对同一规格的变更冲突检测；
- spec version 与代码版本映射。

## 3. v1.2 建议阶段

### Phase 1：项目级规格目录与迁移规则

交付：

```text
docs/design/specforge-v1.2-project-spec-architecture.md
```

目标：

- 明确 `.specforge/project/**` 目录；
- 明确 WI 目录与项目级规格的关系；
- 明确 candidate -> merge -> project spec 的路径。

### Phase 2：Write Guard 控制面设计

交付：

```text
docs/design/specforge-v1.2-write-guard-control-plane.md
```

目标：

- 明确哪些工具能写文件；
- 明确写入权限如何授予；
- 明确如何阻止绕过；
- 明确审计事件格式。

### Phase 3：Extension Subflow 设计

交付：

```text
docs/design/specforge-v1.2-extension-subflow-design.md
```

目标：

- 明确发起者、执行者、输入、输出、返回机制；
- 明确 extension registry；
- 明确审批边界。

### Phase 4：v1.2 实施前冻结

目标：

- 先完成设计冻结；
- 再进入代码实现；
- 不允许边开发边改规则。

## 4. v1.2 启动原则

```text
先设计，后实现。
先规则，后代码。
先验收项，后补丁。
先真实运行链路，后发布。
```
