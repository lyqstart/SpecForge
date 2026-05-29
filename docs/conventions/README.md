# SpecForge 约定中心

> 本目录是 SpecForge 项目治理规则的集中文档库。所有约定文档从此处导航。

## 文档索引

### 核心约定
| 文档 | 说明 |
|------|------|
| [directory-layout.md](directory-layout.md) | 项目目录布局约定（自动从 Schema 生成） |
| [wi-lifecycle.md](wi-lifecycle.md) | Work Item 生命周期与状态流转 |
| [glossary.md](glossary.md) | 术语表 |

### 补充约定
| 文档 | 说明 |
|------|------|
| [workflow-types.md](workflow-types.md) | 8 种工作流详解 |
| [agent-roles.md](agent-roles.md) | 9 个 Agent 职责 |
| [meta-json-spec.md](meta-json-spec.md) | `_meta.json` 字段规范 |
| [file-naming.md](file-naming.md) | 命名约定 |

## 治理规则

- **路径常量**：所有 `.specforge/` 路径必须通过 `packages/types/src/directory-layout.ts` 的常量/函数引用
- **白名单机制**：`.lintrc-layout.json` 定义允许使用裸路径字符串的文件
- **三道强制门**：编译期（TypeScript `as const`）+ PR 期（CI Lint）+ 运行期（Architecture Test）
- **文档自动生成**：directory-layout.md 由 `scripts/render-layout.ts` 从 Schema 生成

## 关联文档

- [架构决策记录](../adr/) — ADR-006 等
- [方案文档](../proposals/) — 目录结构治理方案 A
- [工程经验库](../engineering-lessons/) — 团队踩坑记录
