# 开发环境参考（已退役）

当前新项目不创建或读取这份旧开发环境文件。宿主事实由用户级 Host Profile owner 采集，保存在 <OpenCode config>/sf-user/host-profile.json；它不属于 Project Spec，也不能作为 workflow state。

本文件作为安装集合中的退役说明保留，不提供自动兼容、复制到项目或填写后自动触发重新设计的合同。旧结构原文保存在仓库审计归档中。

需要的工具版本、OS、shell、locale、时区与资源事实应由当前 owner 的真实探测回执提供；不能从旧模板默认值、产品版本或语言偏好推断。时间、错误消息语言和技术栈选择分别遵守项目已批准合同，不由单一 system_lang 字段强制改变所有运行日志。

测试命令只能作为待批准的验收声明。D18 sf_safe_bash 保持只读；真实 sf-orchestrator 使用 sf_verification_plan，真实 sf-verifier 使用 sf_verification_run。当前 D23 仅支持已批准的 Windows x64 单进程只读 Node profile；未知/不支持的命令保持 not_executed/blocked，不执行 shell 回退。

不要在环境资料中保存密码、Token 或完整凭据。通过当前初始化/配置 owner 维护项目事实，不手工修改活动 WI 的冻结输入。
