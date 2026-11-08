# 最终规格与权威验收

当前已启用的规格范围已有正常运行证据，本轮发现的产品契约与消费者偏离已修复，验收结论为 **PASS_CURRENT_ENABLED_RELEASE_ACCEPTANCE**。本机已升级1.0.24并逐字核验117项，真实加载10个Agent、8个Skill、45个唯一工具。原项目仍由新Daemon重放为closed，5代码/9封存验收文件及main28c8e3d保持；未重跑原应用或发模型提示。

源码：f17a532a98d5716cfbae57b26916ae3dfdfce4b8；受测/部署Runtime源码c0fff6b9aa88313efd01f9e10211dd5676661e79。两者仅差历史归档的Git字节保存与执行记录，应用源码、安装资产来源一致，见final-deployment-acceptance-gate.json。SPS只更新产品版本标识，规范能力与Authority Registry不变。

| 实际环境 | 安装/帮助/Daemon/升级/卸载 | 全量回归 |
|---|---|---|
| Windows x64 | 117项，23帮助，实际通过 | 12包入口、11个有测试包、Root753通过；Daemon2423通过 |
| Linux x64 | 114项，23帮助，实际通过；当前Daemon真实systemd完整生命周期通过 | 同上；Daemon2422通过，1项Windows专属跳过；Root753通过 |
| macOS arm64 | 114项，23帮助，实际CI通过 | 本轮未将macOS平台模拟或跳过算作全量回归 |

三平台均实测鉴权拒绝、当前只读示例、未实现接口501、独立启动/重启/停机与私有/非受管留存。最终Code Quality和Distribution CI全部通过。

文档审核覆盖576份角色分类；当前/从属/通用/历史适用性分别审查。125份文档179个本地链接无缺失。1125个源文件中6254条语法表达式是可追溯检索输入，动态分支覆盖另由owner回归和实际运行证明。真实ToolIDs接口允许重复列表行，90行对应45个唯一产品定义，所有重复定义完全一致；没有忽略不一致定义。

D23执行范围仍是Windows x64固定Node24.19、单进程只读。新旧原生程序除已解析的编译时间戳/MVID外全部字节相同，C#源码不变，明确重用原合格隔离与恢复证据。本轮没有冒充新的完整原生矩阵或模型行为运行。

**完整ESLint未通过**：已有配置/解析器问题与格式诊断保留在lint-ab-02；A/B不支持把全部诊断都归为旧问题。它没有被计作成功，也没有通过关闭检查或放宽规则消除。本次通过的是明确列出的构建、当前全量回归、正式发布/部署与CI验收。

## SPS §19逐条判断

