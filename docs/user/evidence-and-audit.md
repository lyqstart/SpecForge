# 证据与审计

> Role: DERIVED OPERATING DOCUMENTATION。

有效结论必须绑定可复核的一手证据：Runtime 事件、Gate/Decision/Merge/Verification 报告、文件哈希、Git 对象、命令原始输出与数字退出码。Agent 的自然语言总结只说明“它声称了什么”，不能替代底层证据。

审查时至少确认：当前 WI 与状态、Candidate/Gate/User Decision 的摘要绑定、Code Permission 范围、真实 changed-files audit、测试与验收结果、版本控制模式、关闭结果和观察者影响。历史失败与 HardStop 保留为追加式证据，不删除、不覆盖。

D24 有限计时只证明固定 Windows 单进程隔离中一次同步核心调用的单调差值和原门槛判定，使用独立 v2 命令证明；旧非计时命令保留 v1。命令编译成功不等于测试通过，须核验实际数值退出、完整输出、Lease/Receipt 和共同消费者。核心规则、静态检查与真实浏览器交互分别记录；未执行不得记通过。详见 SPS §9.2.5 及从属 Windows 验证合同。
