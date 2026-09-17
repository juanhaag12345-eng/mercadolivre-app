@echo off
cd /d "%~dp0"

if not exist compras-estoque.patch (
  echo ERRO: o arquivo compras-estoque.patch nao esta nesta pasta.
  echo Baixa esse arquivo tambem e coloca junto deste .bat antes de rodar de novo.
  pause
  exit /b 1
)

echo Aplicando atualizacao...
git apply compras-estoque.patch
if errorlevel 1 (
  echo ERRO ao aplicar o patch. Nada foi enviado. Fala com o Claude.
  pause
  exit /b 1
)

git add -A
git commit -m "Adiciona controle de estoque: aba Compras, alerta de estoque baixo e vinculo com Pendentes"
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

del compras-estoque.patch
echo.
echo Pronto! Atualizado com sucesso. Pode fechar esta janela.
pause
