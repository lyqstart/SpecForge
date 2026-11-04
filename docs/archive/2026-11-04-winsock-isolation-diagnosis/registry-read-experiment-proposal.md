# 仅合成环境的 registryRead 单项权限实验

PROPOSAL_ID=WINSOCK-REGISTRY-READ-EXPERIMENT-001
STATUS=PROPOSED_NOT_APPROVED
CURRENT_CAPABILITIES_CHANGED=NO
BUSINESS_EXECUTION_AUTHORIZED=NO

建议只批准下一项可回收实验：在全新的合成Attempt中，给LPAC增加唯一的`registryRead` capability，测固定Node能否启动，并检查新增读取面。它不是已经验证的修复，也不授权产品入口、部署或原WI执行。当前D20零capability配置和失败证据保持原样。

## 为什么出现新的产品边界

当前真实调用链已直接记录：WSAStartup(2.2) → RegOpenKeyExA(HKLM\System\CurrentControlSet\Services\WinSock2\Parameters, KEY_READ) → NtOpenKeyEx(REGISTRY/MACHINE, MAXIMUM_ALLOWED) 返回c0000022 → RegOpenKeyExA返回5 → WSAStartup返回10107。Node未执行正例。这里证明读取被拒绝，不证明加某个capability就能成功。

SPS §9.2.1 当前明确“不授予网络、广泛文件、COM或注册表扩展 capability”，且“需要更宽权限、可写磁盘、另一后端或系统设置时须重新形成具体产品决定，不得静默放宽”。本实验会增加一个注册表capability，所以本轮“继续”只足以完成诊断和这份具体方案，不能直接执行扩权。

## 唯一拟增加项

| 项目 | 当前已执行 | 拟批准实验 |
|---|---|---|
| profile | windows-lpac-node-readonly/v1 | windows-lpac-node-readonly-registry-read-experiment/v1，独立实验身份 |
| capabilities | 0 | 恰好1个registryRead，由系统API派生并核验实际SID/数量；未知或额外capability拒绝 |
| 文件权限 | 固定Node、输入、私有profile只读 | 保持不变，不加可写scratch |
| 网络/COM | 无扩展能力 | 保持无网络/COM能力，不安装驱动、不改系统设置/已有ACL |
| 入口/输入 | 固定合成Node与断言，无原业务 | 同一指纹Node/断言；额外探针只针对新建假哨兵 |
| Job/预算 | 独立Job，120s/32进程/总提交1GiB/输出各1MiB | 保持不变，全部后代与失败回收仍必需 |
| 产品/原WI | 未启用，业务未运行 | 仍未授权；本实验结果不能替代完整隔离矩阵 |

这是实际的权限扩大：registryRead并不是由调用者列出少数键的专用白名单。它可能使进程读取系统原先拒绝的注册表内容，边界取决于Windows实际ACL与token，不承诺只有Winsock能读。未证明假用户配置/凭据哨兵的读取隔离前，不得采用为业务profile。不会读取真实凭据来测试这一风险。

## 批准后必须先落正式合同

先按同目录`registry-read-authority-delta.patch`将SPS/Registry明确为**仅合成实验**的D21例外，再扩展合成launcher；不修改公开工具或当前生产profile。用户对本提案的精确答复、计划原始哈希与profile/SID必须绑定到新Attempt，不沿用零capability的通过/失败身份。

运行前核验实际LPAC token、恰好该capability、只读ACL和Job。先用未调试进程取得启动正例/非零失败事实；调试trace仅辅助归因。新建假文件/注册表哨兵只含随机非敏感值，位于本次owner唯一标记路径/新键，不改已有用户键或其ACL；注册表夹具可用独立`HKCU\Software\SpecForgeIsolationCanary-<nonce>`，碰撞即停。仅对此新夹具测试读取、写入、父/子继承；网络仅用自有loopback哨兵验证拒绝，禁止外网探测。

任何一项出现未知权限、可写磁盘、宿主假凭据可读/可写、网络通达、残留进程或资源归属不明，实验不通过并停止，不再增加第二个capability，不临时改ACL。Node仍不能启动时保存失败，不追加lpacCom/network/文件能力。成功也只证明该合成实验，完整A/L矩阵、生产工具/共同消费者和安装验收仍未完成；实验profile不得由业务Plan选择。是否采用进产品须根据实验完整证据另行形成正式产品决定。

## 可选决定

- 批准这项仅合成的单capability实验：先D21正式合同，再编译/验证/运行及回收，保留所有失败。
- 保持零capability边界：不运行该实验，转为评估其他隔离后端或可验证的受限Node构建；它们也需要独立具体方案，当前没有其安全/可用性证据。

本提案不宣称registryRead已解决问题，不解除D18，不重复原Candidate/分支审批，不允许业务main合并。
