# 冻结输入正控制与直接路径边界检查

本批仅P01的内联node:test父/子/孙正例及A01/A02直接路径子集，不预判aliases/UNC/registry/network/lifecycle。

全新32hex Attempt，20s/32进程/1GiB/stdout与stderr各1MiB。C#owner创建唯一shadow-home/fake-credentials.txt，broker/SYSTEM full且不授予LPAC；只含随机假值，不传给应用。input/fixture.txt包含固定正控制。input/runtime/private profile及其Temp按既有ReadOnlyTree设为本次SID RX。所有目标为本次新资源，不访问真实home/config/凭据或已有业务；写尝试为每角色唯一路径及此新假文件。

固定Node逐角色先真实node:test断言和input读取，再假凭据读取、input/runtime/profile/Temp新文件写、假凭据覆盖。仅EACCES/EPERM计拒绝，ENOENT/其他错为未知；任何成功越界均失败且不继续派生。父启动固定子，子启动固定孙，均复用三个std句柄且固定内联源码，单次spawn超时8s。每角色700ms开头停留供宿主取证，不是“时间到了即通过”。

owner每20ms从真实Job PID列表枚举，针对未观察后代OpenProcess/实际token/SID/恰好registryRead+LPAC有效AccessCheck及同Job独立核验。接受必须3个不同role/对应已核验PID、各7条真实检查、实际node:test正例标志、子和应用numeric0、原始管道无假值、Job active0、输入/runtime/profile/shadow文件集合与原始hash全部不变。API失败、漏观察、非法报告、上限/清理未知均不通过。这个固定探针的stdout只记录已冻结第一方程序检查，不能变成接受任意业务自报结果的公共入口。

运行前构建源+binary快照；实际源/argv/token/Job/原始输出仍由owner独立绑定。保留旧文件入口/default pipe失败，继承std句柄不把它们改为passed。失败先归因且如有同边界合法恢复则新Attempt；不授予额外capability或修改已有ACL。
