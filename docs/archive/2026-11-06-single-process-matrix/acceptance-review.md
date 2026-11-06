# D22 单进程合成隔离验收

结论：**ACCEPTED_FOR_D22_FINITE_SYNTHETIC_MATRIX**。这是已固定 Windows 主机、Node24.19和候选profile的有限合成矩阵通过；产品工具、共同消费者、部署和原WI仍未完成，不能声称整体规格正常运行。旧多进程方案仍未通过，旧封存报告中的目录联接过度结论已另行纠正。

RUN_ID=CODEX-SF-20261106-SINGLE-PROCESS-MATRIX-A01；CODEX_DIRECT。权威为Registry D22、SPS9.2.3及从属SP矩阵，规则门禁0004。原始命令四件套、数值退出码和即时封存位于commands/。以下为直接一手运行事实（CONFIRMED）；汇总判定以这些事实与正式矩阵逐项对应。

| 行 | 本轮原始证据 | 直接证明 |
|---|---|---|
| SP-P01 | 0019/20 CJS；0021/22嵌套TS；0023/24 ESM；0025/26固定内联；build-single-p01-02 | 四种入口实际应用/owner0，断言及有效no-addons拒绝，固定输入不变；不是原Task命令已经执行 |
| SP-A01 | 文件身份0030/33；文件/别名0037/38；原生UNC0042/43 | 真正nlink2硬链接、mount-point tag目录联接、两条旧symbolic tag只读复用、扩展路径及直接路径拒绝；宿主正控制和原字节/ACL不变；输入完整集合/身份校验拒绝链接 |
| SP-A02 | 0037文件写；0042原生七帧；build-single-native-05 | input/runtime/profile/temp写拒绝，六个对象WRITE_DAC均5；系统注册表读0、宿主假键读写5、私有Storage写/WRITE_DAC拒绝；前后键集合/值/ACL不变、假值未泄漏 |
| SP-A03 | 0037/42；宿主正控制0073/74 | loopback/外部TCP拒绝，原生UNC四项65；普通创建367、breakaway5、override367、console367；可信直接父进程三类特权句柄5。COM在co_initialize即E_ACCESSDENIED，未到WMI Create；宿主实际WMI Create成功并结束 |
| SP-L01 | 0042；0062；独立清理0078 | 创建前实际child policy1，Job1，观察成员峰值1；launcher被199终止后稳定主进程句柄结束，独立无本轮遗留。挂起普通AppContainer对照从未恢复且先结束，Job累计2不代表同时两个应用成员；未声称执行过孤儿后代 |
| SP-L02 | 0047/48墙钟124；0049/50取消130；0051/52输出137；0053/54内存1与Job通知10 | 四种实际拒绝发生，应用及owner均不能作为passed执行；主进程/Job结束、profile回收；Job1和唯一角色0独立绑定。build-single-resource-06 |
| SP-L03 | 0062至0066；0067至0070；daemon-fixture-build-08 | launcher真实硬杀；清理意图进程198中断，新owner恢复0并幂等0，缺失producer回执原样保留；真实Daemon199、broker1、应用140结束，实际新Daemon健康200、鉴权停止200/exit0、握手清除 |

0081整体完整性校验直接核验80个既有命令封存、旧3403成员、新核心26资产、正例和拒绝/恢复链；0077回执反例36项通过。0078独立原生PID/出生时间与资源核对：17资源身份、73进程观察、0问题。0080只精确移除16份自有Node副本共1,485,206,656字节；不删除夹具或历史证据。0079原业务/治理/安装副本156文件不变，代码许可仍撤销，业务HEAD f5fed085，business main未推进。

失败不改：0014编译Count错误、0028旧.NET扩展路径错误、0057工具文件访问EPERM及0058旧bundle快照均保留；07快照无资格执行，实际生命周期仅用重编译/重新冻结08。修改责任是未发布执行producer/Runtime及可信证据层，未用业务补丁绕开边界。

仍未证明：SP-I01/SP-D01、业务可选择的profile、sf_verification_plan/run、共同Gate/Evidence/FormalVersion/Close验签与新鲜度、部署安装资产、原Task005命令语义和真实工具端到端。合成输出帧仅用于固定第一方探针，不能成为任意业务stdout转换可信回执的接口。D21生产采用须依据完整证据另作裁决；本验收不注册或启用产品执行。
