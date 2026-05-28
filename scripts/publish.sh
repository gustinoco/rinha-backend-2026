#!/usr/bin/env bash
#
# Build + push da imagem com tag imutavel (SHA do commit) + tag de versao.
# Uso: ./scripts/publish.sh [versao]
# Ex:  ./scripts/publish.sh v0.2.0
#
set -euo pipefail

VERSION=${1:-}
if [[ -z "${VERSION}" ]]; then
  echo "Uso: $0 <versao>" >&2
  echo "Ex:  $0 v0.2.0" >&2
  exit 1
fi

# Sai se houver mudancas nao commitadas (garante que o SHA reflete o codigo real)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERRO: existem mudancas nao commitadas. Commit primeiro." >&2
  git status --short >&2
  exit 1
fi

SHA=$(git rev-parse --short HEAD)
TAG="${VERSION}-${SHA}"
IMAGE="gustavotinoo/rinha-fraud-api"

echo "==> Buildando ${IMAGE}:${TAG}"
echo "    (tambem publica como :${VERSION} e :latest)"
echo ""

docker buildx build \
  --platform linux/amd64 \
  --pull \
  --no-cache \
  -t "${IMAGE}:${TAG}" \
  -t "${IMAGE}:${VERSION}" \
  -t "${IMAGE}:latest" \
  --push \
  .

echo ""
echo "==> Publicado: ${IMAGE}:${TAG}"
echo ""
echo "Proximos passos:"
echo "  1. Atualize docker-compose.yml com:"
echo "     image: ${IMAGE}:${TAG}"
echo ""
echo "  2. Commit no main e merge para a branch submission"
echo ""
echo "  3. Reabra a issue 'rinha/test' para rodar a previa"
