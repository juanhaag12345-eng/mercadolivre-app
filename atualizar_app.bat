@echo off
cd /d "%~dp0"
echo Aplicando atualizacao...
git apply menu-lateral-mobile.patch
git add -A
git commit -m "Menu lateral no celular no lugar das abas espremidas"
git push
echo.
echo Pronto. Pode fechar esta janela.
pause
