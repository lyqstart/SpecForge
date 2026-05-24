# 项目工程规则 — Go

<!-- 继承 _BASE.md 的 R1-R8，本文件只写 Go 特有规则 -->

---

## 版本兼容（覆盖 R3）

```yaml
go_target:
  min_version: "[来自 prod-environment.md 的 go_min]"
  # 如何决策：
  #   - Go 1.18：引入泛型，最低推荐
  #   - Go 1.21：内置 slog（结构化日志），推荐新项目
  #   - Go 1.22：range over integers，当前主流
  # Go 向后兼容性极好，通常直接用最新稳定版
```

---

## 依赖管理（覆盖 R2）

**规则**：
1. 使用 Go Modules（`go.mod` + `go.sum`），两个文件都必须提交
2. 不得使用 `replace` 指令指向本地路径（除非是 monorepo 内部）
3. 定期运行 `go mod tidy` 清理未使用的依赖

---

## 风格规则（覆盖 R5）

```yaml
style:
  formatter: gofmt                # Go 官方格式化工具，不可配置
  linter: golangci-lint           # 推荐：golangci-lint（集成多个 linter）
  # Go 有强制风格，争议极少：
  # - 缩进用 tab（不是空格）
  # - 大括号不换行
  # - 导出名用 PascalCase，非导出用 camelCase
```

---

## 错误处理（覆盖 R7）

**Go 特有规则**：
1. 不得忽略 error 返回值（`_ = someFunc()` 必须有注释说明为什么可以忽略）
2. 错误信息用小写，不加标点（Go 惯例）
3. 使用 `fmt.Errorf("context: %w", err)` 包装错误，保留调用链
4. 不得在 goroutine 中 panic 而不 recover

---

## 日志规范（覆盖 R8）

**规则**：
1. Go 1.21+ 项目使用标准库 `log/slog`（结构化日志）
2. 老项目使用 `zap`（高性能）或 `zerolog`
3. 不得用 `fmt.Println` 在生产代码中输出

---

## 测试

```yaml
test_framework: testing           # Go 内置测试框架
test_command: "go test ./..."
coverage_command: "go test -cover ./..."
pbt_library: rapid                # 属性测试库（可选）
                                  # 推荐：gopter 或 rapid
```

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.gitignore` 建议添加**：
   ```
   # 编译产物
   *.exe
   *.exe~
   *.dll
   *.so
   *.dylib
   # 测试产物
   *.test
   *.out
   # 依赖（Go Modules 不需要 vendor 目录，除非明确需要）
   vendor/
   ```

2. **推荐目录结构（Go 标准布局）**：
   ```
   cmd/
   └── myapp/
       └── main.go               # 入口
   internal/                     # 私有代码（不对外暴露）
   ├── config/
   ├── handler/                  # HTTP 处理器
   ├── service/                  # 业务逻辑
   └── repository/               # 数据访问
   pkg/                          # 可被外部引用的公共代码
   api/                          # API 定义（protobuf / OpenAPI）
   configs/                      # 配置文件模板
   ```
