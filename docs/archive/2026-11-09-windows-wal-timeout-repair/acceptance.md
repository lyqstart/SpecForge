# Windows 超时修复与全量验收

结论：PASS_CURRENT_APPROVED_RELEASE_SCOPE_WITH_CI_TEMP_STORAGE_REPAIR。冻结候选 3262bc6a2caa60dcc6bcb4c22e918af76c297bca，版本1.0.25。最终main提交、远端一致性、干净READY和main CI记录在publication-live，避免封存自引用。

已确认CI入口忽略RUNNER_TEMP，隐式使用系统临时卷。两台真实Windows宿主的同Node、同字节、同采样和逐次sync对照显示系统临时卷延迟明显高于runner临时卷；规范路径和短名别名具有相同文件身份，单纯路径表示不能解释差异。对原首次超时的归因强度为CORROBORATED；该现场没有逐操作时序，未声称逐毫秒重放或确定具体硬件/杀毒原因。

修复仅涉及CI入口及新增回归/夹具：RUNNER_TEMP缺失或非法时在执行前拒绝，复用已有native目录校验，统一传播TEMP/TMP/TMPDIR，并记录选择来源。生产WAL、StateManager、原失败测试、10秒预算、采样数、断言和逐次fsync保持逐字一致。未修改产品SPS/Registry或增加运行时能力。

- 同一新回归在原入口收集9项，其中7项语义失败、2项兼容通过；修复后9项通过，另5项既有跨平台契约通过，原状态/WAL专项43项通过。类型/格式调整前后的完整运行时AST一致。
- 独立临时工作树、同锁同运行时、隔离用户配置的双方冷安装/清理/构建/lint/全workspace/Root/安装器七阶段全部exit=0。
- 逐用例补充：基线545文件/7411项，候选546文件/7420项，全通过且pending=0。545个同名同集合文件无新增失败；新增1文件保持AB_INCOMPARABLE，其9项独立通过。历史Suite与用例不同粒度反例检查通过。
- Windows/Linux/macOS各自完整lint/build/workspace/Root原始ZIP、官方SHA、内部清单、数字退出码、源码/锁/运行时和RUNNER_TEMP上下文均通过；632个TypeScript文件零错误零警告，11个测试包及Root753通过。三个官方安装发布生命周期与聚合通过，共12项正式job成功。
- SPS、Registry、架构文档、执行协议逐字未变；活动规则仅增加EXP-122临时存储要求。历史账本仅追加，两个既有封存目录全部成员字节核验通过。
- 真实用户级117项受管文件与此前部署逐字一致，Daemon39204健康且启动身份不变，owner.key仅核验元数据且未读内容。重建C#程序仅有结构解析出的编译标识差异；daemon构建路径差异已观测，未冒称所有二进制差异均已规范化。此次无部署、重启或业务项目访问。

关键原始证据：candidate-ci/acceptance.json、qualification-comparison.json、diagnostic-summary.json、authority-source-audit.json、final-runtime-health.json。失败采集和载体错误完整保留，带探针的诊断全量不作为发布通过证据。

当前批准发布范围通过验收。真实模型业务流程和完整原生攻防矩阵不属于本次新增执行的证明范围。

正式Windows全量中原property-1整组14项耗时661ms并通过；不把该耗时作为通过标准或原失败现场重放。

证据载体出现3次外层编号碰撞，退出1保留，丢失的外层原始流未补造。实际七阶段/逐包命令独立保存的14+24份数字OS退出码、命令四件套和原始报告均重新核验通过；并发占号及故意非零夹具的保留检查通过，详见carrier-evidence-reconciliation.json。最终运行时核验为final-runtime-health-after-structured.json，之前final-runtime-health.json只作为较早冷验证结束时的观察保留。
