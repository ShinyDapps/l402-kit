# Summary

<!-- 1-3 sentences: what changed and why -->

## Type

- [ ] Bug fix (non-breaking)
- [ ] Feature (non-breaking)
- [ ] Breaking change
- [ ] Security fix
- [ ] Docs / refactor / chore

## Cross-language parity

- [ ] N/A — this PR doesn't touch SDK contracts
- [ ] Ported to TypeScript + Python + Rust + Go
- [ ] Server-side only (`cloudflare/`) — no SDK port needed
- [ ] Single-language by design (note language and why)

## Tests

- [ ] New tests written (TDD)
- [ ] Existing tests still pass locally
- [ ] CI green (let it run)

## Security checklist

- [ ] No secrets in code (pre-commit `.githooks/pre-commit` confirms)
- [ ] No new outbound network calls without SSRF/timeout guards
- [ ] If touching auth or `verify_token`: cross-lang parity is intact (`MAX_EXP_MS`, length guard, constant-time)

## Docs

- [ ] `docs/` updated if user-facing
- [ ] `CHANGELOG` (if maintained) updated
- [ ] `ARCHITECTURE.md` updated if structure moved

## Release

- [ ] No version bump (chore/docs)
- [ ] Patch: bumped `package.json` + `python/pyproject.toml` + `rust/Cargo.toml` + `go/README.md`
- [ ] Tag `vX.Y.Z` will trigger the release matrix after merge

<!-- Tip: tests must pass in CI before the release matrix's verify job will publish anything. -->
