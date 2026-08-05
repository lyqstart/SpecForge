@echo off
setlocal
if "%~1"=="" (
  echo ERROR=SOURCE_FILE_REQUIRED
  exit /b 2
)
if not exist "%~f1" (
  echo ERROR=SOURCE_FILE_NOT_FOUND
  exit /b 2
)
where py >nul 2>nul
if not errorlevel 1 goto use_py
where python >nul 2>nul
if not errorlevel 1 goto use_python
echo ERROR=PYTHON_NOT_FOUND
exit /b 2

:use_py
py -3 -B "%~dp0copy-utf8-to-clipboard.py" "%~f1"
exit /b %errorlevel%

:use_python
python -B "%~dp0copy-utf8-to-clipboard.py" "%~f1"
exit /b %errorlevel%
