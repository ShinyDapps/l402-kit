# GitHub Actions — l402-kit

## CI (`ci.yml`)
Roda em todo push/PR para `main`. 4 jobs paralelos:
- TypeScript / Jest
- Python / pytest
- Go / `go test ./...`
- Rust / `cargo test`

Também é callable via `workflow_call` para outros workflows reusarem como gate.

## Release matrix (`release.yml`)

Disciplina: **todo release sai equalizado nos 4 langs**.

### Como disparar
```bash
# 1. Bump versões em todos os arquivos:
#    - package.json (npm)
#    - python/pyproject.toml
#    - rust/Cargo.toml (e Cargo.lock se mudar deps)
#    - go/README.md (referência humana)
#
# 2. Commit + push para main
# 3. Criar tag com prefixo `v` (exemplo: v1.10.0):
git tag v1.10.0 -m "Release 1.10.0 — LAW-N adapter cross-lang"
git push origin v1.10.0
```

A partir daí, o release matrix faz tudo:
1. **verify** — confere que package.json + pyproject.toml + Cargo.toml batem com a tag (se não, falha antes de publicar nada)
2. **test** — roda CI completo (4 langs)
3. **publish-npm** — `npm publish` com `NPM_TOKEN`
4. **publish-pypi** — `twine upload` com `PYPI_TOKEN`
5. **publish-crates** — `cargo publish` com `CARGO_TOKEN`
6. **publish-go-tag** — cria e empurra tag mirror `go/vX.Y.Z` (necessária porque módulo Go está em subdir `/go`) + warm-up do `proxy.golang.org`

### Secrets necessários (setar uma vez)

| Secret | Onde | Como obter |
|---|---|---|
| `NPM_TOKEN` | npmjs.com → settings → access tokens (granular, l402-kit, publish) | `credentials.md` ## npm |
| `PYPI_TOKEN` | pypi.org → account settings → API tokens (scope = l402kit) | `credentials.md` ## PyPI |
| `CARGO_TOKEN` | crates.io → settings → API tokens (publish + publish-update) | `credentials.md` ## crates.io |

Setar via UI:
1. https://github.com/ShinyDapps/l402-kit/settings/secrets/actions
2. **New repository secret** para cada um

Ou via `gh` CLI (precisa PAT com `actions:write` scope):
```bash
gh secret set NPM_TOKEN   --repo ShinyDapps/l402-kit --body "<token>"
gh secret set PYPI_TOKEN  --repo ShinyDapps/l402-kit --body "<token>"
gh secret set CARGO_TOKEN --repo ShinyDapps/l402-kit --body "<token>"
```

### Tag inválida → release abortado
Se o `verify` job falhar (versões divergem entre arquivos), o release inteiro aborta antes de publicar. Isso protege contra release "meio publicado" onde npm pegou mas PyPI falhou.

### Idempotência
- npm publica versão única — re-rodar mesma tag falha (segurança).
- PyPI mesmo comportamento.
- cargo.publish é idempotente após sucesso (404 ao re-publicar).
- Tag Go mirror checa se existe antes de criar — re-rodar é seguro.
