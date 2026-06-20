# SpecForge Reports Index

## 1. 目的

`docs/reports/**` 保存 SpecForge 治理、验证、真实运行、发布候选等过程报告。

这些报告是历史证据，不应在 post-v1.1 清理中随意移动或删除。

## 2. 建议分类

### v1.1 治理报告

- v1.1.3 daemon state control plane；
- v1.1.4 final rule test coverage；
- v1.1.5 agent/skill contract alignment；
- v1.1.6 install/deployment consistency；
- v1.1-stable-rc closure；
- v1.1-stable real-run acceptance。

### post-v1.1 清理报告

- repo hygiene audit；
- deprecated state scan；
- script inventory；
- release docs verification。

## 3. 归档原则

短期不移动历史报告，避免破坏引用。

如果后续需要归档，建议按版本移动到：

```text
docs/reports/archive/v1.1/**
docs/reports/archive/post-v1.1/**
```

移动前必须先更新引用。
