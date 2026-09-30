# SpecForge v1.2 Design Freeze Roadmap

<!-- SF_V12_DESIGN_FREEZE_ROADMAP -->

## 1. 冻结结论

v1.2 的冻结主题是：

```text
Project Spec Architecture + Write Guard Control Plane + Extension Subflow
```

v1.1 已经完成状态控制面、治理规则、Agent/Skill/Tool 契约、安装部署一致性和真实 OpenCode 验收。v1.2 不再继续修 v1.1 的尾巴，而是进入长期规格体系和程序级控制能力建设。

## 2. v1.2 总目标

v1.2 必须解决三个核心问题：

1. 项目级规格主线：长期规格不能散落在每个 WI 目录里；
2. 程序级 Write Guard：不能只靠提示词提醒 AI 不要乱写文件；
3. Extension Subflow：流程发现缺类型、缺扩展点时，必须有受控闭环。

## 3. v1.2 不做什么

第一阶段不做：

- 团队权限模型；
- UI 产品化；
- 多 IDE 适配；
- 大规模 daemon 重写；
- 复杂发布系统；
- 完整团队协作审批。

## 4. v1.2 第一轮开发切片

第一轮开发只做：

```text
Slice 1: Project Spec Store + Candidate Merge Contract
```

Write Guard 和 Extension Subflow 在第一轮只冻结接口、契约和验收矩阵，不做大范围实现。

## 5. 冻结原则

开发前必须先满足：

1. 设计文档已冻结；
2. 正向/负向验收项已定义；
3. 新规则测试先设计；
4. 真实运行验收先定义；
5. 不允许用旧规则跑通冒充新规则通过。

## 6. 冻结交付物

```text
docs/design/specforge-v1.2-design-freeze-roadmap.md
docs/design/specforge-v1.2-project-spec-architecture.md
docs/design/specforge-v1.2-write-guard-control-plane.md
docs/design/specforge-v1.2-extension-subflow-design.md
docs/design/specforge-v1.2-acceptance-matrix.md
docs/design/specforge-v1.2-first-development-slice.md
docs/reports/specforge-v1.2-design-freeze-report.md
scripts/verify-v12-design-freeze.ps1
```
