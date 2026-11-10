# 1.0.26 诊断与模型投递修复验收

执行模式：CODEX_DIRECT。RUN_ID：CODEX-SF-20261110-KERNEL-A01。产品源码资格提交：`1fab365d95af1f22328b8807195aa3b645b8042a`。最终 Git 事务和冻结合同结果分别由 `publication-live/final-delivery/` 与 `publication-live/final-acceptance/` 的真实回执证明；缺少这些回执时，本报告不代表最终交付已完成。

CONFIRMED：已修复两处 Runtime 偏离。`sf_doctor` 在未初始化或损坏配置的目录返回结构化诊断，通过原状态 owner 只读检查，不激活配置、不隐式初始化、不补写 WAL；普通工具仍保持配置接收和原有权限、恢复及 HardStop 边界。模型生成改为 OpenCode 异步投递并严格核验204，保留原30000ms投递期限；noReply的持久化顺序、真实错误与取消确认各自核验，接收不等于模型完成。

CONFIRMED：同一依赖锁下原始/修复版本完整 A/B 的14个阶段全部退出0；新增19项定向回归和1项真实31秒HTTP/SSE回归通过。完整旧测试断言、原超时及正式检查入口没有删除或放宽。`symmetric-ab-acceptance.json`、`release-identity-proof.json` 与 `ci-qualified-members.json` 分别绑定行为比较、纯版本标识变更、三平台正式原始证据。

CONFIRMED：Windows、Linux、macOS的12个正式job全部成功，6个官方ZIP的SHA256与471个原始成员逐项通过；完整构建、lint、workspace/root测试与正式安装验收通过。Windows安装117项，其他两平台114项，差集恰为3项Windows专属D23验证资产；共享文本的raw/LF内容域单独核验。每个平台39条命令，包括23组帮助输出、鉴权拒绝、启停/重启、升级/校验和卸载保留检查，退出码均符合各自明确预期。

CONFIRMED：真实用户安装通过正式升级和校验，117项一致，私有owner文件保持。旧daemon39204/OpenCode26572结束；新daemon22480与OpenCode52632身份、版本、监听地址已证明，daemon接入`http://127.0.0.1:4096`。真实GLM-5.3依次执行空目录doctor、受控ensure、初始化后healthy doctor，零WI。原验收载体错误要求首次诊断也有项目日志；权威日志策略在observability.json不存在时禁用采集。`real-positive-a01.acceptance.json`独立接受原始API消息和初始化后唯一daemon payload匹配，没有重做模型或初始化，也没有伪造首次日志。

CONFIRMED：真实模型错误与实际运行中取消均通过。额外一次已部署的真实GLM长生成在12.35ms完成投递，45.37秒后携带真实`sf_doctor`调用正常完成，未初始化项目、未创建WI。原30秒投递期限保持，证明实际生成跨越此期限仍继续完成。

INSUFFICIENT_EVIDENCE：附加有限协议夹具的全新隔离OpenCode宿主在provider预检前未就绪，尚不能确定全部上游原因；没有提交模型请求，进程均清理。这些失败完整保留、不计通过。31秒真实HTTP/SSE回归与45秒真实部署模型/工具证据共同满足既定长执行保证，未删除任何冻结的阻断要求。结论仅覆盖当前批准范围和已验证安装，不推广到所有第三方宿主或任意冷启动提供商。

规格与权威对应、角色/模板/安装器消费检查、保留边界见 `authority-consumer-audit.json`。原始失败、载体错误、修正后的独立验收与反例均在错误账本保留。证据成员以 `evidence-manifest.json` 精确列举并独立复核；活动服务日志不冒充不可变成员。最终15项冻结断言全部通过且Git事务、当前main CI、清洁Bootstrap、远端main一致均具备实际回执后，才可得出“按当前已批准规格范围，在已验证安装上能正常运行”的最终结论。
