# 恢复与回滚

## Daemon 不可达
- 写入自动被阻断（fail-closed）
- 重启 daemon：`npx specforge daemon start`
- 客户端自动重连

## Work Item 异常
- 检查：`.specforge/work-items/<WI-ID>/work_item.json`
- 查看状态日志

## 安装损坏
- 重新执行：`npx sf-installer install --force`
- 不会影响项目数据（只更新 sf-user 目录）
