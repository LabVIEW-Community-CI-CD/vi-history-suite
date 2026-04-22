@echo off
setlocal

if "%~1"=="" (
  >&2 echo Missing Node.js script target.
  exit /b 1
)

set "NODE_EXE="
if defined npm_node_execpath (
  if exist "%npm_node_execpath%" (
    set "NODE_EXE=%npm_node_execpath%"
  )
)

if not defined NODE_EXE (
  for %%I in (node.exe) do (
    if not "%%~$PATH:I"=="" set "NODE_EXE=%%~$PATH:I"
  )
)

if not defined NODE_EXE (
  >&2 echo Unable to locate Node.js executable from npm_node_execpath or PATH.
  exit /b 1
)

"%NODE_EXE%" %*
exit /b %ERRORLEVEL%
