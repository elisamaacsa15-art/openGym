#!/usr/bin/env bash
# Fork: publica o app (sem servidor) no GitHub Pages pela branch gh-pages.
# Uso, na raiz do repositório:  bash scripts/fork/deploy-pages.sh
# Gera o frontend com VITE_NO_SERVER=1 (abre direto no perfil do aparelho; pt-BR e sem YouTube vêm
# de frontend/.env.production), copia as mídias de 180 px do catálogo (permitidas num fork não
# comercial, ver NOTICE.md) e envia o resultado para a branch gh-pages do remote "origin".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
cd "$ROOT/frontend"
VITE_NO_SERVER=1 npx vite build --outDir "$OUT" --emptyOutDir
node "$ROOT/scripts/catalogue/stage-media.mjs" "$OUT"
cp "$ROOT/NOTICE.md" "$ROOT/LICENSE" "$OUT/"
touch "$OUT/.nojekyll"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$ROOT" config user.name || echo deploy)" -c user.email="$(git -C "$ROOT" config user.email || echo deploy@localhost)" \
  commit -q -m "Publicação do app ($(git -C "$ROOT" rev-parse --short HEAD))"
git push -q -f "$REMOTE" gh-pages
echo "Publicado. O GitHub Pages atualiza em 1 a 2 minutos."
