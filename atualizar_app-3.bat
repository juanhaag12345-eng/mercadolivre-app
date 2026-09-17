@echo off
cd /d "%~dp0"

if not exist controle-estoque.patch (
  echo ERRO: o arquivo controle-estoque.patch nao esta nesta pasta.
  echo Baixa esse arquivo tambem e coloca junto deste .bat antes de rodar de novo.
  pause
  exit /b 1
)

echo Aplicando atualizacao...
git apply controle-estoque.patch
if errorlevel 1 (
  echo ERRO ao aplicar o patch. Nada foi enviado. Fala com o Claude.
  pause
  exit /b 1
)

git add -A
git commit -m "Implementa controle de estoque completo: entrada por NF-e com correspondencia automatica, compra sem NF com prazo/pagamento, historico de precos com grafico e paineis no dashboard"
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

del controle-estoque.patch
echo.
echo Pronto! Atualizado com sucesso. Pode fechar esta janela.
pause
