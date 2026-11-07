# Windows LPAC 只读 Node 验证合同

CONTRACT_ID=windows-lpac-node-readonly/v1
AUTHORITY=SPS-1.0 §9.2.1 / Registry D20
IMPLEMENTATION_STATUS=D20_NOT_ACCEPTED_D22_SYNTHETIC_ACCEPTED_D23_PRODUCT_INTEGRATION_REQUIRED

2026-11-06合成复核仍未完成完整验收：原生进程限额8的真实Job曾有9或15个活成员。现有owner补齐全成员独立计数、超预算立即终止及非passed回执，但20ms采样不能证明严格瞬时总成员上限，不能用这项改动冒充固定进程上限已成立。其余有限探针的执行事实见归档acceptance-review；归档不改变本合同。D21生产采用、public接线、安装部署与原WI均继续禁止，直至缺口解决且所需独立产品裁决成立。

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

## D22 当前单进程首期合成验收合同

CANDIDATE_PROFILE=windows-lpac-node-single-process-readonly/v1
AUTHORITY=SPS §9.2.3 / Registry D22
ACCEPTANCE_STATUS=REQUIRED
BUSINESS_PROFILE_REGISTERED=NO

D23已基于完整新合成矩阵批准进入产品接线及验收阶段。此处NO表示实现登记尚未完成，不再表示缺少产品采用授权；生产入口/共同消费者/安装资产通过SP-I01/SP-D01前仍不得接原业务。历史D20/D21及多进程失败保持原结论。

用户已选择单进程首期方案。旧多进程矩阵仍NOT_ACCEPTED，原生预算8出现9/15的事实不修改。新候选仅在自有合成环境使用固定Node24.19、恰好registryRead、LPAC有效权限、从零构造环境、只读输入/runtime/profile/私有注册表及无网络边界。DETACHED挂起创建；恢复前独立核验child policy实际flags恰为1、正确token/SID/LPAC及Job。Node禁止native addons，应用不得取得特权父进程或控制句柄；创建前子进程限制不能被可关闭的应用自报开关代替。

固定上限为进程1、总提交1GiB、每管道1MiB和墙钟120s，合成限额试验显式更低。任何实际额外成员、控制台/override绕行、未知策略或残留均不能passed，不能放宽计数或仅凭采样后终止通过。原声明与实际argv、完整输入/资产原字节、真实数值退出、输出和终止事实均绑定owner回执；归一化不自动证明原Task语义。

| 行 | 新配置实际执行对象与通过条件 |
|---|---|
| SP-P01 | 固定CJS及嵌套目录的ESM/TypeScript本地import、Node内置测试与冻结内联正例；实际exit0、断言/完整输出、输入不变、实际child policy1、LPAC/Job1/全树结束 |
| SP-A01 | 输入直接读正控制；所有影子/假home/凭据、绝对/UNC/硬链接/目录联接/真实符号链接边界外读写拒绝，宿主前后正控制与原始字节/ACL不变；拒绝输入中的链接和硬链接。已有两条链接可只读作为边界外路径，当前新SID对两条均须拒绝，不改旧ACL、不新增管理员链接 |
| SP-A02 | runtime/input/profile/temp文件与WRITE_DAC拒绝；宿主假键读写和私有Storage持久写/WRITE_DAC拒绝；最低系统注册表读取正控制；无新写面、假值不泄漏、原始字节/ACL不变 |
| SP-A03 | loopback与固定外部TCP/UNC原生拒绝及宿主前后正控制；COM拒绝或受控隔离；普通/breakaway/child-policy override创建、控制台分配均实际拒绝；可信直接父进程的CREATE_PROCESS、VM_WRITE+OPERATION、DUP_HANDLE均拒绝且实际PID/父身份绑定 |
| SP-L01 | 子进程被创建前拒绝且实际成员不超过1；真实launcher关闭最后Job句柄后，原主进程稳定句柄结束且独立无本轮成员；不将未创建后代称为执行过孤儿试验 |
| SP-L02 | 进程1创建前限制实测；墙钟/内存/输出限额和取消真实发生、不能passed、完整主进程/Job终止；限额回执与成功执行严格区分 |
| SP-L03 | 当前单进程配置的真实launcher/Daemon崩溃、实际新Daemon重启/鉴权正常停止、清理意图阶段中断与新owner幂等恢复；缺回执保留中断而非补造通过 |
| SP-I01/SP-D01 | 隔离验收和独立D21生产采用后才实施；真实public producer/共同消费者一致拒绝篡改、角色/状态/HardStop/许可冲突，并完成固定资产构建安装和新Daemon真实正反例 |

SP-P01至SP-L03任一不足即INCOMPLETE。初步CJS/TypeScript/原生拒绝证据只证明相应有限事实，不能代替新候选身份的完整矩阵。此处以上保留D22合成阶段合同；D23已提供其要求的独立生产采用决定，后续生效顺序见下节。

## D23 产品执行与恢复实现合同

上位权威为SPS §9.2.4。此前D20/D21多进程预算与禁止采用的描述仅适用于其历史配置；当前产品候选只采用D22的进程1配置。实施授权已成立，真实SP-I01/SP-D01完成前仍不在原业务执行。

- 用户级固定资产位于既有sf-user根：`bin/verification/{assets.json,node.exe,specforge-verify.exe}`；Daemon仍是`bin/specforged.exe`。唯一Runtime验证owner私有存储为`runtime/verification-owner`，不是Project Spec或第二workflow state。

