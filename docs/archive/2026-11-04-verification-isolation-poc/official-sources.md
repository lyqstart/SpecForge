# 语义依据与本机证据的边界

核验于本阶段真实 UTC 2026-11-04。只采用一手文档/上游源码形成技术依据；搜索命中的他人问题陈述仅作线索，不作为本机事实。没有把网络报告的测试结果记为本次运行。

- [Microsoft：启动 AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)：LPAC 选择 opt-out，capability 与普通用户权限同时限制访问；profile 默认有私有文件资源。故本方案另收紧新私有目录，不只改环境变量。文档不能证明本机 Node 可启动。
- [Token 信息枚举](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ne-winnt-token_information_class)：LPAC 忽略 ALL_APPLICATION_PACKAGES；class46 描述没有提供与其他字段一样的 Win32 缓冲区结果合同。实际0012直接查询错误87，不能填1。
- [GetTokenInformation](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-gettokeninformation)、[DuplicateToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-duplicatetoken)、[AccessCheck](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-accesscheck)：本次以真实token、明确SDDL和impersonation副本做权限检验，另以普通AppContainer挂起对照排除“总是拒绝”的无效正例。这个检验只证明已测试的有效权限语义，不代表应用攻防全通过。
- [Node v24.19.0 的 libuv winsock.c](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/win/winsock.c)，70–92行：Winsock初始化调用WSAStartup，失败走fatal路径。[同版本 core.c](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/win/core.c)，166–195行：libuv初始化包含该步骤。该版本上游源码与本机报错相符；没有独立证明所测二进制逐行对应该源码构建。
- [Microsoft：Winsock错误码](https://learn.microsoft.com/en-us/windows/win32/winsock/windows-sockets-error-codes-2)：10107为系统调用失败，可有不同原因。错误文本不能确定哪一个注册表键、DLL或系统资源被拒绝；该细粒度原因仍INSUFFICIENT_EVIDENCE。

本机 CONFIRMED：0012的固定Node SHA256=3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237，0013宿主版本查询v24.19.0；实际LPAC恢复后退出2147483651，stderr原始字节含WSAStartup与10107，P01输出缺失，Job active0且profile删除0。只能得出这一冻结配置未通过启动正例；不能推导所有LPAC配置均不可用，不能将registryRead等capability称为已经验证的修复。
