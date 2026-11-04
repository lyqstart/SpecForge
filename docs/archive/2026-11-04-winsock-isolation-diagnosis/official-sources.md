# 一手接口依据

- [Microsoft 调试循环](https://learn.microsoft.com/en-us/windows/win32/debug/writing-the-debugger-s-main-loop)、[WaitForDebugEvent](https://learn.microsoft.com/en-us/windows/win32/api/debugapi/nf-debugapi-waitfordebugevent)：调试事件暂停进程线程，同一创建线程处理事件并Continue；DLL文件句柄由观察器关闭，事件线程/进程句柄随退出继续由系统回收。实际操作只针对新合成PID，调度影响单独声明。
- [DEBUG_EVENT](https://learn.microsoft.com/en-us/windows/win32/api/minwinbase/ns-minwinbase-debug_event)、[AMD64 CONTEXT](https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-context)：用于显式x64布局、对齐、硬件调试寄存器和寄存器参数读取。本机trace与PE入口字节校验是实际接口使用证据，不从文档存在推导本机成功。
- [RegOpenKeyExW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regopenkeyexw)：已有键的打开接口，失败返回真实Win32错误；A/W名字编码不同，不能假定导入某入口就实际经过该入口。本次最终只对实际ASCII的A调用参数给出名字。
- [WSAStartup](https://learn.microsoft.com/en-us/windows/win32/api/winsock/nf-winsock-wsastartup)：错误从函数返回值取得，不以WSAGetLastError替代。本次真实返回10107，scope内的子调用及父ID保存在diagnosis.json。
- [Microsoft LPAC启动说明](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)：registryRead是LPAC访问注册表的一项系统capability；该说明仅支持下一实验的假设，不证明新增后Node一定启动或只暴露Winsock。当前仍未授予该capability。
- [注册表访问权](https://learn.microsoft.com/en-us/windows/win32/sysinfo/registry-key-security-and-access-rights)、[ACCESS_MASK常量](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-cmrp/00ce494d-0c74-44fd-8276-c73665cf616b)、[STATUS码](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-samr/7440cfac-6052-4925-84e4-c32e417de300)：分别支持0x20019的KEY_READ、0x02000000的MAXIMUM_ALLOWED及c0000022的ACCESS_DENIED解释。本机事实仍取实际trace，不用错误码列表代替执行。

错误网页与搜索摘要未当作本机证据。没有复制他人测试结果。产品合同仍归SPS/Registry；提案没有生效。
