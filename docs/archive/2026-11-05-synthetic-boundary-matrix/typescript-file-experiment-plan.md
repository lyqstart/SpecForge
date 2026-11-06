# 单进程 TypeScript/ESM 文件探针

在现有同权限合成范围内，验证固定Node24.19的原生类型擦除、ESM本地import与node:test；不读取或运行原项目代码。本轮新固定输入：package.json(type=module)、positive.mts、fixed-module.mts（一个number类型导出常量42）。唯一测试验证导出值、模块原字节和实际写拒绝。单进程child policy=1、Job1、DETACHED、--test-isolation=none、相对文件pattern及preserve-symlinks/TAP沿用已验证配置。所有三个输入启动前后逐字节/hash核验；原始flags显式入证据。成功也不能宣称原WI或旧多进程矩阵通过，命令语义合法性仍须原owner/共同consumer检验。

当前Windows原生probe实际报告的367来自微软SDK原始winerror.h定义ERROR_CHILD_PROCESS_BLOCKED；5为ACCESS_DENIED。宿主0253同helper实际child0/AllocConsole成功并释放，guest0254实际policy1/child367/breakaway5/console367未分配、exit0/Job空/profile0。判据不接受未知错误；新回归绑定真实PID和这些原始输出。源码：https://raw.githubusercontent.com/microsoft/win32metadata/main/generation/WinSDK/RecompiledIdlHeaders/shared/winerror.h 。

证据载体的journal自此只在command_finished保存完整原始result.json的SHA256引用；命令、UTC、数字退出、四类写入仍保留，before/after完整Git状态在每条不可覆盖result.json内。防止同一庞大Git清单重复进入journal，既有journal字节不重写、不截断。此为证据存储去重，不降低覆盖或改变规则/停点。
