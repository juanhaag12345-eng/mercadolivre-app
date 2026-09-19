@echo off
cd /d "%~dp0"

if not exist automacao-pendentes.patch (
  echo ERRO: o arquivo automacao-pendentes.patch nao esta nesta pasta.
  echo Baixa esse arquivo tambem e coloca junto deste .bat antes de rodar de novo.
  pause
  exit /b 1
)

echo Aplicando atualizacao...
git apply automacao-pendentes.patch
if errorlevel 1 (
  echo Tentando de outro jeito...
  git apply --ignore-whitespace automacao-pendentes.patch
)
if errorlevel 1 (
  echo ERRO ao aplicar o patch. Nada foi enviado. Fala com o Claude.
  pause
  exit /b 1
)

git add -A
git commit -m "Automatiza confirmacao de vendas pendentes por anuncio ja mapeado"
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

del automacao-pendentes.patch
echo.
echo Pronto! Atualizado com sucesso. Pode fechar esta janela.
pause
