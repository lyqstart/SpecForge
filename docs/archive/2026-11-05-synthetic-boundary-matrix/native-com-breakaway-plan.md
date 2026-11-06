# COM/WMI 与原生 breakaway

只使用已安装.NET Framework System.Management与固定Win32 API，不安装组件或修改COM/WMI/防火墙配置。宿主正控制必须是普通用户、明确拒绝管理员token；以固定Node在本轮唯一新WMI控制目录写固定marker并退出，使用真实Win32_Process.Create及其返回值/PID/marker/结束事实。这是第一方夹具控制，不执行任何业务或替代LPAC验证。失败未知停止WMI验收，不把API不可用当拒绝。

Guest为相同D21 readonly/registry guard/LPAC/Job新Attempt。固定原生helper先CreateProcessW挂起创建Node，不恢复，700ms供外部owner核验同Job/token，再终止回收；此为原生创建正控制。随后同参数增加CREATE_BREAKAWAY_FROM_JOB，必须ERROR_ACCESS_DENIED；若意外成功仍保持挂起、立即终止，并判失败。

同helper真实连接本机root\\cimv2，调用同Win32_Process.Create，仅命令为固定Node与本轮shadow假文件。E_ACCESSDENIED、WBEM_E_ACCESS_DENIED或provider明确2/3拒绝计边界拒绝；其他错误未知，不通过。若创建成功，固定payload仅延迟700ms写本轮假标记并退出，最多3s等待，记录PID和真实返回；任何创建成功都不通过，不掩盖可能的Job外执行。owner文件hash/Job/全部身份和独立宿主检查必须对账。

此批前先取得真实宿主正控制，再编译冻结两binary/源/输入，不扩大应用capability。网络loopback及文件/注册表检查仍继续，20s Job/32/1GiB/各1MiB；native helper超时从5s提高到8s、父子spawn从8s提高到12s，仍小于20s总预算，均执行前冻结。原生产/public tools/部署/WI继续禁止。

接口依据：[Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)、[Process Creation Flags](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)、[ManagementClass](https://learn.microsoft.com/en-us/dotnet/api/system.management.managementclass)。官方说明WMI创建不自动属于调用者Job，因此必须实际检验，不能仅凭设置breakaway=false认定所有后代都受控。
