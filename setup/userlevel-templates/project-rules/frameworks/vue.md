# 项目工程规则 — Vue

<!-- 继承 _BASE.md + languages/nodejs.md，本文件只写 Vue 特有规则 -->

---

## 版本

```yaml
vue_version: "3"                  # Vue 主版本
                                  # 如何决策：
                                  #   Vue 3：Composition API，当前主流，推荐所有新项目
                                  #   Vue 2：EOL（2023 年 12 月），仅维护老项目

build_tool: vite                  # 构建工具（Vue 官方推荐）
```

---

## 组件规则

**规则**：
1. 使用 `<script setup>` 语法（Vue 3 推荐，更简洁）
2. 组件文件名用 PascalCase（`UserProfile.vue`）
3. Props 必须有类型定义（`defineProps<{...}>()`）
4. 不得在 `setup()` 之外使用 Composition API

---

## 状态管理

```yaml
state_management: pinia           # 状态管理
                                  # 推荐：Pinia（Vue 官方推荐，替代 Vuex）
                                  # 如何决策：
                                  #   Pinia：新项目，TypeScript 友好
                                  #   Vuex 4：老项目迁移成本高时保留
```

---

## 技术栈最佳实践 — 项目应同时做的事

1. **推荐目录结构**：
   ```
   src/
   ├── components/               # 可复用组件
   ├── views/                    # 页面级组件
   ├── router/                   # Vue Router 配置
   ├── stores/                   # Pinia stores
   ├── composables/              # 可复用的 Composition 函数
   ├── services/                 # API 调用
   ├── utils/                    # 工具函数
   └── types/                    # TypeScript 类型
   ```