| 条款 | 证据级别 | 判断与实际边界 |
|---:|---|---|
| 1 | CONFIRMED | 唯一SPS/Registry身份、优先级及当前发布投影一致。 登记关系不等于对任意实现的自动背书。 |
| 2 | CONFIRMED | 真实冷构建/发布预检、Scope及权威消费者测试通过；根.kiro缺失。 历史测试只读取归档，不重新赋予其产品权威。 |
| 3 | CORROBORATED | 当前路径owner与实际安装/运行均落在OpenCode config root和sf-user。 没有对任意配置、任意未来负载做全机写入追踪；不以此声称数学意义的全时零写入。 |
| 4 | CONFIRMED | 本机Manifest根位置与117物理项逐字核验；三平台正式安装通过。 当前验证过的默认/自有配置根；任意用户自定义环境需对应验证。 |
| 5 | CORROBORATED | 正式CLI独立冷启动新Daemon；自有Kernel退出后Daemon仍健康，源码生命周期归属一致。 不是任意第三方OpenCode插件行为的证明。 |
| 6 | CONFIRMED | Windows/Linux/macOS真实独立生命周期通过；Linux真实当前Daemon systemd完整安装启停卸载通过。 Windows/macOS按当前规格走独立进程；未启用不受支持的服务后端。 |
| 7 | CONFIRMED | 新1.0.24 StateManager返回rebuilt_from_events=true、closed；重放/损坏恢复回归通过。 没有在原项目删除或损坏事件做实验。 |
| 8 | CONFIRMED | 当前路径/生产owner、全量回归与发布预检绑定events.jsonl。 WAL类名保留语义，不恢复runtime/wal.jsonl合同。 |
| 9 | CORROBORATED | 当前Project Init/Core与D09排除的实际回归通过，未重新初始化已交付原项目。 沿用明确绑定源码的既有初始化证据与本轮合成回归。 |
| 10 | CORROBORATED | 原真实Candidate/Gate/Decision/Merge/Close交付、5代码/9封存证据及main提交保留，当前受控链回归通过。 本轮未再发模型提示、重开原WI或执行原应用。 |
| 11 | CONFIRMED | 状态由事件owner重建；通用work_item写入口全部拒绝，权限及身份不能经产物工具覆盖。 历史元数据不是当前状态来源。 |
| 12 | CORROBORATED | 当前Guard/权限回归通过；新旧原生程序除已解析的编译标识外全部字节相同，重用已核验隔离与恢复证据。 未把本轮零参数拒绝当作新完整LPAC矩阵；受控执行仅限D23 Windows x64固定Node24.19单进程只读。 |
| 13 | CONFIRMED | Migration不在当前发布集合；Workflow/Gate/Closure/metadata/Knowledge各owner执行独立版本校验。 未知或损坏格式阻断并保留，不自动转换。 |
| 14 | CONFIRMED | 当前12包/45工具/10角色/8Skill/物理清单与SPS发布投影一致，未来模块不进入正向安装。 保留源码、通用技术模板与历史算法不等于功能启用。 |
| 15 | CORROBORATED | 真实Daemon Adapter既有生产接线与原真实Kernel链证据保留；本轮新Kernel实际加载10/8/45并匹配安装身份。 元数据加载不冒充新的模型业务行为验收。 |
| 16 | CONFIRMED | 根/12workspace/SPS发布身份为1.0.24，技术Schema独立；Version/Scope/Installer职责保持分离。 旧1.0.23标签保持，未把Schema机械改成产品版本。 |
| 17 | CONFIRMED | 三平台实际install/upgrade/verify/uninstall及留存检查通过；本机官方stop/upgrade/verify117、私有owner及原项目保护通过。 未在用户真实安装上做卸载破坏性复验；卸载在独立自有配置中执行。 |
| 18 | CONFIRMED | Scope仅在正式发布/构建链使用，实际Owner快照与依赖边界回归通过。 不以开发脚本调用Scope推断业务Runtime使用Scope。 |
| 19 | CORROBORATED | 576文档逐文件角色/适用性审核；1125源文件6254表达式枚举；45真实工具Schema、23项帮助/平台与当前HTTP/错误/模板消费者核对，已确认偏离已修复。 语法清单不是6254个不同错误，也不是穷举动态分支PASS。完整ESLint仍失败/有债务，不计为通过。 |
| 20 | CONFIRMED | 未来能力按显式SPS分类处理，不因文档或私有算法存在而进入当前验收。 不推广多进程、任意Shell、框架/网络验证或其他D23后端。 |

22章责任owner/源码哈希、每条原始证据和未作声明的范围见conformance-assessment-v3.json；当前事实见final-primary-facts.json。历史失败、载体错误和旧报告均保留，未把它们重写为成功。未知的旧现场缺失原因仍为INSUFFICIENT_EVIDENCE；已授权的基线重建没有被说成探测前现场的逐字节恢复。

最终证据归档按 manifest.sha256 封存；提交与推送的独立回执保存在同一证据根的 publication-live/，避免归档自引用。全量 ESLint 仍为未通过，不包含在验收成功项中。

本文件为最终阅读入口；早期草稿保留。final-document-hash-supplement.json 和 assessment-owner-hash-refresh.json 补记最终状态/账本的哈希，运行源码责任owner均未变化。
