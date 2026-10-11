# 证据与审计

> Role: DERIVED OPERATING DOCUMENTATION。

有效结论必须绑定可复核的一手证据：Runtime 事件、Gate/Decision/Merge/Verification 报告、文件哈希、Git 对象、命令原始输出与数字退出码。Agent 的自然语言总结只说明“它声称了什么”，不能替代底层证据。

审查时至少确认：当前 WI 与状态、Candidate/Gate/User Decision 的摘要绑定、Code Permission 范围、真实 changed-files audit、测试与验收结果、版本控制模式、关闭结果和观察者影响。历史失败与 HardStop 保留为追加式证据，不删除、不覆盖。
