@echo off
setlocal
if defined JAVA_HOME (set "EFF_JAVA=%JAVA_HOME%\bin\java.exe") else (set "EFF_JAVA=java.exe")
"%EFF_JAVA%" -classpath "%~dp0gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain %*
exit /b %ERRORLEVEL%
