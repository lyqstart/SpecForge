# L01/L02 有限真实终止与限额检查

每种使用新Attempt、固定Node内联脚本、同D21/新profile注册表锁定、readonly文件、默认32进程/1GiB/输出各1MiB。先真实assert及READY，再触发指定行为；宿主独立取Job PID/token，Job完成端口属于broker且不继承。各预算在恢复前冻结，原始stdout/stderr/应用exit保留；所有这些都不能产生passed业务回执。

|固定模式|冻结预算与检查|必须有的直接证据|
|---|---|---|
|wall|8s；父/子/孙空闲|3个实际隔离进程、owner墙钟触发TerminateJob124、应用124、全树active0|
|cancel|8s；3s且3个进程核验后owner取消|实际取消TermJob130、未墙钟超时、应用130、全树结束|
|parent-exit|8s；父在2s退出0，后代继续|owner读到父0而Job仍active，最后墙钟终止后代；父0不能计整体passed|
|output|8s；同步WriteFile输出超过1MiB|owner raw cap/Overflow、实际TermJob137、全树结束；输出明确不完整|
|memory|8s；总提交256MiB；固定16MiB填充块|真实Job memory limit通知10、应用非零、全树结束、实际配置/峰值|
|process|8s；活动上限8；固定启动20个空闲Node|真实Job活动进程上限通知3、峰值8、实际创建拒绝、8个token核验、最后全树终止|

完成端口MSG为Win32真实Job事件，辅助而非唯一证据；输出文字不是限额已生效的证明。任何READY/通知/进程或终止事实缺失，expected_rejection_proved=false；不将启动失败当作限额测试通过。launcher崩溃/重启与清理中断仍另批冻结和实测，不能以本批代替。
