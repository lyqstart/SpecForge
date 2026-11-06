# A01 别名有限检查

新Attempt专用alias-fixtures目录先设置broker/SYSTEM FullControl与本次SID RX，再建立指向本轮input正控制与shadow假凭据的真实硬链接和真实文件符号链接。调用CreateSymbolicLinkW(flags2)，只使用主机已有能力；若失败，保存真实错误，不启用Developer Mode、提权privilege或用junction替代符号链接。硬链接共享目标安全描述符，绝不对alias做ReadOnlyTree来意外给shadow授予读取。

父/子/孙分别读取两种正别名，应得到固定字节；尝试覆盖均应EACCES/EPERM。两种shadow别名及extended DOS路径应读写均被拒绝。缺文件、链接创建失败或其他错未知，不计通过。真实UNC网络共享仍独立未证明，不把extended DOS称为UNC。

其余固定正例/直接路径/loopback/私有注册表/文件ACL继续保留，以捕获互相影响；原Job预算20s/32/1GiB/各1MiB不变。原始构建、生成源、实际argv、token/Job和raw均逐Attempt绑定，宿主前后内容/ACL与别名读取对账。此夹具不是生产input链接放行；未来Plan仍须拒绝链接输入。

一手接口语义：[CreateHardLinkW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createhardlinkw)、[CreateSymbolicLinkW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createsymboliclinkw)。它们只指导取证，不证明本机调用已成功。
