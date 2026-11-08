# 项目工程规则 — FastAPI

> 使用边界：这是业务项目规则素材，模板值和版本示例不是已核验事实。命令仅作待批准 Task 的验收声明；D18 sf_safe_bash 保持只读。真实 sf-orchestrator 使用 sf_verification_plan，真实 sf-verifier 使用 sf_verification_run；不支持的命令保持 not_executed/blocked，不得改走 shell。模板不能扩大 D23 的 Windows x64 严格单进程只读 Node profile。

<!-- 继承 _BASE.md + languages/python.md，本文件只写 FastAPI 特有规则 -->

---

## 版本

```yaml
fastapi_version: "0.110+"         # FastAPI 版本
pydantic_version: "v2"            # Pydantic 版本
                                  # 为什么要配：Pydantic v1 和 v2 API 不兼容
                                  # 如何决策：新项目用 v2（性能更好）；
                                  # 老项目迁移成本高可保留 v1
```

---

## API 设计规则

**规则**：
1. 所有请求/响应必须用 Pydantic 模型定义（不得用裸 dict）
2. 路由函数必须有类型注解
3. 异步路由用 `async def`，同步 IO 密集操作用 `def`（FastAPI 会在线程池中运行）
4. 错误响应使用 `HTTPException`，不得直接 return 错误字符串

---

## 技术栈最佳实践 — 项目应同时做的事

1. **推荐目录结构**：
   ```
   app/
   ├── main.py                   # FastAPI 应用入口
   ├── config.py                 # 配置（从环境变量读）
   ├── dependencies.py           # 依赖注入
   ├── routers/                  # 路由（按功能模块分文件）
   ├── models/                   # Pydantic 模型（请求/响应）
   ├── schemas/                  # 数据库 ORM 模型（如用 SQLAlchemy）
   ├── services/                 # 业务逻辑
   └── utils/                    # 工具函数
   tests/
   ├── conftest.py               # pytest fixtures（含 TestClient）
   └── test_*.py
   ```
