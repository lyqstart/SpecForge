# Evidence 与审计

## 证据文件位置
`.specforge/work-items/<WI-ID>/`

## 必须存在的证据
- `evidence/evidence_manifest.json`
- `verification_report.md`
- `trace_delta.md`
- `changed_files_audit.json`
- `merge_report.md`

## changed_files_audit.json 结构
```json
{
  "status": "passed",
  "actual_changed_files": ["src/app.ts"],
  "violations": []
}
```

## 查看审计记录
```bash
cat .specforge/work-items/<WI-ID>/changed_files_audit.json
```
