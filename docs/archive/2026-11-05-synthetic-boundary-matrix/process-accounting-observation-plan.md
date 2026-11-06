# 进程上限计数取证

仅在新合成resource-process运行中增加观测：读取Job基本Accounting与PID列表的采样前后值，保留每个真实句柄的创建/退出时间及running；应用在固定20次spawn完成后输出batch结束标记，供稳定时段对照。

保持native Job limit8、总内存1GiB、墙钟8s、输出各1MiB；原acceptance仍要求独立峰值8，不把9改为允许，不排除conhost。消息3不能单独证明完整预算，失败或差异仍NOT_ACCEPTED。仅改变观测和固定标记，无产品/public Tool/部署/原WI或新增权限。

TRUTH_SOURCE_WRITES=NONE;REPOSITORY_TRACKED_WRITES=未发布observer和固定合成script;RUNTIME_OBSERVER_WRITES=唯一新owned D21 readonly/Job及清理;EXTERNAL_EVIDENCE_WRITES=冻结新构建和原始回执。

下一固定对照使用DETACHED_PROCESS替代CREATE_NO_WINDOW，仅resource-process的普通AppContainer挂起对照和LPAC挂起主进程同时使用该标志；保留标准句柄白名单、相同token/Job/限额和原判据。无控制台不等于离开Job，两者必须独立实际核验。此为避免本机额外conhost的待验证假设，不修改或解释旧失败，不增加允许峰值。文档接口依据：https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags 。
