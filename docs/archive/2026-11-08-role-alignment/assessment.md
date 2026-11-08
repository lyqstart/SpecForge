# 规格与权威复评

本轮 D18/D23 角色、基础契约和相关 Skill 修复及真实部署验收通过。当前 Windows 首期范围已有正常运行证据；对于“全产品、全部平台、所有消费者均已无保留符合”的声明，结论仍为 **INSUFFICIENT_EVIDENCE**。这不是新发现的运行故障，而是以下证据范围限制。

最终源提交：7ecc7cfe7862e1f0d3d1cf4acb9ca8b3b6dba46c。产品规格和 Authority Registry 原始字节未改动。

|SPS19条款|证据分级|结论与范围|
|---|---|---|
|1|CONFIRMED|Registry唯一SPS指针、根入口及SPS/Registry当前字节身份一致。 权威关系得到直接证明，不代表所有下游实现自动合规。|
|2|CONFIRMED|当前Root authority/scope消费者回归、正式precheck及.k iro退役事实；实际根.kiro缺失。 归档仅保留历史；未将旧标准或旧报告当产品行为权威。|
|3|CORROBORATED|规范路径owner、当前CLI/安装器/ThinClient来源；旧home仅lstat元数据、无内容读取。 没有对任意运行负载做全机文件系统追踪，不能用元数据证明所有未来执行绝无旧home写入。|
|4|CONFIRMED|真实OpenCode config root内specforge-manifest及sf-user；117项逐字SHA一致。 证明本机当前安装与路径owner；用户自定义平台路径仍须相应实测。|
|5|CORROBORATED|Thin Plugin源码/当前回归，正式CLI冷启动；自有Kernel退出后PID45576独立健康。 生命周期观察和静态调用边界共同支持；不是任意第三方插件行为的证明。|
|6|CONFIRMED|独立安装Daemon冷启动、健康及Kernel退出仍存活；历史真实拒绝和当前边界回归已绑定原始回执。 实测范围Windows本机；本轮未运行Linux systemd真实服务。|
|7|CONFIRMED|已安装sf_state_read明确rebuilt_from_events=true且closed；StateManager/WAL当前owner与历史回放回归来源核验。 未在原业务删除/损坏事件做实验；损坏恢复依赖自有合成回归，不能拿正常读取替代。|
|8|CONFIRMED|当前事件owner使用events.jsonl；Root路径投影/依赖方向回归和生产目录定向检索。 WAL类名表示语义，不等于runtime/wal.jsonl路径；历史负例不当正向消费者。|
|9|CORROBORATED|ProjectInit owner模板/当前Core路径及历史原始初始化回归；D09暂缓集合在正式范围外。 未为此次文档修复重新初始化原业务；无破坏性现场实验。|
|10|CORROBORATED|真实原WI已受控完成的Candidate/Gate/Decision/Merge记录与owner源；合并HEAD及当前closed保留。 此为现有受控链和消费者证据，不是穷举所有并发/崩溃交错的数学证明。|
|11|CONFIRMED|当前work-item metadata validator与StateManager事件源；实际state owner返回重放状态。 元数据中的历史展示字段不能被当作当前状态权威。|
|12|CORROBORATED|真实native boundary/write guard owner、既有实际拒绝原始回执、当前D18拒绝与D23 owner mismatch/permission保持回归。 本轮未重新跑完整原生攻防矩阵；五个合格原生资产逐字未变，旧失败仍保留。|
|13|CONFIRMED|当前权威投影/正式release precheck及中立schema owner；Migration不在当前安装运行集合。 出现migration审计分类或历史恢复术语不等于启用迁移产品模块。|
|14|CONFIRMED|SPS current/future分类与正式117物理清单一致，未安装未来模块/第三方Plugin Loader/OpenClaw。 只判断当前正向发布集合，不以存在源码/文档声称未来能力实现。|
|15|CORROBORATED|真实Daemon Adapter生产接线、历史Kernel/专业Agent/执行原始证据；当前loader源码身份/状态owner真实读取。 本轮没有发送新模型提示或重跑原WI；loader检查本身不等于模型业务行为验收。|
|16|CONFIRMED|Version Unification与Scope/Installer真实owner边界和当前Root回归；发布资产从正式registry生成。 证据限定当前release源码和依赖集合。|
|17|CONFIRMED|本轮正式升级15+1份Markdown、两次verify117；历史实际install/uninstall/事务恢复原始回执独立验封。 未在当前用户安装上做卸载破坏性复验；该能力沿用相同未变installer的原始验收。|
|18|CONFIRMED|Scope Gate导出/包清单/生产依赖边界与Root回归；只承担release/build。 历史Scope源码保留不代表业务Runtime启用。|
|19|CORROBORATED|本轮完整当前10角色/模板/8Skill清单，正文/示例/交接统一；22维护、83相关、748Root，117安装及10/8真实加载。 本轮闭合所有已确认D18/D23消费者缺口；尚未逐句穷举全产品所有帮助、错误和文档正向分支，不能无保留声称所有消费者已证明一致。|
|20|CONFIRMED|当前SPS machine projection、future分类、正式registry及实际安装集合共同绑定。 未来文档/disabled角色不进入当前运行或验收集合。|

原始证据索引见 conformance-assessment.json、historical-primary-reuse.json 和 assessment-primary-facts.json。历史命令的原始回执/输出已逐项重验封存哈希；旧的20行汇总PASS未被采用。

本轮最终验证：维护22项、相关9文件83项、Root51文件748项；正式precheck、两次upgrade/verify117；原生5项不变；实际加载10 Agent与8 Skill，独立Daemon健康。原WI事件重放仍closed，本地main及5代码/9验收证据保持。未重新调用模型、执行原应用、开放代码许可或改动发布标签。

仍未证明：所有平台真实部署、全量帮助/错误/文档每个正向分支的穷举审计，以及旧现场缺失根因。超出D23的Shell、构建、网络、第三方测试框架等保持拒绝，属于规格边界，不能当作已支持。
