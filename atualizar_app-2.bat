@echo off
cd /d "%~dp0"

if not exist nfe-download-conta.patch (
  echo ERRO: o arquivo nfe-download-conta.patch nao esta nesta pasta.
  echo Baixa esse arquivo tambem e coloca junto deste .bat antes de rodar de novo.
  pause
  exit /b 1
)

echo Aplicando atualizacao...
git apply nfe-download-conta.patch
if errorlevel 1 (
  echo ERRO ao aplicar o patch. Nada foi enviado. Fala com o Claude.
  pause
  exit /b 1
)

git add -A
git commit -m "Mostra a conta de e-mail de cada NF-e e permite baixar o XML original"
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

del nfe-download-conta.patch
echo.
echo Pronto! Atualizado com sucesso. Pode fechar esta janela.
pause
