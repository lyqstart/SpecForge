# 固定外部TCP与UNC合成检查

沿用A01/A03与D21：普通用户、恰好registryRead、无网络/COM能力、只读LPAC和32进程/1GiB/20s/各1MiB；不运行COM失败探针，不改已有系统/业务ACL或共享设置。

本机只读取证已确认普通用户可经\\localhost\D$读取已批准自有夹具固定文件，原始工具回执exit0。新Attempt只使用自己的input/fixture.txt和shadow-home/fake-credentials.txt，经同一UNC路径分别读取并以ReadWrite方式打开后立即关闭（无字节写入），取得真实宿主读写访问正控制；运行后重新读取、打开并比较原始SHA。LPAC父/子/孙逐项尝试该两条路径的读和覆盖写，必须明确EACCES/EPERM，不能以路径不存在或其他异常计通过。新夹具的普通路径原始字节与ACL同时复核。

外部TCP目标固定1.1.1.1:443，仅连接后关闭，不发送应用数据、查询或凭据。普通用户宿主在guest前后以2s超时建立TCP连接，均须真实成功；LPAC父/子/孙以同IP/端口尝试，必须明确EACCES/EPERM，超时、无路由、服务失败或未知不算拒绝。只证明该外部端点与本轮固定协议，不夸大为所有协议穷尽证明；另保留已有自有loopback监听前后对照。

可信owner冻结脚本/输入/二进制、实测token/Job、宿主独立哨兵与清理；原始stdout/stderr与退出码不可信自述不能单独通过。每个新Attempt保留完整证据。失败先归因，不改权限。

四类写入：TRUTH_SOURCE_WRITES=NONE；REPOSITORY_TRACKED_WRITES=未发布合成helper/模式及其ERR；RUNTIME_OBSERVER_WRITES=唯一新owned输入/profile/Job、临时TCP socket及清理；EXTERNAL_EVIDENCE_WRITES=新构建/回执/原始结果。无业务/public Tool/部署。

0124的UNKNOWN先保持失败。新增固定helper的--unc-only在每个Node角色调用同四次CreateFileW(OPEN_EXISTING)，记录原始Win32返回、真实PID和角色；宿主同一helper--host-unc-control先取得全0正控制。Node仅为收集完整诊断允许UNKNOWN行继续派生后代，最后仍设exit42、owner仍拒绝UNKNOWN；不在本轮把UNKNOWN改为权限拒绝。明确底层错误取得后再单独冻结精确规则。

后续精确消费规则（0130、0137、0138之后冻结）：宿主全0，guest真实四操作均Win32 ERROR_NETWORK_ACCESS_DENIED/65；0138三个helper实际退出0、无stderr，Node诊断仍42。新规则不把UNKNOWN本身当拒绝，而是要求每角色独立原生报告四操作、确切5/65/1260、opened=false、角色0/1/2及三个不同实际PID都在broker已核验集合；所有helper实际exit0且无signal/error；缺失、重复、未知错误或状态均拒绝。Node UNKNOWN行仅在该native0控制后标记native_confirmation_required，由owner重新检验。增加helper700ms可观测窗口、UNC父子等待12s，仍在总20s及原其他预算内。

接口错误依据：https://learn.microsoft.com/en-us/windows/win32/debug/system-error-codes--0-499- 。0130/0138旧失败不改写，正常新执行必须另建Attempt。
