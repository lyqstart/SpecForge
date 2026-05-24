# 项目工程规则 — Docker

<!-- 继承 _BASE.md，本文件只写 Docker 特有规则 -->

---

## Dockerfile 规则

1. **使用官方基础镜像**，指定具体版本（`python:3.10-slim`，不用 `python:latest`）
2. **多阶段构建**：build 阶段和 runtime 阶段分开，减小最终镜像大小
3. **非 root 用户运行**：`USER nonroot`（安全最佳实践）
4. **不在镜像中存储密钥**：密钥通过环境变量或 secrets 注入
5. **`.dockerignore` 必须存在**：排除 node_modules / .git / .env 等

---

## 镜像规则

```yaml
base_image_policy: official-only  # 只使用官方或可信镜像
image_tag_policy: specific-version # 不用 latest，用具体版本
```

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.dockerignore` 建议添加**：
   ```
   .git
   .gitignore
   node_modules
   .env
   .env.*
   *.log
   dist
   build
   __pycache__
   .pytest_cache
   ```

2. **推荐 Dockerfile 结构（以 Node.js 为例）**：
   ```dockerfile
   # 构建阶段
   FROM node:20-slim AS builder
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production

   # 运行阶段
   FROM node:20-slim AS runtime
   WORKDIR /app
   # 创建非 root 用户
   RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
   COPY --from=builder /app/node_modules ./node_modules
   COPY . .
   USER appuser
   EXPOSE 8080
   CMD ["node", "src/index.js"]
   ```
