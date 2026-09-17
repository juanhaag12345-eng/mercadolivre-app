@echo off
cd /d "%~dp0"

if not exist produtos-e-correcoes.patch (
  echo ERRO: o arquivo produtos-e-correcoes.patch nao esta nesta pasta.
  echo Baixa esse arquivo tambem e coloca junto deste .bat antes de rodar de novo.
  pause
  exit /b 1
)

echo Aplicando atualizacao...
git apply produtos-e-correcoes.patch
if errorlevel 1 (
  echo ERRO ao aplicar o patch. Nada foi enviado. Fala com o Claude.
  pause
  exit /b 1
)

git add -A
git commit -m "Corrige duplicacao de produto novo, renomeia abas e adiciona cadastro completo de produtos com tipo de venda e preco de custo"
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

del produtos-e-correcoes.patch
echo.
echo Pronto! Atualizado com sucesso. Pode fechar esta janela.
pause
