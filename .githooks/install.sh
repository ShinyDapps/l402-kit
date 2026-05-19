#!/usr/bin/env bash
# Ativa os hooks deste repo. Rode 1x após clone:
#   bash .githooks/install.sh
git config core.hooksPath .githooks
echo "✅ Git hooks ativados em .githooks/"
echo "   Pre-commit guard: bloqueia tokens conhecidos (npm/PyPI/Cloudflare/GH/Anthropic/etc)"
echo "   Bypass emergencial: git commit --no-verify"
