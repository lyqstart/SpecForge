# Windows LPAC 只读 Node 验证合同

CONTRACT_ID=windows-lpac-node-readonly/v1
AUTHORITY=SPS-1.0 §9.2.1 / Registry D20
IMPLEMENTATION_STATUS=ACCEPTANCE_REQUIRED

本合同从属于 SPS/Registry。D20 来自用户对 proposal-001 的明确答复“批准有限方案，先完成隔离验收”。归档仅保存决定来源，不能授权本合同以外的执行。

## 分阶段生效

1. 先完成自有合成隔离 PoC，采用新建独占、标记归属的资源，不读取原业务或真实凭据。固定 Node、只读输入和最低系统读取为唯一应用资源，不授予应用文件写入、网络或扩展 capabilities。真实失败必须保存；无法满足正例也不得扩大权限兜底。
2. 完成真实攻防及生命周期矩阵，独立核对宿主哨兵与全部进程。任何行未执行或未证明，结果为 INCOMPLETE，不接原业务。
3. 隔离验收后再接入两个 public tool、Runtime 权限、可信回执、共同 Gate/Close 消费者及部署资产。合成 launcher 不是可调用的产品工具，不能直接代替原 WI owner。

## 冻结边界与原型接口

仅 x64 Windows。第一方 launcher 在构建时编译；不得运行时下载或用 PowerShell/Add-Type 自举。合成入口从固定文件读取封存配置，拒绝未知参数；生产入口不接收任意脚本、环境或路径，只消费受信计划。计划、输入、Node 和 launcher 均用 SHA-256 原始字节身份，不把 Git blob/EOL 归一化哈希当同一域。

独立 LPAC SID，无 capability，ALL_APPLICATION_PACKAGES_OPT_OUT。仅新建运行根中的 runtime/input 与私有 profile 被设为 broker/SYSTEM full、该 SID read/execute；不修改已有目录 ACL。新 profile 内所有文件/注册表等持久写面也必须检查和实测；只改 TEMP 环境不是写隔离证明。默认墙钟120s、进程32、总提交1GiB、stdout/stderr各1MiB；合成极限测试可以使用更低的显式预算，不得高于合同上限。预算在运行前冻结，之后不可修改。

CreateProcessW 以挂起态创建，显式安全 capabilities / LPAC policy / 句柄白名单，最小 Unicode 环境。只继承 stdout/stderr 和空 stdin；Job 与控制回执句柄不可继承。核验实际 token/SID/LPAC、Job 配置和关联后 ResumeThread。进程/孙进程均在 Job 中，无 breakaway，KILL_ON_JOB_CLOSE；全树结束由真实 QueryInformationJobObject 和独立进程证据确认，不能只看主进程退出或一条通知。

LPAC 核验不能仅依赖创建参数，也不能把 TokenIsAppContainer=1 当作 LPAC。class46 查询若本机拒绝，须保留实际 API 错误，不伪造值；可用真实 token 的有效权限检验证明 ALL_APPLICATION_PACKAGES 被忽略：对 DuplicateToken 得到的 impersonation token，AccessCheck 的用户侧 Everyone+明确本次 Package SID 读取应允许，仅 Everyone 应拒绝，Everyone+ALL_APPLICATION_PACKAGES 应拒绝。另创建同参数但未 opt-out 的普通 AppContainer 挂起对照，后者必须在第三项允许且其余两项同前；对照不恢复、不执行应用并终止回收。查询与对照任一异常均 fail closed。这是对微软所述 LPAC 权限语义的本机检验，不宣称 class46 API 已支持，也不豁免应用真实文件攻防矩阵。

输出是任意不可信字节；不能打印一段 passed JSON 就生成 owner 回执。输出 cap、超时、无退出码、token/Job 不符、异常、清理不明均不通过。启动失败保存 Windows 错误码和实际运行身份，不填退出码0。仅清理可证明属于本 Attempt 的资源，未知归属保留并 blocked。先持久化资源身份与 Attempt，再创建系统资源，最后记录清理；崩溃后读取既有 Attempt，不复用未知 profile，不补写成功。

