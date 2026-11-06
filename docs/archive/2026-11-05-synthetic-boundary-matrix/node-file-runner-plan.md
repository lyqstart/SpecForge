# 固定文件与 Node 内置测试入口的同边界验证

继续同一CODEX_DIRECT/RUN与window03授权，仅合成。CONFIRMED：旧不带flags文件入口在realpath读取D盘父目录时EPERM，默认子进程pipe也失败；内联通过不能替代文件测试。责任在未发布执行producer的受支持命令归一化，不是业务代码。

HYPOTHESIS：固定Node24.19.0支持的--preserve-symlinks、--preserve-symlinks-main能使固定文件入口避免不必要的父目录realpath；--test-isolation=none可能允许内置test runner在同一LPAC进程运行，避免默认IPC管道。这不是增加权限。先加入两个不接调用者argv的固定合成模式，完整冻结源/二进制/模块与真实命令，再运行新UUID；失败原样封存。不得把带flags的新命令计作旧原命令成功。

唯一新建input内positive.cjs和fixed-module.cjs；固定node:test断言模块值和同目录实际读，实际写必须明确EACCES/EPERM。owner要求实际exit0、完整TAP恰好一项通过、marker、stderr空、正确token/Job和Job空；原有私有注册表只读guard、单registryRead、无文件写、32进程/1GiB/输出各1MiB、20s保持。输入和模块原始hash在启动前后核验。没有额外capability、父目录ACL变更、public Tool、部署或原WI执行。

四类写入同change-plan：TRUTH_SOURCE_WRITES=project-status；REPOSITORY_TRACKED_WRITES=未发布合成C#及freeze helper/经验；RUNTIME_OBSERVER_WRITES=新owned profile/Job/input/runtime与清理；EXTERNAL_EVIDENCE_WRITES=本根新命令、构建、原始Attempt。不预设结果，不声称完整矩阵或产品采用。
