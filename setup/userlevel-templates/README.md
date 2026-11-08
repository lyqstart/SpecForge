# SpecForge 项目配置模板

本目录是已安装模板的数据来源，由正式 Installer 部署到 <OpenCode config>/sf-user/templates/。模板提供技术栈事实、规则与验收声明的起点，不授予工具权限或命令执行能力。

项目初始化由 sf-orchestrator 调用受控 sf_project_init 完成。项目配置文件位于 <project>/.specforge/config/，不是 .specforge 根下的任意同名文件。host-profile.json 由用户级 Host Profile owner 管理；它描述宿主事实，不是 Project Spec 或 workflow state。

Orchestrator 根据真实项目与用户确认选择 project-rules/_BASE.md 及适用技术栈规则，维护 project-rules.md、prod-environment.md 等受控项目资料。缺少的信息保持未知/待填写，不把模板默认值当作已采集事实。不得让用户手工复制文件绕过项目写入 owner。

运行环境、版本和依赖应来自实际生产约束、锁文件及可复核探测；旧模板中的版本/工具示例不代表当前维护状态或本项目的自动选型决定。数据库 schema 演进描述的是业务项目设计，不恢复 SpecForge Migration 产品模块。

测试命令字段只是待批准的验收声明。D18 的 sf_safe_bash 保持只读；真实 sf-orchestrator 通过 sf_verification_plan 建立计划，真实 sf-verifier 通过 sf_verification_run 执行。当前 D23 仅支持已批准的 Windows x64 严格单进程只读 Node profile。未知/不支持的 Bun、Python、Java、Go、容器或数据库检查必须保持 not_executed/blocked，不能改走普通 shell 或伪造通过。

配置和模板不保存密码、Token、API Key 或完整凭据。项目事实/规则变化通过现有 owner 和冻结合同处理，不能静默改写活动 WI 的已接受输入。

- dev-environment.md：开发环境事实模板。
- prod-environment.md：生产约束模板。
- project-rules/：通用、语言、框架、数据库与基础设施的派生规则素材。
