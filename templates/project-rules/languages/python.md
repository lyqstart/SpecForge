# 项目工程规则 — Python

<!-- 继承 _BASE.md 的 R1-R8，本文件只写 Python 特有规则 -->

---

## 版本兼容（覆盖 R3）

```yaml
python_target:
  min_version: "[来自 prod-environment.md 的 python_min]"
  # 为什么要配：Python 各版本语法差异大
  # 如何决策：
  #   - Python 3.8：最低推荐，2024 年 10 月 EOL，老系统可能还在用
  #   - Python 3.10：引入 match/case，推荐新项目最低版本
  #   - Python 3.12：当前主流，性能提升明显，推荐新项目

  # ⚠️ 常见陷阱：
  # - walrus 运算符 := 是 3.8+ 才有
  # - match/case 是 3.10+ 才有
  # - typing.Union[X, Y] 可以写成 X | Y 是 3.10+ 才有
  # - tomllib 内置是 3.11+ 才有
```

---

## 依赖管理（覆盖 R2）

```yaml
dependency_tool: pip              # 依赖管理工具
                                  # 可选：
                                  #   pip + requirements.txt  最简单，兼容性最好
                                  #   poetry                  现代，锁文件完整，推荐新项目
                                  #   pipenv                  老牌，但 poetry 更流行
                                  #   conda                   科学计算项目
                                  # 如何决策：新项目用 poetry；需要兼容老环境用 pip

dependency_file: requirements.txt # 依赖声明文件
lock_file: requirements.lock      # 锁文件（poetry 是 poetry.lock）
```

**规则**：
1. 区分运行时依赖和开发依赖（`requirements.txt` vs `requirements-dev.txt`，
   或 poetry 的 `[tool.poetry.dependencies]` vs `[tool.poetry.dev-dependencies]`）
2. 锁文件必须提交到 git
3. 不得使用 `pip install` 不带版本号（`pip install requests` → 应该是 `requests==2.31.0`）

---

## 风格规则（覆盖 R5）

```yaml
style:
  formatter: black                # 代码格式化工具
                                  # 推荐：black（不可配置，减少争议）
  linter: ruff                    # 代码检查工具
                                  # 推荐：ruff（比 flake8/pylint 快 10-100 倍）
  type_checker: mypy              # 类型检查工具
  indent: 4                       # 缩进空格数（PEP 8 标准）
  max_line_length: 88             # 最大行长（black 默认 88）
  quotes: double                  # 字符串引号（black 默认 double）
```

---

## 日志规范（覆盖 R8）

**规则**：
1. 使用标准库 `logging` 模块，不得用 `print`
2. 日志配置在统一入口（`main.py` 或 `app/__init__.py`），不在各模块各自调 `basicConfig`
3. 各模块用 `logger = logging.getLogger(__name__)` 获取 logger

---

## 测试

```yaml
test_framework: pytest            # 测试框架
                                  # 推荐：pytest（生态最大，插件丰富）
test_command: "pytest"
coverage_command: "pytest --cov=src --cov-report=term-missing"
pbt_library: hypothesis           # 属性测试库（可选）
                                  # 推荐：hypothesis（Python 最成熟的 PBT 库）
```

---

## 技术栈最佳实践 — 项目应同时做的事

1. **`.gitignore` 建议添加**：
   ```
   __pycache__/
   *.py[cod]
   *$py.class
   *.so
   .env
   .venv/
   venv/
   env/
   .pytest_cache/
   .mypy_cache/
   .ruff_cache/
   dist/
   build/
   *.egg-info/
   htmlcov/
   .coverage
   ```

2. **推荐目录结构**：
   ```
   src/
   └── myapp/
       ├── __init__.py
       ├── main.py           # 入口
       ├── config.py         # 配置读取（从环境变量/配置文件读）
       ├── models/           # 数据模型
       ├── services/         # 业务逻辑
       ├── api/              # API 路由（Web 项目）
       └── utils/            # 工具函数
   tests/
   ├── unit/
   ├── integration/
   └── conftest.py           # pytest fixtures
   ```

3. **推荐同时配置**：
   - `pyproject.toml`（统一配置 black/ruff/mypy/pytest）
   - `.editorconfig`
   - `Dockerfile`（如需容器化）
   - `Makefile`（常用命令快捷方式）
