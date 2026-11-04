# 接口依据与实际结果边界

- [Microsoft DeriveCapabilitySidsFromName](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-derivecapabilitysidsfromname)：系统派生group/capability SID数组；调用方回收每个SID及数组。本实现仅传入唯一capability SID，group SID不加入应用能力；实际token数量、SID和启用位仍须读回验证，不能靠派生成功代替。
- [Microsoft LPAC启动说明](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)：capability与用户权限共同限制资源访问，registryRead影响注册表读取范围。文档没有证明本机Node/子进程可运行或用户注册表隔离已安全。

Node child_process官方网页本轮访问失败，没有把不可访问页面当作已读文档或归因证据。固定C#源码、实际输入/argv/token/Job、原始stderr/退出、哨兵前后值与独立宿主观察是本阶段事实来源。具体查询卡点仍待取证，不能用常见案例或脚本中的timeout选项代替实际完成事实。