这三份文件是现有Daemon/验证工具的从属物理运行资产，不是独立产品模块。精确安装登记以windows-x64条件包含它们，由正式release runtime构建入口编译和固定Node复制，再由同一Release Manifest/Installer逐文件验收。其他平台省略这些物理文件，公共工具对不支持的Node后端保持明确拒绝；不扩大首期平台支持，也不破坏既有Daemon/CLI构建与安装面。
- `sf_verification_plan`只接受动作、WI/Task/验证类别/命令序号，或既有计划/准备记录身份；不接受命令正文。create由真实sf-orchestrator从已批准冻结Task和StateManager派生只读许可，revoke只追加撤销记录，recover只完成可核验的中断准备。`sf_verification_run`只接受既有计划、Attempt身份及run/cancel/recover动作，由真实sf-verifier消费。恢复动作只终止/回收自有运行资源、保留历史，不启动新应用或推进业务状态。
- 真实角色来自配置的OpenCode Runtime中当前assistant message的agent、实际running工具part及输入，与session/project/message/call共同绑定。自报context.agent或关闭RBAC不提供权限；每个实际调用只能保留一次不可变调用预约。无法取得真实运行记录时拒绝，不用mock冒充产品验收。
- 计划、回执、调用预约和撤销使用版本化严格JSON结构和Runtime私有认证内容身份；固定hash域为canonical JSON或明确的原始bytes。原始输入只复制字面量可达的本地代码依赖和所需祖先package.json，不把无关tracked文件、凭据、Git或治理树带入应用。有限AST证明拒绝主机观察、未支持依赖及语法；声明、实际argv和证明共同冻结。

静态Task声明的有限归一化合同为`finite-posix-readonly-predicate/v1`：只接受相对普通tracked文件的`test -f PATH`及其`&&`合取，或单个`grep -c/-cE/-q/-qE QUOTED_PATTERN PATH`，允许对quiet grep施加单个`!`。不调用shell、test或grep程序。模式仅支持ASCII字面量、点通配、行首/尾锚点及ERE非空备选；重复量词、其余语法、扩展、重定向和变量拒绝。按冻结原始UTF-8文件的LF行界、grep计数/quiet/否定的0或1结果，生成不读宿主的冻结Node内联断言；同时核验字节匹配与Unicode标量匹配的计数相同，语义有歧义即拒绝。输入严格限于声明路径，生成内联连同内容不得超过既有32KiB原生上限。计划保留原声明、版本化证明、输入hash和实际Node argv；回执退出码来自实际隔离Node进程，明确不得声称曾运行原shell或grep可执行文件。该归一化复用相同LPAC/Job/角色/独立许可/消费者，不增加执行器或权限。

Task是WI-owned产物，使用directory-layout定义的canonical `candidates/tasks.md`，以已批准User Decision的完整candidates内容hash证明其字节被批准；Spec Merge Manifest只枚举Project Spec目的地，不能凭其中没有Task条目否认合法Task。正式Decision Schema、批准主体、完整Candidate内容hash、成功Merge Report、当前PSV及权威状态须共同成立，不回退到未批准的WI/legacy tasks或手补Manifest。状态/Close owner正常刷新updated_at与code_permission_revoked_at不改变许可和规格主体；其余metadata和全部正式权威字节继续绑定。
- 原生入口只消费固定私有native-plan文件及其raw哈希，固定路径/Node/Daemon/预算/完整输入集合重新校验。挂起创建时用Job List属性原子关联唯一命名Job，再独立查询实际关联、token/LPAC/child policy后恢复；应用不继承Job或控制句柄。独立具名owner互斥覆盖launcher全部生命周期及恢复，防止重启后同时接管同一Attempt。
- 取消意图在`cancellations/<Attempt>.json`不可覆盖保存并绑定计划；创建目录前和Resume前均可识别，正常循环继续检查。墙钟和输出等限额继续拒绝通过。应用输出只进入受限二进制管道文件，与受信控制事件/回执分别保存。

执行期还须维护`verification-invocation-lease/v1`：从实际Runtime复核同一session/message/call、角色、项目及输入的running归属，开始前、执行期间至回执发布前均核验。周期不超过500ms，单次可信API读取沿用有界超时；状态结束、身份漂移、无法核验或请求取消均触发同一不可覆盖取消意图，不依赖HTTP兼容层必定报告断连。只使用既有中立InvocationVerifier，不向调用者开放续租或额外参数。结束时把有界观测、原始owner主体、Attempt/Plan和结束原因保存为私有认证不可变lease记录；执行回执必须绑定lease内容身份，passed还要求完整有效lease，所有共同消费者同验。Daemon停机仍先取消并等待最终回执；丢失回执或无法核验不能补造passed。
- 独立inspect/recover入口只消费同一已验证native-plan，不恢复应用。先取得该Attempt互斥，查询唯一Job及所有已记录PID的真实创建时间/结束事实；查询未知或仍活动时拒绝。清理还须初始资源不存在见证、计划/config身份、实际SID、目录创建时间及文件/注册表owner/ACL证据。清理意图与完成记录追加不可变，部分清理按原意图重验、漂移拒绝；缺原最终回执仍是interrupted，不能补造passed。
- 公共消费者必须重新验证计划/回执完整结构及认证、WI/Task/目的、输入/权威/资产、独立许可与撤销、源新鲜度、实际数值退出/完整输出/Job终止与独立清理证明。Report/Evidence/Gate/Formal Version/Close共用同一判据，不能用自由文本替代执行证据。

独立人工观测不得携带`execution_receipt_id/task_id/verification_type/command_index`执行主体，也不能以加上`manual:`前缀把可执行Task结果当成人工通过；其独立manual_acceptance来源仍由原有source/time owner核验。人工观测条目不提供Task执行完成证明。

上述为实现合同，不是完成声明。实际登记、发布集合、安装器、模板/Agent/Skill和真实部署结果须由SP-I01/SP-D01证据分别验收。
