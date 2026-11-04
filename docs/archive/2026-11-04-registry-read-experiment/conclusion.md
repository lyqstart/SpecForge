# D21实验结果：内联正例通过，假哨兵隔离未证明

RESULT=SYNTHETIC_EXPERIMENT_INCONCLUSIVE
ISOLATION_ACCEPTANCE=NOT_ACCEPTED
CAPABILITIES=registryRead_ONLY
PRODUCT_OR_BUSINESS_EXECUTION_ENABLED=NO

用户已明确批准仅合成实验。0001将已审阅D21候选原始字节写入正式SPS §9.2.2 / Registry，实际哈希与候选一致，之后才编译执行。实验profile独立于D20，未修改sf_safe_bash、公开工具、安装器或部署，没有运行原WI。

## 本机已确认结果

| 行 | 实际结果 | 证明与边界 |
|---|---|---|
| S01文件入口 | 0005，exit1 | 实际单registryRead/LPAC/Job通过恢复前检查；Node入口realpathSync在lstat D盘根时EPERM，断言未执行，不授予盘根权限 |
| S01固定内联 | 0009，exit0 | 逐字节相同断言，独立node_inline_frozen argv、无调试，输出完全匹配；只证明这个内联探针，不改原文件命令失败，也不是原Task通过 |
| R01假注册表凭据 | 0013，Job上限终止，应用exit124 | 未产生查询报告；elapsed120029ms触发owner总时限，Job随后active0。不能判断假凭据可读或不可读 |
| 空报告处理回归 | 0018，exit0 | 用真实空stdout及null/畸形/缺字段报告验证不接受为查询结果；不是R01重跑，不证明隔离通过 |

三个实际运行的token均恰好含系统派生registryRead SID `S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-3232135806-4053264122-3456934681`，启用位4；普通AppContainer挂起对照及LPAC有效权限区分均保留。固定Node原始SHA256仍3602f2bb…47d0237，无第二capability、文件写权限或网络能力。完整数据见experiment-result.json及各Attempt原始文件。

R01使用全新唯一owner假键，只有OwnerAttempt与随机FakeCredential。假原值没有进入应用源码/argv/env；它不是任何真实凭据。查询程序是固定System32/reg.exe，原计划要求先证明系统键查询可用，再测试假键；本次没有该正控制或目标查询的完成结果。仅凭空输出、脚本命令或某次部分进程观测，不能断言停在哪个API或归因为某一权限。

原生owner在超时后继续解析空stdout，出现NullReferenceException；原回执和异常不改。修正源码现在先分类总时限、再处理报告，空/无效报告保持INCONCLUSIVE；final源码另编译并封存，未再次运行OS实验。这个修正不等于修复查询停滞。

## 独立核验与停止范围

0020成功的64位宿主进程清单、profile和假键精确路径复核确认三个Attempt已回收；原生Job也均active0。owner记录假键前后值未变，再仅非递归删除本轮新键。0021原业务/治理事件/既有源码模板/部署156项仍一致，原f5fed085及代码权限撤销保持；0022只删除三个路径/单链接/哈希核验后的自有Node副本。没有改已有用户/系统ACL，没有创建loopback服务或读取真实凭据。

R01保持INCONCLUSIVE。按批准方案在未知边界处停止，后续文件、网络、父/子/孙及完整限额/中断恢复未执行；本轮120秒终止事实不能替代完整L02/L03矩阵。没有生产profile采用决定、public producer/consumer、release或业务验证。当前能力仅PARTIALLY_SUPPORTED：固定内联Node可运行，原文件入口及完整验证交付仍不受支持。

下一合法动作是先只读定位R01 producer未完成的首次偏离点，再在相同已批准单capability边界内形成新的有限producer/正控制计划。不得盲重跑、增加能力或放宽ACL；超出D21仍需新的具体产品决定。原Candidate、分支及本次D21批准无需重复。原WI的implementation_running、权限撤销、PSV-0002与未执行Task005保留，不推进完成/关闭或业务main合并。

TRUTH_SOURCE_WRITES=已批准SPS/Registry D21、现有从属合同D21细化与唯一project-status；REPOSITORY_TRACKED_WRITES=未发布合成源码/README、经验/.gitattributes与本根；RUNTIME_OBSERVER_WRITES=三次新profile/只读副本及一次新假键/回收、编译器与固定探针进程，未创建网络哨兵；EXTERNAL_EVIDENCE_WRITES=原始管道/回执、源码与二进制、精确对账。旧证据不改。
