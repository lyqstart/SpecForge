# 官方资料及其证明范围

这些资料证明平台机制及限制，不证明 SpecForge 已实现或本机已通过隔离验收。本阶段只提出方案，没有创建隔离进程。

- [Microsoft：启动 AppContainer / LPAC](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)：LPAC采用更窄资源权限，启动属性和capability必须显式设置；文档也说明独立profile及其临时目录。方案拟采用该边界，实际Node兼容性、最小权限集与清理仍须PoC证明。
- [Microsoft：Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)：进程树可统一管理；breakaway、WMI创建进程和通知不保证送达是需处理的边界。因此Job不是单独的文件/网络安全隔离，验收不能仅凭一个完成通知。
- [Microsoft：进程创建标志](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)：CREATE_SUSPENDED允许主线程先不运行；拟在恢复线程前完成Job和token核验。
- [Microsoft：AppContainer legacy应用](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-for-legacy-applications-)：普通桌面程序可被置入AppContainer；子进程限制必须在实际实现中证明，不能仅凭名称推定继承成功。
- [Node.js官方安全边界](https://github.com/nodejs/node/blob/main/SECURITY.md)：Node权限模型不承诺抵御同进程恶意代码，因此不能用它、JS VM或字符串扫描替代OS隔离。
- [Docker官方安全说明](https://docs.docker.com/engine/security/)与[Windows Sandbox配置](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file)：容器/虚拟化还取决于具体配置、宿主接口与共享目录。本次只读探测未发现相应CLI/标准入口，不能声称存在已就绪后端；WSL服务存在也不能代替隔离证明。

推荐Windows LPAC路线是结合本机Win32环境与最小部署依赖作出的工程建议，不是已经验证可用的事实，也不是对其他方案安全性的排名。
