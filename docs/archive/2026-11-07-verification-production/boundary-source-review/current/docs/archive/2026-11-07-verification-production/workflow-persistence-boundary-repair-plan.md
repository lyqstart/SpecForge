# Workflow Runtime 持久化边界核验与最小修复

记录时间：2026-11-07T05:34:27Z；模式CODEX_DIRECT；沿用本轮RUN_ID与证据根。用户持续要求修复至符合规格，本记录不新增产品能力或替代产品裁决。

CONFIRMED：SPS §8明确排除Workflow Runtime的独立workflow-state persistence及project runtime physical path ownership。当前`packages/workflow-runtime/src/index.ts`仍公开WorkflowPersistence、createWorkflowInstanceStorage和StateRecoveryManager；storage工厂调用真实文件写入实现。当前包main指向dist/src/index.js，工作区构建包含该包、tsconfig收录src/**/*.ts，Release Manifest生产者核验包main/types入口。原生部署只安装CLI/Daemon等117个受管文件，没有单独安装该NPM包。

CONFIRMED：在当前daemon-core/src、cli/src、setup、scripts检索上述持久化类/工厂没有生产调用；ProjectManager真实状态所有者是Daemon StateManager。此检索不证明任意第三方无法调用公开包API。当前root CURRENT_HERMETIC的feature-spec-e2e仍直接使用旧WorkflowPersistence；它的通过不能证明SPS §8持久化归属符合。

结论：当前公开模块/构建边界与SPS §8不一致；责任层为模块Contract/导出/构建和过期测试消费者。尚无证据证明当前安装Daemon实际使用双重状态源，不能把模块缺陷扩大成该运行结论。

修复范围：保留旧实现、旧测试和示例的可复核原始字节；将独立文件持久化/恢复实现退出当前生产模块、包导出和发布构建。保留Workflow编排与中立类型，不增加第二状态所有者。核对所有导入者；旧测试作为历史证据保留，当前持久化验收必须由真实Daemon StateManager/WAL/恢复路径承担，并补模块入口与实际构建的回归。更新唯一project-status的源范围后再实施。

验证顺序：当前入口缺陷重现 → 原始快照及调用图 → 最小模块退役与消费者迁移 → 独立边界回归/完整类型 → 工作区构建/发布预检 → 当前root回归 → 判断既有编译Daemon是否需重建及安装，并按真实二进制身份复核。任一失败先分类，禁止以删除断言或降低SPS要求通过。原业务不参与该合成修复，不读取旧聊天或向外部模型发送数据。

恢复点：原WI保持implementation_running、代码许可撤销、原1057文件不变；真实外部模型续验仍等待明确的数据外发授权。此本地模块修复不代替该授权，也不授权业务main合并。
