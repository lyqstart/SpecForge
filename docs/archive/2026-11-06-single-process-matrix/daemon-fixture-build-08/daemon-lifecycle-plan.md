# D22 单进程生命周期实测

按当前正式 SP-L01/L03，只在本轮唯一合成目录启动受控 launcher 与真实 Daemon。固定 build-single-resource-06，应用 child policy1/Job1，仅一个角色0主进程。观察者持有进程稳定句柄，不持有或复制 Job 句柄。

实际强制结束 launcher，证明唯一主进程终止，保留缺失最终回执；基于初始资源不存在、归属、SID、创建时间、ACL、原始事件与 kill witness 进行清理意图阶段中断，再由新进程恢复和幂等复核。

另起真实 Daemon，使用独立 home/config/temp，无项目或模型，验证真实 health 后强制结束。可信 broker 根据原生稳定父句柄终止 Job 并记录失败140及清理；新 Daemon 真实重启、鉴权正常停止，握手清除。不归档 token，不接入业务或更改已安装部署。
