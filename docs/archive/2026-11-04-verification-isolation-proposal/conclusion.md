# 隔离验证裁决准备结果

CONFIRMED：本轮仅完成只读取证与提案，没有修改SPS/Registry、执行器、Agent/Skill或安装器，没有启动隔离进程、安装系统组件、创建AppContainer profile、改变系统ACL或运行业务测试。

0003与0005正式/独立证据确认：原WI-0001仍为implementation_running，代码权限已撤销；原提交f5fed085、五业务文件与WAL均未漂移。当前daemon仍为1.0.21/PID21644，磁盘二进制与昨日部署指纹相同。11份真实源码/模板以及安装边界已保存，两个已安装执行库与其模板字节一致。

现有内部只读执行为SUPPORTED，受控脚本/测试完整路径为UNSUPPORTED；拟采用的Windows LPAC后端本机兼容性仍是INSUFFICIENT_EVIDENCE，必须由批准后的真实PoC证明。不会以Windows版本、工具文件存在或官方机制说明代替本机验证。

具体提案为proposal.md，身份VERIFICATION-ISOLATION-PROPOSAL-001，当前PROPOSED_NOT_APPROVED。它限定Windows x64、只读Node验证、独立受控计划/运行owner、真实进程和证据交付，不恢复通用宿主Shell。首期不授予应用磁盘写权限；若Node正例不能在该边界运行，停止并另提具体差异，不能临时加宽权限。

停止原因：当前Registry第6节要求产品负责人明确决定后，依次更新SPS、合同、实现与验证。用户本轮“继续”允许继续准备可审阅方案，并未对尚未展示的后端/范围作出具体裁决。现有Candidate批准及两分支名确认均继续保留，不重复询问。

本轮验证：完整读取五份必需规则到EOF并有区间/哈希/重组证据；原状态/内容/安装身份和主机只读探测已取得；方案逐项列出输入、角色、输出、权限、继承、失败恢复、Task兼容、消费者和先PoC后业务的验收顺序。文档变更不运行源码构建或业务测试，不宣称新能力可用。最初显示截断、CIM限制与只读PowerShell解析失败见ERR-1913；没有隐藏为通过。

下一合法动作是对proposal.md作明确产品裁决。批准后才先写SPS/Registry，并执行合成PoC；通过全部隔离/进程/证据验收后再完成正式接线、发布部署与原WI恢复。原业务main合并仍不在此次决定内。
