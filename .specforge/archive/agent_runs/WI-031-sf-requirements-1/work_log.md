## WI-031 impact_analysis 阶段

**Agent**: sf-requirements
**任务**: 分析 daemon 存储架构重构 + 事件处理实现的变更影响范围
**产物**: impact_analysis.md

### 关键发现
1. ALL_STATES 当前已完备，建议调整方向
2. 路径硬编码是 A 层主要风险面
3. WI-001:task:27 存在潜在冲突
4. 推荐实施顺序：先 A 后 B
