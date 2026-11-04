# 同权限的固定内联探针

0005原文件入口保持FAILED，退出1；实际stderr明确为Node模块加载器realpathSync在`lstat D:\`处EPERM，原正例未执行。实际token为恰好registryRead、LPAC权限对照/Job成立，Job清空和profile删除均记录。这里不能称原文件命令已通过，也不授予D盘根目录读取。

SPS §9.2.1已允许冻结Node内联探针；D21限定固定Node及原正例，不要求为读取盘根扩大权限。新独立Attempt使用**逐字节相同的原断言源码**作为固定`node -e`参数，仍保存原输入文件并绑定相同原始SHA256。执行种类明确记`node_inline_frozen`，实际argv单独记录；不冒充原node脚本文件命令的退出结果。

这是同一capability/只读ACL/Job/Node/断言的独立兼容性探针，不是第二项权限或原Task验证。若它也不能运行，保留结果并停，不转普通进程或继续加权。原文件入口、完整隔离、业务验证仍不得由该探针替代。只有该合成探针成功后才进入D21假哨兵阶段。
