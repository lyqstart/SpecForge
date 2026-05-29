# 项目工程规则 — React

<!-- 继承 _BASE.md + languages/nodejs.md，本文件只写 React 特有规则 -->

---

## 版本

```yaml
react_version: "18"               # React 主版本
                                  # 如何决策：
                                  #   React 18：并发特性，当前主流，推荐
                                  #   React 19：最新，部分 API 变化，激进项目可用

build_tool: vite                  # 构建工具
                                  # 可选：vite（推荐，快）/ create-react-app（老，不推荐新项目）
                                  # / next.js（SSR/SSG 需求时）
```

---

## 组件规则

**规则**：
1. 使用函数组件 + Hooks，不用 Class 组件（除非维护老代码）
2. 不得在 Hook 之外调用 Hook（React 规则）
3. 组件文件名用 PascalCase（`UserProfile.tsx`）
4. 每个文件只导出一个组件（除非是紧密相关的小组件）
5. Props 必须有 TypeScript 类型定义

---

## 状态管理

```yaml
state_management: "[TODO-FILL]"   # 状态管理方案
                                  # 如何决策：
                                  #   useState + Context：小型项目，无需额外库
                                  #   Zustand：中型项目，轻量，推荐
                                  #   Redux Toolkit：大型项目，团队熟悉 Redux
                                  #   Jotai / Recoil：原子化状态，特定场景
```

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.gitignore` 建议添加**（在 nodejs.md 基础上）：
   ```
   .next/
   out/
   .vercel/
   ```

2. **推荐目录结构**：
   ```
   src/
   ├── components/               # 可复用组件
   │   ├── ui/                   # 纯 UI 组件（无业务逻辑）
   │   └── features/             # 业务功能组件
   ├── pages/ 或 app/            # 页面（Next.js 约定）
   ├── hooks/                    # 自定义 Hooks
   ├── store/                    # 状态管理
   ├── services/                 # API 调用
   ├── utils/                    # 工具函数
   └── types/                    # TypeScript 类型
   ```
