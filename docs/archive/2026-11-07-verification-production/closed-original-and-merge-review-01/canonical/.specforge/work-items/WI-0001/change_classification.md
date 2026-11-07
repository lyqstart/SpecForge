# Change Classification — WI-0001

分类对象：用户目标实现后的预期最终语义影响（非当前动作工作量）。每字段独立举证，证据来源 = 用户原话（WI-0001 intake.md）+ 项目只读观测（2026-10-25）。

## 事实分类（11 项）

| 字段 | 值 | 举证 |
| --- | --- | --- |
| requirement_changed | true | 新增产品功能：greeting 能力（src/greet.ts 导出 greet），用户原话明确 |
| acceptance_criteria_changed | true | 新增两条可验证验收标准：非空名称返回 `Hello, <name>!`；空名称返回 `Hello, world!` |
| business_rule_changed | true | 新增业务规则：空名称回退为默认问候 `Hello, world!`（域级行为规则，非仅工程约束） |
| user_visible_behavior_changed | true | 库公共行为面新增导出函数，调用方可观察返回值行为 |
| data_semantics_changed | false | 无持久化数据、无存储模型；仅纯函数字符串输入/输出（举证：项目根无任何数据存储，README "No production data"） |
| design_changed | true | CORE 模块首个正式模块设计（modules/CORE/design.md 为占位，将从占位创建首份正式设计） |
| module_boundary_changed | false | 全部计划路径（src/tests/README/package.json/tsconfig）归属唯一已声明模块 CORE（spec_manifest PSV-0001）；不新增模块、不移动边界 |
| api_contract_changed | true | 新增公共 API：`greet(name: string): string`（库公共接口契约变化） |
| architecture_changed | true | 项目 architecture.md 为占位（"> TODO"），本 WI 从缺失状态创建首份正式 Project Architecture |
| data_model_changed | true | 项目无任何正式 Data Model，本 WI 从缺失状态创建首份正式 Data Model（greet 输入/输出语义） |
| module_contract_changed | true | CORE 无任何正式模块契约，本 WI 从缺失状态创建首份正式 Module Contract |
| contract_registry_only | false | 本 WI 含真实代码实现与测试，非仅契约登记册变更 |

## unknowns

1. 项目当前无 package.json/tsconfig/测试框架配置，测试运行器与最小工程配置需由设计阶段以零依赖方案优先决策并取证。
2. Node.js/TypeScript 具体可用版本未取证（D18 禁止外部命令；设计以零依赖方案规避，实现/验证阶段以真实运行证据确认）。

## 路由结论

Requirement / Acceptance Criteria / Business Rule 变化 → `requirement_change_path`（Runtime 于 WI 创建时已按同一事实路由，本分类与之一致）。
