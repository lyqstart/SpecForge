# 只读 Node 隔离：真实合成验收复核

RUN_ID=CODEX-SF-20261105-SYNTHETIC-BOUNDARY-MATRIX-A01；CODEX_DIRECT；基线53bf7d6c33575d765b2bc23805f32e8d5d34ac6c。记录仅证明已完成的有限试验，不是产品裁决或整体SPS验收。

结论：**PARTIALLY_SUPPORTED / FULL_MATRIX_NOT_ACCEPTED**。只读隔离、后代继承、多个资源终止和中断恢复已有真实正反例；严格瞬时总成员进程上限未证明。20ms采样发现超额后立即终止不能替代该保证。D20零capability配置仍不能启动固定Node，D21仍仅合成，不注册产品profile、不接public Tool、不部署、不执行原WI。

后续更窄配置实测：0245固定CJS文件、0260原生TypeScript/ESM文件在实际child policy1/DETACHED/Job1下app与owner均0；0265宿主原生正控制和0266 guest拒绝证明普通创建、breakaway、策略override、控制台及可信父进程特权句柄的有限边界，峰值1/Job空/profile0。它未改变旧多进程未验收结论；新矩阵及产品范围仍待正式决定，见single-process-scope-proposal.md。

## 证据与覆盖

所有序号指本根commands下已封存的原始命令/数值退出/输出，Attempts保留脚本、事件和producer原始回执。lab退出0表示预期拒绝证据成立时，应用回执仍为失败，不能当作测试通过。

| 行 | CONFIRMED的有限事实 | 原始证据 / 尚未证明 |
|---|---|---|
| P01 | 内置node:test父子孙真实断言、正确LPAC/SID/Job及全树结束；固定文件/本地模块的读取和写拒绝；Node CLI相对文件测试实际app/owner0 | 0004 c951；0218 0ff4；0227 abb9，node-file-attempts保存模块。原不带flags文件和默认pipe命令仍失败；不等价于原WI已执行 |
| A01 | 绝对路径、硬链接、目录联接、两条真实符号链接及影子假凭据的父子孙读写拒绝，哨兵/ACL不变；UNC正控制成功而guest原生访问65 | 0079 b138共54检查；0149 2638每角色13行/四次原生UNC拒绝。0241再次核验两符号链接与目标原字节 |
| A02 | input/runtime/profile/temp及宿主假键拒绝写；新建私有Storage经owner保护后直接写和WRITE_DAC拒绝；真实早期可写失败保留 | 0009失败；0016 e39d、0021、0079、0149。有限夹具不是对所有系统路径的穷举证明 |
| A03 | 三角色loopback和固定外部TCP端点EACCES，宿主前后正控制成功；COM初始化E_ACCESSDENIED；普通/请求breakaway的原生挂起后代均仍在外层Job和LPAC | 0140宿主实际WMI Create0/payload0；0141 f371 guest0；0149 2638。guest在COM初始化即被拒绝，不能声称WMI Create已在guest调用。外部网络仅1.1.1.1:443连接/关闭，无应用载荷 |
| L01 | 父先退出仍终止后代；真实launcher199硬终止后四成员稳定句柄结束；独立清单无本轮运行映像与已登记原身份 | 0072/73 9dd2；0161 5fd4；0237。Job最后句柄关闭后不可查询，不伪造此时Job计数；使用完整预杀成员与独立结束事实 |
| L02 | 当前墙钟124、三独立Node角色与全树终止；取消130、输出137、内存实际消息10/非零及Job空；进程超预算实际139立即终止、不能passed | 0231..233 wall779f；0047/48 cancel9075；0050/51 output6314；0053/54 memory51ef；0154..156 processe371。原native8曾实际9/15，严格瞬时总成员上限NOT_PROVED，本行不能完整通过 |
| L03 | launcher硬杀、恢复意图阶段真实198再恢复0/幂等0；实际Daemon硬杀199，broker1/application140、四成员结束/Job空/profile删除0；实际新Daemon健康200、鉴权stop200、exit0、握手清理 | 0161..166；0201/202恢复缺最终回执的45eb；0208/209 f03a。旧载体失败和未知退出保留，无已有用户Daemon操作 |
| I01/D01 | 尚无生产工具、共同Gate消费者或发布部署链路 | NOT_EXECUTED；不得由库/合成通过替代 |

## 独立清理与原任务

0237独立读取37个Attempt、288项历史PID观察：本轮profile、私有Storage、假注册表键均不存在，未发现本轮runtime映像。历史PID8008当前访问受保护；固定hash的0082独立清单已证明原身份在2026-11-05T04:11:16.026953Z缺席，当前身份读取未知保留。0235原失败没有删除。

0238在完整预检、精确路径/单链接/固定Node原字节hash之后，逐文件删除18个本轮Node副本，共1,670,857,488字节；旧15个副本清理证明仍保留。没有递归删除证据或改动安装Node。0240核验原业务、治理、源码基线与部署156项身份不变，权限仍撤销、业务HEAD仍f5fed085a8609f593592eca5e8035b2d1c958759。

原WI-0001的Task005仍NOT_EXECUTED。没有implementation_done、review_done、verification_done、Formal Version、Close或业务main合并。部署仍1.0.21。本阶段不能说“按规格已经能正常运行”。

## 责任归属与下一步

首次缺口在未发布Execution Producer / Runtime资源控制，能力为PARTIALLY_SUPPORTED。不能修改业务测试掩盖它。当前采样计数已补齐失败关闭，但不提供严格瞬时创建上限。继续现规格必须先获得可验证的创建前约束；若产品负责人选择接受检测后终止的较弱语义，则须先明确修改SPS/Registry，不能把它称作原规格修复完成。D21增加registryRead的生产采用也须独立明确决定。

后续才可实现真实sf-orchestrator的sf_verification_plan、真实sf-verifier的sf_verification_run、不可变输入与计划、独立许可、可信回执与Gate/Evidence/FormalVersion/Close共同消费，完成篡改/HardStop/权限反例、安装器固定资产和新Daemon实测，再由原owner恢复原WI。用户目标或聊天批准不能替代这些真实链路。


## 本阶段收口与新范围

用户明确选择“采用单进程首期方案”，原提案字节和答复绑定于single-process-scope-user-decision.json；该决定仅批准正式范围及新合成验收，不批准产品采用。0269原始单进程报告/篡改反例18项通过。0284最终清理：50个资源身份、306项PID记录无问题；0275当前六个WMI正控制nonce无残留，历史未知不补造。0285精确回收新增7个Node副本；本阶段累计40个副本、3,713,016,640字节已逐文件回收，原Node和原始证据不变。0286原业务/部署156身份不变；0287六历史封存根1895成员、此前286条命令封存、build30的26成员、37个顶层脚本语法和有限敏感模式扫描通过。新的完整单进程矩阵尚未验收，原WI Task005仍未执行。