## 执行前冻结的合成验收矩阵

| ID | 真正执行的对象 | 必须成立的事实 |
|---|---|---|
| P01 | 固定 Node 输出及内置 node:test 父/子 | 实际 numeric exit0、输出完整、正确 token/SID/LPAC/Job、全树结束 |
| A01 | 影子项目、假 home/config/credentials、绝对路径/UNC/符号链接/硬链接别名 | 父/子/孙不能读写边界外哨兵，原始字节不变 |
| A02 | runtime/input/private profile/temp、注册表私有/宿主键 | 应用所有未授权持久写入被拒绝，未产生绕行写面 |
| A03 | loopback/外部网络、COM/WMI 创建、breakaway/native 后代 | 实际拒绝或证明仍在同一隔离边界，不因工具未装而计通过 |
| L01 | 全树、孤儿、父先退出、launcher 被杀 | Job 清空，独立进程证据无遗留，不靠输出自述 |
| L02 | 墙钟/进程/内存/输出各限额、取消 | 真实触发受控终止，不能 passed，完整终止事实 |
| L03 | daemon/launcher 崩溃、重启、清理中断 | 真实进程演练、历史不覆盖、先对账后恢复、资源归属可证 |
| I01 | 计划/源/回执篡改、复制、角色/状态/HardStop | public producer 和共同 consumer 一致拒绝 |
| D01 | 编译/打包/安装/新 daemon 与工具 | 固定资产哈希一致，安装后真实正反例，与源码合同一致 |

PoC 阶段 P01/A01/A02/A03/L01/L02/L03 未全证明不得通过隔离；I01/D01 属后续产品接线与发布门禁，在完成前不接业务。每行产生不可覆盖 Attempt/命令四件套、真实 UTC、数值载体退出码、原始输出与资源身份；未知为 INSUFFICIENT_EVIDENCE，不能用 mock、字符串断言或普通宿主 Node 代替。

## 生产合同接线清单

真实 sf-orchestrator → sf_verification_plan；真实 sf-verifier → sf_verification_run；无可关闭的 owner 检查；StateManager 权威状态、已撤销代码权限、独立验证许可；不可变计划和副本；受信 launcher 控制通道；owner-only 原始回执；Report/Evidence/Verification/Formal Version/Close 同一校验器；模板、精确登记、Agent/Skill、构建与安装器全链路。未接线阶段工具名仅为规定的目标，不代表当前已注册。

Node 命令只承接 node:test 及已冻结内联探针。POSIX 静态命令须另以共享版本化有限解释器证明语义，记录原声明、解析树、实际种类、输出和退出含义。第三方依赖、动态展开、未支持语法不执行。测试能力不自动授权 implementation_done、verification_done、Close 或业务 main 合并。

## D21 独立合成实验

SPS §9.2.2 / Registry D21 仅授权独立实验profile `windows-lpac-node-readonly-registry-read-experiment/v1`，不改变上述D20 profile的零capability合同或未验收状态。只由Windows `DeriveCapabilitySidsFromName("registryRead")` 派生恰好一个能力SID；实际普通AppContainer挂起对照和LPAC token均逐项核对数量、SID与启用位，LPAC有效权限对照仍必需。未知、额外能力或API错误在恢复前拒绝。

先以固定Node/原正例在未调试进程取得真实启动结果，不能启动就停止，不追加其他能力；成功后才进入固定假哨兵检查。真实凭据与原业务不是夹具。新增registryRead可能扩大注册表读取面，不是单键白名单；假哨兵读取/写入、文件写入、网络通达、未知边界或资源残留均不得通过。新夹具只能在本次唯一owner标记路径/新键创建及回收，不改已有键/ACL。完整生产验收及后续采用仍按SPS §9.2.2，不由合成结果自动启用。
