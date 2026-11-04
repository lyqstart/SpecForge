# 已定位的启动拒绝与未批准的下一实验

RESULT=DENIED_RESOURCE_IDENTIFIED
ISOLATION_ACCEPTANCE=NOT_ACCEPTED
CAPABILITIES_ADDED=NONE
BUSINESS_TESTS_EXECUTED=NO

CONFIRMED：0013的真实新合成进程中，WSAStartup(2.2) → RegOpenKeyExA(`HKLM\System\CurrentControlSet\Services\WinSock2\Parameters`,0x20019) → NtOpenKeyEx(`\REGISTRY\MACHINE`,0x02000000)返回`0xc0000022` → 注册表接口返回5 → WSAStartup返回10107。0015对同线程、父子call_id、入口/返回配对及三DLL远端入口前16字节与磁盘身份逐项验证；诊断原件见attempts/a102d986…/events.jsonl和diagnosis.json。

这条链证明本次Winsock初始化的系统注册表读取被拒绝，不再只根据10107猜测。CORROBORATED：同一固定Node、零capability、只读profile/input/runtime/最小环境及Job下，调试与未调试失败的错误/退出一致。硬件调试会影响时序，不能把本轮诊断当作未调试隔离验收，不能从一台机器推广所有LPAC运行时。

实际架构仍为未发布合成launcher → 真实LPAC/Job → 固定Node；新observer仅新增DEBUG_ONLY_THIS_PROCESS、硬件寄存器及有界名称读取，不改代码字节、系统设置、SeDebugPrivilege或其他进程。完整public producer/consumer尚未实现，现有sf_safe_bash保持D18。问题归隔离Execution Producer的权限profile与运行时启动依赖，不是业务Executor或任务断言。

本轮三个Attempt均保留：0004原生观察48调用，只看到根键拒绝；0008新增WSA范围，确认该拒绝在WSAStartup内；0009只读PE导入解析指向A/W两种候选；0013实际A入口明确目标子键。三次Node均非零，不能因为诊断工具成功就把正例改为passed。所有源/二进制均运行前冻结，原始stdout/stderr和事件分别保存。

独立宿主0019确认本轮PID缺失、三个profile不存在；原始Job已active0。0020对原业务/治理事件/既有源码模板/部署156项比对仍一致，原提交f5fed085、代码权限撤销不变。0021只按路径/单链接/哈希核验删除三个自有Node副本，保留完整证据；没有读真实凭据、运行原WI、安装或重启daemon。

INSUFFICIENT_EVIDENCE：新增registryRead能否使该Node启动，是否仍隔离宿主用户注册表和其他资源。当前不能声称存在已验证的同合同修正，也不能把单capability称为单键白名单。

下一具体方案是registry-read-experiment-proposal.md / WINSOCK-REGISTRY-READ-EXPERIMENT-001，只拟增加一个registryRead capability、仅合成实验，不启用产品或业务。候选正式SPS/Registry完整字节及可应用检查通过的patch已准备在proposed-authority与registry-read-authority-delta.patch；它们尚未应用，正式权威哈希保持当前D20。产品采用还需完整实验/隔离矩阵和另行裁决。

停在需要新权限产品决定的位置。SPS §9.2.1 明确不授予注册表扩展capability，并要求更宽权限重新形成具体产品决定。用户“继续”已用于完成原授权内的诊断与可审阅方案，不将其解释为扩权批准；已有Candidate/分支决定不重问。失败、证据、现有WI状态和未验收项全部保留。

写入四类：TRUTH_SOURCE_WRITES=仅唯一project-status；REPOSITORY_TRACKED_WRITES=未发布诊断源码/README、经验/.gitattributes和本根；RUNTIME_OBSERVER_WRITES=本轮新建自有profile/副本/只读ACL及回收、硬件调试状态/调度，无现有系统/业务ACL更改；EXTERNAL_EVIDENCE_WRITES=本根原始回执、源码/二进制、只读分析及候选合同。旧封存根不改。
