---
artifact: candidate_tasks
work_item_id: WI-0002
module_id: CORE
snapshot_id: sha256:ea0d3796eb9488dbc86462c62abe9f07631d92224177474dfd99a4bdd8ef1f17
implementation_baseline_id: sha256:ea0d3796eb9488dbc86462c62abe9f07631d92224177474dfd99a4bdd8ef1f17
base_spec_version: PSV-0002
workflow_type: feature_spec
workflow_path: requirement_change_path
test_identifier: SF-SIX-ACCEPTANCE-20261024
generated_by: sf-task-planner
artifact_contract: task-document/v1
---

# Tasks Candidate — 极简待办清单·功能补齐（WI-0002 / CORE）

| 元数据 | 值 |
|---|---|
| work_item_id | WI-0002 |
| module_id | CORE |
| 基线事实 | 四个计划路径均为 WI-0001 合并后的既有正式实现（非 greenfield，全部任务为「修改」而非「新建」） |
| 证据边界 | 层级 A = Node v24.19.0 node:test（模拟 DOM/localStorage）；层级 B（真实浏览器/剪贴板）全部 NOT_RUN，任何任务不得声称浏览器/剪贴板已测 |
| 写入范围 | 恒定四文件：index.html / app.js / styles.css / test/app.test.js（= impact_scope.planned_code_paths；protected-marker.txt 与 .specforge/** 永不进入） |
| 执行说明 | 全部实现任务共享 app.js，任务间为串行链（见各任务依赖声明）；无并行批次重叠 |

## 自问自答验收清单（Step 3 预检）

1. 每个 DD 都有 task 覆盖吗？——是：DD-009→T002、DD-010→T001、DD-011→T003、DD-012→T004、DD-013/014→T005、DD-015→T006、DD-016→T007、DD-017→T008；演进 DD-001/003/004/005/007/008 由 T001/T002/T006/T007/T008 承接其演进增量与既有承接面回归。
2. context_block 充分吗？——是：每任务含 What/Why/Refs/Current Implementation/Constraints/Done When（Code/Behavior/Evidence 三层）。
3. verification_commands 真能机器跑吗？——是：全部为 `node --test` / `node -e`（退出码判定），仅依赖 Node v24.19.0 与项目自身命令。
4. 并行批次独立吗？——本候选无并行批次（app.js 串行链），无文件重叠风险。
5. 共享代码先建吗？——是：Task v2 结构/归一化/日期校验（T001）先行，后续任务依赖。
6. allowed_write_files 具体且被 Impact Scope 覆盖？——是：全部为四文件之一，唯一 Module owner=CORE。
7. 集成闭环任务存在吗？——是：T008 为 Integration Closure Task（全量测试 + 结构契约对齐 + round-trip 链路）。

---

### TASK-WI-0002-001 Task v2 数据模型扩展与加载迁移归一

**context_block**（executor 必读）：
- **What**: 在 app.js 中将 Task 实体从 {id,text,done} 扩展为六字段 v2 结构 {id,text,done,category,priority,dueDate}；实现字段默认值/校验规则（category trim 空→「未分类」；priority 缺省/枚举外→medium；dueDate 空→null、非法→null 防御归一）；扩展 loadTasks 为「读取→条目级判定→归一」：核心三元组非法→整体降级空清单（不覆写原值，语义不变），新字段缺失/非法→按默认值补全（惰性内存归一，不做启动写回）；提供 `isValidDueDate(s)` 严格 YYYY-MM-DD 真实日历日期校验（含闰年），供提交与导入路径复用。存储键沿用 todo.tasks.v1（不升版，DATA-CORE-009）。
- **Why**: 实现 REQ-CORE-014/015（AC-049~054）的数据基础；落实 DATA-CORE-006/007/009 与 DD-CORE-010。
- **Refs（含治理依据）**: [REQ-CORE-014, REQ-CORE-015, DD-CORE-010, DD-CORE-001（演进）, DATA-CORE-006, DATA-CORE-007, DATA-CORE-009, MCONTRACT-CORE-003]
- **Current Implementation**（依据：实现基线 frontmatter 绑定 + 代码一手复核，CODE_OBSERVED）：app.js 既有 STORAGE_KEY 常量、generateId、isValidTask（{id,text,done} 校验）、loadTasks/saveTasks（单键全量覆盖写、损坏降级不覆写）、UMD createApp 工厂。本任务在既有函数原位扩展，不改变其调用契约。
- **Constraints**:
  - 不引入新依赖/新存储键/迁移脚本；迁移惰性（归一仅在内存，写回落盘由下一次变更操作的全量覆盖写自然完成，AC-054）
  - 迁移中 id/text/done 原值逐字段不变（AC-053）
  - 损坏降级语义（非 JSON/非数组/核心三元组非法→空清单不覆写）保持不变
  - 遵守 project-rules（TODO 占位，无额外约束）；风格匹配相邻代码
- **Done When**:
  - Done When Code: app.js 含 v2 归一化逻辑与 isValidDueDate；loadTasks 返回六字段结构
  - Done When Behavior: 旧 {id,text,done} 负载加载后补全 category=「未分类」/priority=medium/dueDate=null 且原值不变；损坏负载仍降级不覆写
  - Done When Evidence: `node --test test/` 既有用例（AC-001~023）全部通过（回归零破坏）；结构检查命令退出码 0
- **expected_file_changes**: [app.js]
- **依赖**: 无
- **refs**: [REQ-CORE-014, REQ-CORE-015, DD-CORE-010, DD-CORE-001]
- **allowed_write_files**: [app.js]
- **forbidden_files**: [index.html, styles.css, test/app.test.js, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - regression:
    - `node --test test/`
  - unit:
    - `node -e "const fs=require('fs');const s=fs.readFileSync('app.js','utf8');process.exit(s.includes('isValidDueDate')&&s.includes('todo.tasks.v1')?0:1)"`
- **verification_evidence_expected**:
  - {"command":"node --test test/","expected_exit_code":0,"expected_output_pattern":"pass","evidence_type":"test_output"}
  - {"command":"node -e 结构检查","expected_exit_code":0,"evidence_type":"content_check"}
- **out_of_scope**: 备份信封结构（T005）、筛选/统计派生（T003/T004）、UI 控件（T006）、测试用例编写（T008）

### TASK-WI-0002-002 字段输入校验与 addTask 属性扩展

**context_block**（executor 必读）：
- **What**: 扩展 `addTask(rawText, attrs?)`：attrs={category?,priority?,dueDate?}；text trim 空白拒绝逻辑不变（返回 false 且零状态变化，含三新字段原始值不产生数据效果）；category 按 DATA-CORE-006 提交列归一；priority 缺省 medium、UI select 下游保证+数据层防御归一双保险；dueDate 空→null、非法格式→拒绝该值（该字段按 null 入库，任务照常创建，AC-031 裁定落地）；新任务 push 完整六字段结构并走既有 saveTasks 全量写回。
- **Why**: 实现 REQ-CORE-007/008/009（AC-024~032）与 DD-CORE-009；同时是 DD-CORE-001 演进的落点。
- **Refs（含治理依据）**: [REQ-CORE-007, REQ-CORE-008, REQ-CORE-009, DD-CORE-009, DD-CORE-001（演进）, DATA-CORE-006, MCONTRACT-CORE-002, MCONTRACT-CORE-007]
- **Current Implementation**: app.js 既有 addTask(rawText) 单参签名（trim→校验→push→save→render）；本任务增可选第二参，既有单参调用兼容（默认值路径=AC-024/027/030）。
- **Constraints**: 空白 text 拒绝时三新字段原始值不产生任何数据效果（MCONTRACT-CORE-002 扩展效力）；不引入分类字典/枚举外优先级；不强制 dueDate 必填。
- **Done When**:
  - Done When Code: addTask 双参签名与逐字段归一逻辑存在
  - Done When Behavior: 未填/空白/非法/合法四类输入路径全部按 AC-024~032 语义落地
  - Done When Evidence: `node --test test/` 回归通过；签名结构检查退出码 0
- **expected_file_changes**: [app.js]
- **依赖**: TASK-WI-0002-001（v2 结构与 isValidDueDate 先行）
- **refs**: [REQ-CORE-007, REQ-CORE-008, REQ-CORE-009, DD-CORE-009, DD-CORE-001, CP-CORE-008]
- **allowed_write_files**: [app.js]
- **forbidden_files**: [index.html, styles.css, test/app.test.js, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - regression:
    - `node --test test/`
  - unit:
    - `node -e "const fs=require('fs');const s=fs.readFileSync('app.js','utf8');process.exit(/addTask\s*\(\s*rawText\s*,\s*attrs/.test(s)?0:1)"`
- **verification_evidence_expected**:
  - {"command":"node --test test/","expected_exit_code":0,"evidence_type":"test_output"}
  - {"command":"node -e 签名检查","expected_exit_code":0,"evidence_type":"content_check"}
- **out_of_scope**: 表单控件采集（T006）、测试用例（T008）

### TASK-WI-0002-003 组合筛选纯函数 filterTasks

**context_block**（executor 必读）：
- **What**: 在 app.js 新增导出纯函数 `filterTasks(tasks, criteria)`，criteria={searchTerm,category,status}：searchTerm trim 空→不限制，否则 text.toLowerCase().includes(term.toLowerCase())；category==="全部"→不限制，否则严格等于；status==="全部"→不限制、"待完成"→done=false、"已完成"→done=true；三条件 AND；结果保序子序列；绝不修改输入数组与条目（CP-CORE-011）。
- **Why**: 实现 REQ-CORE-010/011（AC-033~040）与 DD-CORE-011。
- **Refs（含治理依据）**: [REQ-CORE-010, REQ-CORE-011, DD-CORE-011, MCONTRACT-CORE-006（演进版）]
- **Current Implementation**: app.js 现无筛选逻辑（renderTasks 直接消费 tasks）；本任务新增独立纯函数，不改动既有渲染路径（接入由 T006/T007 完成）。
- **Constraints**: 纯函数无副作用、不触碰 storage；空结果为合法状态（AC-040）；不维护分类字典（候选由渲染层派生，T006）。
- **Done When**:
  - Done When Code: filterTasks 函数存在且被模块导出（UMD 面）
  - Done When Behavior: 单条件/两两/三条件 AND/空态/空结果矩阵语义成立
  - Done When Evidence: `node -e` 直接调用断言三条件组合与输入不被修改（退出码 0）；回归通过
- **expected_file_changes**: [app.js]
- **依赖**: TASK-WI-0002-001（Task v2 结构）
- **refs**: [REQ-CORE-010, REQ-CORE-011, DD-CORE-011, CP-CORE-011]
- **allowed_write_files**: [app.js]
- **forbidden_files**: [index.html, styles.css, test/app.test.js, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - unit:
    - `node -e "const m=require('./app.js');const t=[{id:'1',text:'Buy Milk',done:false,category:'未分类',priority:'medium',dueDate:null}];const r=m.filterTasks(t,{searchTerm:'milk',category:'未分类',status:'待完成'});process.exit(r.length===1&&t[0].text==='Buy Milk'?0:1)"`
  - regression:
    - `node --test test/`
- **verification_evidence_expected**:
  - {"command":"node -e filterTasks 断言","expected_exit_code":0,"evidence_type":"unit_assert"}
- **out_of_scope**: 筛选 UI 控件与事件绑定（T006）、createApp.setFilters（T007）、测试用例（T008）

### TASK-WI-0002-004 统计派生 getStats 与参数化 today 逾期计算

**context_block**（executor 必读）：
- **What**: 在 app.js 新增导出纯函数 `getStats(tasks, today)`：total=tasks.length；pending/completed 按 done 计数；overdue=满足 (dueDate!==null && dueDate<today && done===false) 计数（YYYY-MM-DD 字典序=时间序）；total=pending+completed 恒成立（CP-CORE-010）。createApp options 增可选 `today?: () => string`（缺省=本地 new Date() 的 YYYY-MM-DD）——实现层可测性参数，非新业务行为（FACT-20）。
- **Why**: 实现 REQ-CORE-012/013（AC-041~048）与 DD-CORE-012。
- **Refs（含治理依据）**: [REQ-CORE-012, REQ-CORE-013, DD-CORE-012, DATA-CORE-006, MCONTRACT-CORE-007]
- **Current Implementation**: app.js 现无统计逻辑；createApp({document,storage}) 双依赖注入不变，today 为同工厂第三可选项。
- **Constraints**: 统计输入恒为全部任务集合（澄清决策 E）；done=true 永不逾期、无 dueDate 不参与、dueDate=当天不算逾期（AC-046~048）；不引入 Date 库。
- **Done When**:
  - Done When Code: getStats 导出存在；createApp options 含可选 today
  - Done When Behavior: 注入固定 today 下逾期三态×done 双态计数正确
  - Done When Evidence: `node -e` 断言早于/等于/晚于 today×done 组合与算术不变式（退出码 0）；回归通过
- **expected_file_changes**: [app.js]
- **依赖**: TASK-WI-0002-001（v2 结构）
- **refs**: [REQ-CORE-012, REQ-CORE-013, DD-CORE-012, CP-CORE-010]
- **allowed_write_files**: [app.js]
- **forbidden_files**: [index.html, styles.css, test/app.test.js, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - unit:
    - `node -e "const m=require('./app.js');const mk=(d,done)=>({id:d||'x',text:'t',done,category:'未分类',priority:'medium',dueDate:d});const s=m.getStats([mk('2026-01-01',false),mk('2026-01-02',true),mk(null,false)],'2026-01-02');process.exit(s.total===3&&s.pending===2&&s.completed===1&&s.overdue===1?0:1)"`
  - regression:
    - `node --test test/`
- **verification_evidence_expected**:
  - {"command":"node -e getStats 断言","expected_exit_code":0,"evidence_type":"unit_assert"}
- **out_of_scope**: #stats 呈现（T006）、AppController.getStats 成员（T007）、测试用例（T008）

### TASK-WI-0002-005 备份导出序列化与导入校验零变化拒绝

**context_block**（executor 必读）：
- **What**: 在 app.js 实现备份层：信封序列化函数（按 DATA-CORE-008：{format:"todo-backup",version:1,exportedAt,tasks} 的 JSON.stringify）；`importBackup(text?)` 流程=读 textarea 值（缺省参）→JSON.parse（抛错→拒绝）→信封校验（format==="todo-backup"、version===1、tasks 为数组）→逐条**严格**校验（id 非空 string、text trim≥1、done boolean、category 合法 string、priority∈{high,medium,low}、dueDate null 或合法 YYYY-MM-DD——不适用默认值补全）→任一不通过→返回 false+可感知提示+集合/存储/呈现/统计零变化；全部通过→tasks=信封.tasks（整体替换）→saveTasks→renderTasks→更新统计，返回 true。空集合导出合法空信封（AC-057）。round-trip 沿用原 id（DATA-CORE-003）。
- **Why**: 实现 REQ-CORE-016/017（AC-055~061）与 DD-CORE-013/014。
- **Refs（含治理依据）**: [REQ-CORE-016, REQ-CORE-017, DD-CORE-013, DD-CORE-014, DATA-CORE-008, MCONTRACT-CORE-003, MCONTRACT-CORE-007]
- **Current Implementation**: app.js 现无备份功能；textarea 写入/读取接线由 T006/T007 完成，核心序列化与校验逻辑本任务完成。
- **Constraints**: 不做文件下载/上传、不调用剪贴板 API（Non-goal #14）；导入校验比加载迁移严格；拒绝路径不抛未处理错误、存储逐字段零变化（AC-059）。
- **Done When**:
  - Done When Code: 信封序列化与导入校验/整体替换逻辑存在
  - Done When Behavior: 合法导入整体替换并持久化；非法（解析失败/信封不符/字段非法）拒绝后集合与存储零变化
  - Done When Evidence: 备份面存在性检查退出码 0；回归通过（最终行为断言由 T008 用例覆盖 AC-055~061）
- **expected_file_changes**: [app.js]
- **依赖**: TASK-WI-0002-001（v2 结构与 isValidDueDate）
- **refs**: [REQ-CORE-016, REQ-CORE-017, DD-CORE-013, DD-CORE-014, CP-CORE-012]
- **allowed_write_files**: [app.js]
- **forbidden_files**: [index.html, styles.css, test/app.test.js, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - unit:
    - `node -e "const m=require('./app.js');process.exit(typeof m.exportBackup==='function'||typeof m.buildBackupText==='function'?0:1)"`
  - regression:
    - `node --test test/`
- **verification_evidence_expected**:
  - {"command":"node -e 备份面存在性断言","expected_exit_code":0,"evidence_type":"content_check"}
- **out_of_scope**: textarea/按钮控件与事件绑定（T006/T007）、测试用例（T008）

### TASK-WI-0002-006 UI 结构与渲染扩展（index.html + styles.css + app.js）

**context_block**（executor 必读）：
- **What**: index.html 新增静态声明控件（功能锚点 id）：`#search-input`（input 事件）、`#category-filter`（select，change）、`#status-filter`（select：全部/待完成/已完成）、`#stats`（四项计数呈现节点）、`#export-btn`、`#backup-text`（textarea）、`#import-btn`、表单内 `#category-input`、`#priority-input`（select 高/中/低，默认中）、`#due-date-input`；script 尾部加载、无内联业务逻辑保持。styles.css 为新控件提供极简可用样式（不设样式验收标准）。app.js 渲染扩展：任务条目在既有 li.task-item[data-id] 基础上以 textContent 语义追加分类/优先级/截止日期文本节点（无 HTML 拼接）；列表渲染输入改为 filterTasks 派生结果；#stats 四项文本更新；分类筛选 options 每次集合变更后由「全部+去重分类（含未分类，按首次出现序）」重建，当前选择在候选仍存在时保持；筛选事件只重渲染派生视图不写存储（AC-035/039）、统计仅由集合变更触发重算（AC-044）；表单提交采集三新字段原始值传给 addTask。
- **Why**: 实现 DD-CORE-015 与 DD-CORE-003/005 演进（渲染输入与控件面扩展）。
- **Refs（含治理依据）**: [REQ-CORE-007, REQ-CORE-008, REQ-CORE-009, REQ-CORE-010, REQ-CORE-011, REQ-CORE-012, REQ-CORE-016, REQ-CORE-017, DD-CORE-015, DD-CORE-003（演进）, DD-CORE-005（演进）, MCONTRACT-CORE-006（演进版）, MCONTRACT-CORE-007]
- **Current Implementation**: index.html 既有 form#task-form>input#task-input+ul#task-list；app.js renderTasks/buildTaskElement 全量重渲染+事件委托+textContent 插入；全部保持并在其上扩展（修改，非新建）。
- **Constraints**: 控件 HTML 形态为实现自由度（锚点 id 为契约）；逾期视觉提示为样式自由度非验收项；控件缺失防御式 no-op；不引入框架/构建。
- **Done When**:
  - Done When Code: index.html 含 10 个锚点 id；app.js 渲染输入接 filterTasks 并绑定筛选/导出/导入事件
  - Done When Behavior: 模拟 DOM 下筛选变化只改视图不改存储；条目呈现六字段；统计节点随集合变更更新
  - Done When Evidence: 锚点 id 检查命令退出码 0；`node --test test/` 回归通过
- **expected_file_changes**: [index.html, styles.css, app.js]
- **依赖**: TASK-WI-0002-003（filterTasks）、TASK-WI-0002-005（备份函数）
- **refs**: [REQ-CORE-007, REQ-CORE-008, REQ-CORE-009, REQ-CORE-010, REQ-CORE-011, REQ-CORE-012, REQ-CORE-016, REQ-CORE-017, DD-CORE-015, DD-CORE-003, DD-CORE-005]
- **allowed_write_files**: [index.html, styles.css, app.js]
- **forbidden_files**: [test/app.test.js, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - integration:
    - `node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const ids=['search-input','category-filter','status-filter','stats','export-btn','backup-text','import-btn','category-input','priority-input','due-date-input'];process.exit(ids.every(i=>h.includes('id=\"'+i+'\"'))?0:1)"`
  - regression:
    - `node --test test/`
- **verification_evidence_expected**:
  - {"command":"node -e 锚点 id 检查","expected_exit_code":0,"evidence_type":"content_check"}
- **out_of_scope**: AppController 新成员导出（T007）、测试用例（T008）

### TASK-WI-0002-007 createApp 行为面扩展与写路径统一

**context_block**（executor 必读）：
- **What**: createApp 返回面扩展为 {addTask, toggleTask, removeTask, setFilters, getStats, exportBackup, importBackup, init}：既有四成员签名兼容（addTask 增可选第二参）；setFilters(criteria) 更新内部 filters 并只重渲染派生视图（不写存储）；getStats() 以内部 today 源（可注入）计算；所有改变集合路径（add/toggle/remove/import）统一走「变更→save→render→stats」序列（AC-022 对扩展操作成立）；init 绑定全部控件事件（含三筛选事件与导出/导入）；options={document,storage,today?}。
- **Why**: 实现 DD-CORE-016 与 DD-CORE-004 演进（操作类型扩展+统计步骤）；MCONTRACT-CORE-007 行为面聚合落点。
- **Refs（含治理依据）**: [REQ-CORE-006, REQ-CORE-017, DD-CORE-016, DD-CORE-004（演进）, MCONTRACT-CORE-007, MCONTRACT-CORE-001]
- **Current Implementation**: app.js 既有 createApp 返回 {addTask,toggleTask,removeTask,init}；本任务原位扩展，浏览器入口调用不变。
- **Constraints**: 写路径唯一（saveTasks 单点，MCONTRACT-CORE-001）；setFilters/筛选事件绝不触发 save；未知 id no-op 保持；不新增适配器类别。
- **Done When**:
  - Done When Code: AppController 八成员齐备
  - Done When Behavior: 模拟 DOM+storage 下 setFilters 不写存储；import 成功路径走统一写序列；AC-022 对导入成立
  - Done When Evidence: `node -e` 断言八成员存在（退出码 0）；回归通过
- **expected_file_changes**: [app.js]
- **依赖**: TASK-WI-0002-002, TASK-WI-0002-003, TASK-WI-0002-004, TASK-WI-0002-005, TASK-WI-0002-006
- **refs**: [REQ-CORE-006, REQ-CORE-017, DD-CORE-016, DD-CORE-004]
- **allowed_write_files**: [app.js]
- **forbidden_files**: [index.html, styles.css, test/app.test.js, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - unit:
    - `node -e "const m=require('./app.js');const app=m.createApp({document:{getElementById:()=>null,addEventListener:()=>{}},storage:{getItem:()=>null,setItem:()=>{}},today:()=>'2026-10-24'});const need=['addTask','toggleTask','removeTask','setFilters','getStats','exportBackup','importBackup','init'];process.exit(need.every(k=>typeof app[k]==='function')?0:1)"`
  - regression:
    - `node --test test/`
- **verification_evidence_expected**:
  - {"command":"node -e 八成员断言","expected_exit_code":0,"evidence_type":"unit_assert"}
- **out_of_scope**: 测试用例（T008）

### TASK-WI-0002-008 测试扩展与全量回归（Integration Closure Task）

**context_block**（executor 必读）：
- **What**: 扩展 test/app.test.js（node:test + node:assert，沿用既有最小 DOM/localStorage shim，按需最小扩展 select/textarea/input 事件与 value 支持，仅覆盖 app.js 实际消费面）：(1) 新增 AC 层级 A 用例：AC-024~061 按 REQ 分组——字段三态输入（未填/空白/非法/合法，CP-CORE-008）、filterTasks 组合矩阵（单条件/两两/三条件 AND/空态/空结果+输入不被修改，CP-CORE-011）、getStats 注入 today 逾期三态×done 双态与算术不变式（CP-CORE-010）、迁移场景（预置旧负载→加载断言补全与原值不变→触发写操作断言完整结构写回，CP-CORE-009）、导出文本结构断言与空集合信封（AC-057）、导入合法/非法/round-trip（AC-061）/拒绝后存储零变化（CP-CORE-012）、筛选激活时统计不变（AC-044）、刷新等价模拟扩展至新字段（AC-049，等价性注明）、today 注入与「用户本地当天」等价性在测试记录注明（澄清决策 F）；(2) 既有 B1–B5（AC-001~023）与数据契约（键名/结构/损坏降级，CP-CORE-001~007）用例**全量保留并通过**（回归）；(3) 集成闭环检查：`node --test test/` 全量绿 + 四文件存在 + index.html 锚点 id ↔ app.js 消费对齐。
- **Why**: 实现 DD-CORE-017；作为 Integration Closure 验证多任务交付真实接通（EVREQ-001~017-A 层级 A 汇总证据）。
- **Refs（含治理依据）**: [REQ-CORE-001~017（回归+新增）, DD-CORE-017, DD-CORE-008（演进）, FACT-07, FACT-08]
- **Current Implementation**: test/app.test.js 为 WI-0001 既有用例（AC-001~023 + CP-CORE-001~007），全部保留不改语义（仅允许 shim 最小扩展）；本任务为追加（修改，非新建）。
- **Constraints**: 剪贴板行为不做断言且不声称已测；层级 B 全部 NOT_RUN；不得为测试扩展业务功能；测试文件仅 test/app.test.js 一个。
- **Done When**:
  - Done When Code: test/app.test.js 含 AC-024~061 新用例与全部回归用例
  - Done When Behavior: Node v24.19.0 下 `node --test test/` 全量通过（23 既有 AC + 38 新 AC + CP-CORE-001~012）
  - Done When Evidence: 全量测试退出码 0、用例计数下限断言通过；作为 EVREQ-001~017-A 层级 A 汇总证据
- **expected_file_changes**: [test/app.test.js]
- **依赖**: TASK-WI-0002-001, TASK-WI-0002-002, TASK-WI-0002-003, TASK-WI-0002-004, TASK-WI-0002-005, TASK-WI-0002-006, TASK-WI-0002-007
- **refs**: [REQ-CORE-001, REQ-CORE-002, REQ-CORE-003, REQ-CORE-004, REQ-CORE-005, REQ-CORE-006, REQ-CORE-007, REQ-CORE-008, REQ-CORE-009, REQ-CORE-010, REQ-CORE-011, REQ-CORE-012, REQ-CORE-013, REQ-CORE-014, REQ-CORE-015, REQ-CORE-016, REQ-CORE-017, DD-CORE-017, DD-CORE-008, CP-CORE-008, CP-CORE-009, CP-CORE-010, CP-CORE-011, CP-CORE-012]
- **allowed_write_files**: [test/app.test.js]
- **forbidden_files**: [index.html, app.js, styles.css, protected-marker.txt, .specforge/**]
- **verification_commands**:
  - integration:
    - `node --test test/`
  - property:
    - `node -e "const fs=require('fs');const s=fs.readFileSync('test/app.test.js','utf8');process.exit((s.match(/test\(/g)||[]).length>=60?0:1)"`
- **verification_evidence_expected**:
  - {"command":"node --test test/","expected_exit_code":0,"expected_output_pattern":"pass","evidence_type":"test_output"}
  - {"command":"node -e 用例数下限断言","expected_exit_code":0,"evidence_type":"content_check"}
- **out_of_scope**: 任何业务代码修改、层级 B 浏览器执行（NOT_RUN 边界）

## 任务依赖总览

```
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008
（串行链：app.js 为共享写文件；T006 另写 index.html/styles.css；T008 只写 test/app.test.js）
```

- tasks_count: 8
- parallel_batches: 0（全串行，app.js 共享写文件）
- serial_tasks: 8
- all_tasks_have_context_block: true
- all_tasks_have_verification: true（每任务至少一条类型化命令，T008 为集成闭环）
