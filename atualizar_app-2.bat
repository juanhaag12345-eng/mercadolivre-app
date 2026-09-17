@echo off
cd /d "%~dp0"

if not exist nfe-automacao.patch (
  echo ERRO: o arquivo nfe-automacao.patch nao esta nesta pasta.
  echo Baixa esse arquivo tambem e coloca junto deste .bat antes de rodar de novo.
  pause
  exit /b 1
)

echo Aplicando atualizacao...
git apply nfe-automacao.patch
if errorlevel 1 (
  echo ERRO ao aplicar o patch. Nada foi enviado. Fala com o Claude.
  pause
  exit /b 1
)

git add -A
git commit -m "Adiciona pagina de politica de privacidade e automacao de NF-e por e-mail"
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

del nfe-automacao.patch
echo.
echo Pronto! Atualizado com sucesso. Pode fechar esta janela.
pause
