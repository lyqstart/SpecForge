# 仅管理员创建两条自有符号链接的具体方案

触发证据：0025在任何应用创建前CreateSymbolicLinkW返回1314；0027当前宿主token缺少SeCreateSymbolicLinkPrivilege。已完成的文件/后代、私有注册表修复、文件ACL与loopback结果不受此夹具权限缺口影响。D20/D21不允许改系统功能或扩大应用权限，因此没有启用Developer Mode或给应用增加能力。

拟执行的是独立第一方夹具factory的管理员模式，仅一次Windows UAC同用户确认。正常模式0030已创建本轮独占的两个假文件与raw哈希计划，没有创建链接或应用。0031非管理员拒绝、0032计划漂移拒绝均真实exit65，三个owned文件仍完整未变；原始失败不修改。

- 源码：OwnedSymbolicFixtureFactory.cs；冻结副本及二进制见symbolic-fixture-factory/identity.json。
- 待运行二进制：D:/code/SpecForge/.tmp/verification-lpac-build/OwnedSymbolicFixtureFactory.exe
- 二进制SHA-256：98d8b28eef446c5f1f702e48188935aae896296b22d738078d7998804e8612f7
- 逐字参数：--create b138f0060a5249768b420dd94a6ff798 32406b5a5c46cccbe50973f223f8963516eb5c3168dd7d14b9b201105f264ffe
- Plan SHA-256：32406b5a5c46cccbe50973f223f8963516eb5c3168dd7d14b9b201105f264ffe
- 唯一目录：D:/code/SpecForge/.tmp/verification-lpac-symbolic/b138f0060a5249768b420dd94a6ff798
- 仅创建positive-symbolic.txt→positive.txt、shadow-symbolic.txt→shadow.txt，及不可覆盖creation-receipt.json。不改目标内容或ACL、不启动任何Node/业务/其他程序，不读取真实凭据，不改系统设置或已有目录ACL；路径/计划/内容/owner/SID/冲突任一不符在写前拒绝。

管理员进程到此退出；后续LPAC应用、launcher、token/Job验证仍由原普通用户进程执行，不把整套测试改为管理员运行。成功后由普通owner独立核对链接解析、计划与目标身份，再在本轮唯一nonce的全新应用Attempt中引用只读夹具。该接线尚未执行，不能计入矩阵通过。

这不是生产采用或第二capability批准。需要的是宿主缺失的实际文件系统权限；若不允许管理员创建，符号链接行保持未验收，不能用junction、缺失链接或跳过来代替。
