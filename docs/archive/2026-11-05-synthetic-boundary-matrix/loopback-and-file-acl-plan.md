# Loopback与文件DACL攻击

在已验证的新profile私有注册表锁定模式基础上，新增本轮独占127.0.0.1随机端口TCP listener。宿主在应用前后真实连接作为两次正控制，独立监听计数必须恰好2；应用父/子/孙分别真实net.connect，只有EPERM/EACCES且无connect事件计拒绝，超时/其他错未知。监听线程在回收中停止并join，任何额外连接/控制失败/残留均不通过；没有外部联网，没有系统防火墙/网络策略改动。20s及原Job预算不变。

真实固定native helper额外对本轮input/fixture、input、runtime、profile、Temp、shadow假凭据共六目标请求WRITE_DAC并尝试SetKernelObjectSecurity(DACL)，成功则真实写合成标记。仅ERROR_ACCESS_DENIED计拒绝；允许更改DACL或写入均失败，保留新owned资源原样作证。owner在应用前后核对文件集合/hash及目录/文件SDDL；不把内容未变当作ACL未变。原注册表KEY_SET_VALUE/WRITE_DAC攻击继续执行。

先编译/封存源及两个binary，后新Attempt；父/子/孙/node:test/私有注册表/文件ACL均仅在相应实际raw、native结果、宿主token/Job/夹具对账后计覆盖。外部网络、UNC/符号硬链接、COM/WMI、breakaway、资源和崩溃恢复仍独立未验收。
