# D21 检查器诊断与同权限恢复结果

EXECUTION_MODE=CODEX_DIRECT
RUN_ID=CODEX-SF-20261104-CANARY-PRODUCER-DIAGNOSIS-A01
RESULT=SINGLE_CANARY_RESULT_OBSERVED;ISOLATION_NOT_ACCEPTED

本阶段到达已声明停点：定位首个缺失的producer事实，并记录同权限有限恢复结果。正式SPS/Registry、D18、原业务和部署没有变更。

## 一手事实与解释

|分类|证据|直接支持的结论与限制|
|---|---|---|
|CONFIRMED|0005原失败、0008宿主导出解析、0011原始硬件trace、0013逐调用校验|初次观察器错误假设KernelBase包含CreateNamedPipeA，失败保留。实际加载器指出KERNEL32，修正后第一个系统query阶段发生六次NtCreateNamedPipeFile/c0000022，其中五组完整外层CreateNamedPipeA返回INVALID_HANDLE_VALUE、uv名字递增、相同Node返回地址。owner按预声明阈值终止125，非应用自然退出或安全验收。没有命中所观察CreateProcessW入口，不能推广为所有创建API都未调用。|
|CORROBORATED|上述实际调用、固定Node内嵌child_process、版本化libuv源码|默认spawnSync的pipe准备遇到权限拒绝，版本化libuv把此错误作为名字冲突继续重试；与前次120s高CPU/无报告相互印证。源码不是二进制逐指令同一性的证明，调试也有时序影响。|
|CONFIRMED|0014编译、0015原始构建冻结、0016真实运行、0017不可覆盖复制|新固定内联探针只复用既有std句柄，未新增capability/管道权限/既有ACL修改。恰好一个系统派生registryRead/启用4；普通AC挂起对照和LPAC实际AccessCheck、Job在恢复前核验。系统query实际status0，假键query实际status1，原始stderr按CP936解释为“错误: 拒绝访问。”。Node exit0，耗时3092ms，未超时；Job active0。|
|CONFIRMED|0016 owner结果与canary前后、raw stdout/stderr；0022回放|owner未把假值传入应用源码/argv/env；raw两管道未含本轮假值UTF-8或UTF-16LE，假键内容保持不变后仅非递归删除。观察到本轮单键读取拒绝，不证明任意注册表对象均不可读。|
|CONFIRMED|0018独立宿主清理、0019身份核验、0020精确副本清理|三次Attempt的自有PID/profile/假键均不存在，三份自有固定Node副本经路径/哈希/nlink核验后单文件删除。原项目/治理/源码/部署156项身份不变，原HEAD f5fed085a8609f593592eca5e8035b2d1c958759、代码权限仍撤销。独立查询对无关受保护映像的不可读项已明示，不据此声称一般生命周期验收。|
|CONFIRMED|0021/0022无OS资源回归|17项检查含真实raw回放、应用非零、坏正控制、空/重复/畸形报告及两管道UTF-8/UTF-16LE假值泄漏反例。畸形报告仍走owner失败，不能判拒绝；不是新OS运行。|
|INSUFFICIENT_EVIDENCE|完整矩阵缺失|文件入口盘根lstat及原默认pipe命令仍失败，文件/网络/恶意父子孙/完整资源和中断恢复矩阵未验收；不能声明产品执行器、部署或原WI测试可用。|

## 实际架构、归属及能力判断

真实路径为未发布C#合成launcher → 唯一新profile/固定capability → 挂起创建/实际token/Job核验 → 冻结Node内联输入 → 固定System32 reg.exe查询 → 有界继承标准管道 → owner原始结果/假键对账和回收。没有注册Tool、daemon调用、安装器资产或原WI入口；核心、模板、安装器与部署无需同步加入未验收的实验代码。

首个偏离点属于Execution Producer的stdio准备与LPAC权限边界，不能交给业务Executor绕过。原默认pipe命令在当前profile下为UNSUPPORTED；本次固定查询的既有std句柄路径SUPPORTED，仅限单合成检查。整体有限执行能力仍PARTIALLY_SUPPORTED，尚不能合法恢复原业务运行。

新路径的源输入SHA-256为849dff27e27284469d9406426c177696b115c4930f89da09b503433a270c74d8，launcher为67fdd5a9ab307d1519a559ecab8e627dcc20605949dbc961e78335f395157194；原始构建见build-inherited-stdio-03/identity.json。实际执行种类为node_inline_frozen_inherited_stdio_probe，未将原文件命令或默认pipe命令改为通过。

## 原始资料与后续边界

固定Node源码来自实际二进制的只读内嵌导出，见node-builtins/identity.json。源码机制辅助来自官方版本化[libuv pipe.c](https://raw.githubusercontent.com/nodejs/node/v24.19.0/deps/uv/src/win/pipe.c)与[spawn_sync.cc](https://raw.githubusercontent.com/nodejs/node/v24.19.0/src/spawn_sync.cc)，具体运行事实以上表raw trace为准。

下一步应先对照D20/D21从属合同明确剩余合成验收的具体有限输入、正控制与恢复判据，再按允许范围实施。单哨兵成功不扩大D21到生产；产品采用、完整矩阵、公用入口、部署及原WI仍各有独立门禁。不重审旧Candidate/分支，不新建重复WI，不读取真实凭据，不增加第二capability或改既有ACL。

附带载体事实：本轮多文件显示两次截断，随后对关键回执仅提取退出码/时间并读取实际原始输入及结果，不把未显示部分称为已读。一次收尾资料列表请求了不存在的可选review-and-validation.json导致shell exit1；前面的复制已成功，该缺失不作为产品或隔离失败。所有正式实验/编译/回归非零及owner终止均保留原seq。
