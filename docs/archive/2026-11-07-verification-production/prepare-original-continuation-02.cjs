const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=fs.readFileSync(path.join(__dirname,'original-verification-prompt.txt'),'utf8');assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname,'original-verification-run-01/original-authoritative-state-after.json'))).current_state,'implementation_running');
const prompt=base+`

本次最小上下文恢复的新增事实（不导入任何旧消息）：上一轮真实工具调用已定位为动作参数混传，而非LPAC应用能力失败。sf_verification_run的prepare恰好传{"action":"prepare","work_item_id":"WI-0001","plan_id":"<id>"}；run恰好传{"action":"run","work_item_id":"WI-0001","attempt_record_id":"<id>"}。run/cancel/recover必须省略plan_id；prepare返回的attempt_id不是run参数。把完整两条JSON示例及禁止混传规则明确交给每位Verifier。额外字段被严格Schema拒绝时不能重建整批计划，不放宽Runtime或改Task；先核对实际调用参数和原Attempt的新鲜度/一次性消费边界。遇到同类意外拒绝停止该批并返回原错误，不循环重派。

Task001 unit command_index=0已由真实sf-verifier正确参数执行，owner返回receipt_id=ec2d84148c29a89b8053897a378f1c7bbbfce17b4003d29e0050f47c1922ab27，plan_id=e5aee7af74e3cd0c3f390964b758e1523fd811330b55504e57c12b79f1d26acd，attempt_record_id=34b3ee953b87904695b2e5050edfd7b3f8d0e0a87d7a989264c7c346366dd40d，目的implementation，exit_code=0、cleanup_proved=true、output_complete=true。这是已存在真实执行事实，后续产物仍须经正式共同消费者验真；不要仅为重复成功步骤再执行它。其余Task001 unit index1..4的旧prepare尚无成功执行回执，旧参数拒绝和Verifier handoff保留。依据当前owner/有效期选择合法恢复或重新计划；不可把旧prepared当passed。

上一轮提供方曾短暂限流后恢复；不要扩大并发或切换提供方。每批先取得少量计划并交给真实Verifier依序执行。若需要记录实施证据，先核对产物ownership/Schema；不得让Verifier写自己不拥有的文件，也不得改封存Task来补完成标记。原状态仍implementation_running，代码写许可撤销不变。此前已停止的新会话不读取消息历史；只读取同一WI必要正式治理记录。继续原任务直到合法停点。
`;
fs.writeFileSync(path.join(__dirname,'original-verification-prompt-02.txt'),prompt,{flag:'wx'});console.log(JSON.stringify({prompt_file:'original-verification-prompt-02.txt',history_loaded:false,prior_passed_receipt_referenced:true}));
