@echo off
REM Nom : construire-windows.bat
REM Description : Construit la version autonome pour Windows : dossier dist\win-unpacked
REM   et archive dist\Albert-Go-<version>-win64.zip, dans standalone\.
REM Projet : Albert Go, https://github.com/obook/albert-go
REM Auteur : O. Booklage
REM Licence : GPL-3.0-or-later
REM
REM Mêmes étapes que le job paquet-windows de .gitlab-ci.yml, sous Windows. Il faut Node.js et Git.

chcp 65001 >nul
setlocal
cd /d "%~dp0"

for %%o in (node npm git) do (
    where %%o >nul 2>&1 || (echo %%o introuvable. & exit /b 1)
)

REM Python embarquable, téléchargé une fois. Le .pth ajoute ses paquets et le serveur (resources\albert-go).
if not exist python-win\python.exe (
    powershell -NoProfile -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest https://www.python.org/ftp/python/3.12.7/python-3.12.7-embed-amd64.zip -OutFile python-win.zip; Expand-Archive python-win.zip python-win -Force; Remove-Item python-win.zip" || exit /b 1
    (
        echo python312.zip
        echo .
        echo Lib\site-packages
        echo ..\albert-go
        echo import site
    ) > python-win\python312._pth
)

REM Le Python embarquable n'a pas pip ; sans PYTHONNOUSERSITE, pip verrait les paquets de l'utilisateur.
set "PYTHONNOUSERSITE=1"
if not exist python-win\Lib\site-packages\pip (
    powershell -NoProfile -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest https://bootstrap.pypa.io/get-pip.py -OutFile python-win\get-pip.py" || exit /b 1
    python-win\python.exe python-win\get-pip.py -q --no-warn-script-location || exit /b 1
    del python-win\get-pip.py
)
python-win\python.exe -m pip install -q --no-warn-script-location -r ..\serveur\requirements.txt || exit /b 1

call npm ci || exit /b 1
call npm run build -- --win dir || exit /b 1

for /f "usebackq" %%v in (`node -p "require('./package.json').version"`) do set "VERSION=%%v"
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; Compress-Archive -Path 'dist\win-unpacked\*' -DestinationPath 'dist\Albert-Go-%VERSION%-win64.zip' -Force" || exit /b 1
echo Archive : %CD%\dist\Albert-Go-%VERSION%-win64.zip
