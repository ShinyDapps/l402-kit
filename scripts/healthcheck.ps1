#!/usr/bin/env pwsh
# healthcheck.ps1 - l402-kit End-to-End Health Check
# Uso: .\healthcheck.ps1
# Verifica: testes locais (4 SDKs) + versoes publicadas + backend live

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$PASS  = "PASS"
$FAIL  = "FAIL"
$SKIP  = "SKIP"
$script:results = @()

function Add-Result($label, $status, $detail) {
    $script:results += [PSCustomObject]@{ Label = $label; Status = $status; Detail = $detail }
    $icon = if ($status -eq $PASS) { "[OK]" } elseif ($status -eq $FAIL) { "[XX]" } else { "[--]" }
    Write-Host "$icon  $label  $detail"
}

Write-Host ""
Write-Host "=================================================="
Write-Host "  l402-kit healthcheck  $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Host "=================================================="
Write-Host ""

# -- 1. TESTES LOCAIS --------------------------------------------------

Write-Host "[ TESTES LOCAIS ]"

# TypeScript
Push-Location "$root"
$tsOut  = npm test 2>&1 | Out-String
$tsExit = $LASTEXITCODE
$tsPassed = if ($tsOut -match "Tests:\s+(\d+) passed") { $Matches[1] } `
             elseif ($tsOut -match "(\d+) tests? passed") { $Matches[1] } `
             elseif ($tsOut -match "(\d+) passed") { $Matches[1] } `
             else { "?" }
$tsStatus = if ($tsExit -eq 0) { $PASS } else { $FAIL }
Add-Result "TypeScript (Jest)" $tsStatus "$tsPassed testes"
Pop-Location

# Go
Push-Location "$root\go"
$goOut  = go test ./... 2>&1 | Out-String
$goExit = $LASTEXITCODE
$goStatus = if ($goExit -eq 0) { $PASS } else { $FAIL }
$goDetail  = if ($goOut -match "ok\s+\S+\s+([\d.]+s)") { $Matches[1] } else { "" }
Add-Result "Go" $goStatus $goDetail
Pop-Location

# Rust
Push-Location "$root\rust"
$rustOut   = cargo test 2>&1 | Out-String
$rustExit  = $LASTEXITCODE
$rustStatus = if ($rustExit -eq 0) { $PASS } else { $FAIL }
$rustPassed = if ($rustOut -match "test result: ok\. (\d+) passed") { $Matches[1] } else { "?" }
Add-Result "Rust" $rustStatus "$rustPassed testes"
Pop-Location

# Python
$pyExe = "$root\.venv\Scripts\python.exe"
if (-not (Test-Path $pyExe)) { $pyExe = "python" }
& $pyExe -m pip install pytest pytest-asyncio 2>&1 | Out-Null
$pyOut    = & $pyExe -m pytest "$root\python\tests\" -v 2>&1 | Out-String
$pyExit   = $LASTEXITCODE
$pyStatus = if ($pyExit -eq 0) { $PASS } else { $FAIL }
$pyPassed = if ($pyOut -match "(\d+) passed in") { $Matches[1] } else { "?" }
Add-Result "Python (pytest)" $pyStatus "$pyPassed testes"

Write-Host ""

# -- 2. VERSOES PUBLICADAS ---------------------------------------------

Write-Host "[ VERSOES PUBLICADAS ]"

$localVersion = (Get-Content "$root\package.json" | ConvertFrom-Json).version

# npm
$npmVersion = npm view l402-kit version 2>$null
$npmStatus  = if ($npmVersion -eq $localVersion) { $PASS } elseif ($npmVersion) { $FAIL } else { $SKIP }
Add-Result "npm  l402-kit" $npmStatus "local=$localVersion  live=$npmVersion"

# PyPI
try {
    $pypiVersion = (Invoke-RestMethod "https://pypi.org/pypi/l402kit/json" -TimeoutSec 8).info.version
    $pyLocalVer  = (Get-Content "$root\python\pyproject.toml" | Select-String 'version\s*=\s*"([\d.]+)"').Matches[0].Groups[1].Value
    $pypiStatus  = if ($pypiVersion -eq $pyLocalVer) { $PASS } else { $FAIL }
    Add-Result "PyPI  l402kit" $pypiStatus "local=$pyLocalVer  live=$pypiVersion"
} catch {
    Add-Result "PyPI  l402kit" $SKIP "sem resposta"
}

# crates.io
try {
    $cratesVersion = (Invoke-RestMethod "https://crates.io/api/v1/crates/l402kit" -TimeoutSec 8 -Headers @{ "User-Agent" = "l402kit-healthcheck" }).crate.newest_version
    $cratesLocal   = (Select-String 'version\s*=\s*"([\d.]+)"' "$root\rust\Cargo.toml" | Select-Object -First 1).Matches[0].Groups[1].Value
    $cratesStatus  = if ($cratesVersion -eq $cratesLocal) { $PASS } elseif ($cratesVersion) { "WARN" } else { $SKIP }
    Add-Result "crates.io  l402kit" $cratesStatus "local=$cratesLocal  live=$cratesVersion"
} catch {
    Add-Result "crates.io  l402kit" $SKIP "sem resposta"
}

# Go tag
$latestGoTag = git tag --list "go/v*" 2>$null | Sort-Object -Descending | Select-Object -First 1
$remoteRaw   = git ls-remote --tags origin "refs/tags/go/v*" 2>$null | Sort-Object -Descending | Select-Object -First 1
$remoteGoTag = if ($remoteRaw) { "go/" + (($remoteRaw -split "refs/tags/go/")[-1]).Trim() } else { "?" }
$goTagStatus = if ($latestGoTag -and ($remoteGoTag -eq $latestGoTag)) { $PASS } else { $FAIL }
Add-Result "Go  pkg.go.dev" $goTagStatus "local=$latestGoTag  remote=$remoteGoTag"

Write-Host ""

# -- 3. BACKEND LIVE ---------------------------------------------------

Write-Host "[ BACKEND LIVE ]"

# Landing page
try {
    $r = Invoke-WebRequest -Uri "https://l402kit.com" -UseBasicParsing -TimeoutSec 8
    Add-Result "Landing  /" $PASS "HTTP $($r.StatusCode)"
} catch {
    Add-Result "Landing  /" $FAIL "HTTP $($_.Exception.Response.StatusCode.value__)"
}

# /api/invoice - GET sem params: 400, 401, 402, 405 sao aceitaveis
try {
    Invoke-WebRequest -Uri "https://l402kit.com/api/invoice" -UseBasicParsing -TimeoutSec 8 | Out-Null
    Add-Result "API  /api/invoice" $FAIL "esperava 4xx"
} catch {
    $code   = $_.Exception.Response.StatusCode.value__
    $status = if ($code -in 400,401,402,405) { $PASS } else { $FAIL }
    Add-Result "API  /api/invoice" $status "HTTP $code"
}

# /api/stats - deve retornar 401 (requer DASHBOARD_SECRET)
try {
    Invoke-WebRequest -Uri "https://l402kit.com/api/stats" -UseBasicParsing -TimeoutSec 8 | Out-Null
    Add-Result "API  /api/stats" $FAIL "esperava 401"
} catch {
    $code   = $_.Exception.Response.StatusCode.value__
    $status = if ($code -eq 401) { $PASS } else { $FAIL }
    Add-Result "API  /api/stats" $status "HTTP $code"
}

Write-Host ""

# -- 4. SUMARIO --------------------------------------------------------

$passed  = ($script:results | Where-Object Status -eq $PASS).Count
$failed  = ($script:results | Where-Object Status -eq $FAIL).Count
$skipped = ($script:results | Where-Object Status -in @($SKIP, "WARN")).Count
$total   = $script:results.Count

Write-Host "=================================================="
Write-Host "  RESULTADO FINAL"
Write-Host "=================================================="
Write-Host "  OK  : $passed / $total"
if ($failed  -gt 0) { Write-Host "  FAIL: $failed" }
if ($skipped -gt 0) { Write-Host "  SKIP: $skipped" }
Write-Host ""

if ($failed -gt 0) {
    Write-Host "Falhas:"
    $script:results | Where-Object Status -eq $FAIL | ForEach-Object {
        Write-Host "  [XX] $($_.Label)  $($_.Detail)"
    }
    Write-Host ""
    exit 1
} else {
    Write-Host "  Tudo OK. l402-kit esta saudavel."
    Write-Host ""
    exit 0
}
