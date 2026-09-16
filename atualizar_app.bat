@echo off
cd /d "%~dp0"

if not exist menu-lateral-mobile.patch (
  echo ERRO: o arquivo menu-lateral-mobile.patch nao esta nesta pasta.
  echo Baixa esse arquivo tambem e coloca junto deste .bat antes de rodar de novo.
  pause
  exit /b 1
)

echo Aplicando atualizacao...
git apply menu-lateral-mobile.patch
if errorlevel 1 (
  echo ERRO ao aplicar o patch. Nada foi enviado. Fala com o Claude.
  pause
  exit /b 1
)

git add -A
git commit -m "Menu lateral no celular no lugar das abas espremidas"
if errorlevel 1 (
  echo ERRO ao commitar. Fala com o Claude.
  pause
  exit /b 1
)

git push
if errorlevel 1 (
  echo ERRO ao enviar pro GitHub. Fala com o Claude.
  pause
  exit /b 1
)

del menu-lateral-mobile.patch
echo.
echo Pronto! Atualizado com sucesso. Pode fechar esta janela.
pause
