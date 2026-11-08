# 项目工程规则 — Redis（缓存 / 消息队列）

> 使用边界：这是业务项目规则素材，模板值和版本示例不是已核验事实。命令仅作待批准 Task 的验收声明；D18 sf_safe_bash 保持只读。真实 sf-orchestrator 使用 sf_verification_plan，真实 sf-verifier 使用 sf_verification_run；不支持的命令保持 not_executed/blocked，不得改走 shell。模板不能扩大 D23 的 Windows x64 严格单进程只读 Node profile。

<!-- 继承 _BASE.md，本文件只写 Redis 特有规则 -->

---

## 版本

```yaml
redis_version: "[来自 prod-environment.md]"
redis_use_case: cache             # 使用场景
                                  # 可选：cache / session / queue / pubsub / all
```

---

## 连接规则（覆盖 R1）

连接地址（`REDIS_URL`）必须从环境变量读取，不得硬编码。

---

## Key 命名规则

**规则**：
1. Key 必须有命名空间前缀（`app:module:entity:id`）
2. 不得使用过于宽泛的 Key（如 `user`）
3. 必须设置 TTL（过期时间），不得创建永不过期的 Key（除非明确需要）

---

## 缓存规则

**规则**：
1. 缓存必须有失效策略（TTL 或主动失效）
2. 缓存穿透防护：对不存在的 Key 也缓存空值（短 TTL）
3. 缓存雪崩防护：TTL 加随机抖动（`base_ttl + random(0, jitter)`）
4. 不得缓存敏感数据（密码/Token）

---

## 技术栈最佳实践 — 项目应同时做的事

1. 配置 `maxmemory-policy`（内存满时的淘汰策略）
2. 生产环境启用持久化（AOF 或 RDB）
3. 监控内存使用和命中率
