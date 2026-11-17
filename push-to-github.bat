@echo off
cd /d "%~dp0"
if exist .git goto commit
git init
git branch -M main
set /p REPO=Paste your GitHub repository URL (https://github.com/USER/REPO.git): 
git remote add origin %REPO%
:commit
git add .
set /p MSG=Commit message (press Enter for default): 
if "%MSG%"=="" set MSG=Update PeopleHub
git commit -m "%MSG%"
git push -u origin main
pause
