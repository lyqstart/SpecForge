# 单进程验证能力接入产品的具体采用方案（待裁决）

当前[合成验收](acceptance-review.md)已完成D22 SP-P01至SP-L03，原始证据及限制随本目录封存。整体SpecForge仍不能声称按规格正常运行：产品执行入口、共同消费者、安装部署及原WI Task005尚未闭合。

请求决定：将已验收的严格单进程候选 **windows-lpac-node-single-process-readonly/v1** 作为产品首期只读Node验证能力，允许按下列完整闭环实施并验收后部署。固定Windows x64/Node24.19原字节身份，LPAC、单registryRead（不是单键注册表白名单）、child policy1、DETACHED、no-addons、Job1、无应用文件写入和网络、总提交1GiB、两管道各1MiB、墙钟至多120秒。需要子进程、第三方依赖/native addons、未知命令语义均拒绝，不扩大首期能力。

批准后的实施顺序：

1. 将采用决定写入正式Authority Registry与SPS及从属合同，保留D20/D21及旧多进程失败；不把本提案当作生效产品权威。
2. 从现有真实工具注册/handler和StateManager扩展两个受控入口：sf-orchestrator拥有sf_verification_plan；sf-verifier拥有sf_verification_run。继承真实调用者身份、权威WI/版本/HardStop和独立验证许可；代码许可撤销不被改成执行授权，sf_safe_bash保持只读。
3. 计划保存原声明、有限命令解析、归一化实际argv、断言/输出/退出含义、完整输入与固定资产身份。任何不能证明与Task验收语义对应的命令标为not_executed/合同冲突，不手改原Task或伪造通过。
4. 产品producer从受信计划启动固定预编译资产；可信owner控制通道记录原始字节、真实进程/Job事实及不可变回执。业务stdout不得自行宣告通过；超限、未知、取消、中断、漂移、残留均失败并保留受控恢复。
5. Report/Evidence/Verification/Gate/Formal Version/Close接同一校验器，统一核验来源、角色、当前状态、计划/源/资产/回执新鲜度，拒绝篡改、复制、旧审批、错误owner或HardStop绕行，完成SP-I01真实正反例。
6. 同步源码、模板、Agent/Skill、精确工具登记、构建资产、安装器和用户级部署副本；完成SP-D01安装后新Daemon真实正反例及崩溃恢复。未通过之前不对原业务启用；本提案不预定未经验证的新发行号。
7. 再通过原WI owner从合法断点恢复同一WI，先核验原Task005四个greet测试和E2E命令语义，使用正式工具取得真实结果；依既有Gate/Audit/Merge/Close要求推进，不能自动补写implementation_done或verification_done。最终以完整规格对应的真实验收说明可运行范围。

依据：SPS9.2.2明确“是否采用进产品须依据完整证据重新裁决”；9.2.3明确独立生产采用后才接产品工具、消费者、部署及原WI。此前“采用单进程首期方案”只批准了合成范围；本次决定是是否进入上述产品闭环实施阶段，无需你手动运行终端或修改真相源。
