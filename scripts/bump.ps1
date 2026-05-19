param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$NewVersion,
    [switch]$DryRun,
    [switch]$NoTag,
    [switch]$NoPush
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkgJson = Get-Content "$root\package.json" -Raw | ConvertFrom-Json
$current = $pkgJson.version

Write-Host ""
Write-Host "  l402-kit version bump"
Write-Host "  $current  ->  $NewVersion"
if ($DryRun) { Write-Host "  [DRY RUN - nenhum arquivo sera alterado]" }
Write-Host ""

if ($current -eq $NewVersion) { Write-Host "Versao ja e $NewVersion."; exit 0 }

function Replace-InFile([string]$file, [string]$from, [string]$to) {
    if (-not (Test-Path $file)) { return }
    $c = Get-Content $file -Raw
    $u = $c.Replace($from, $to)
    if ($c -eq $u) { Write-Host "  [SKIP]  $file  (padrao nao encontrado)"; return }
    if (-not $DryRun) { [System.IO.File]::WriteAllText($file, $u, [System.Text.Encoding]::UTF8) }
    Write-Host "  [OK]    $file"
}

Write-Host "[ ARQUIVOS ]"
Replace-InFile "$root\package.json"                  ('"version": "' + $current + '"')    ('"version": "' + $NewVersion + '"')
Replace-InFile "$root\vscode-extension\package.json" ('"version": "' + $current + '"')    ('"version": "' + $NewVersion + '"')
Replace-InFile "$root\python\pyproject.toml"         ('version = "' + $current + '"')     ('version = "' + $NewVersion + '"')
Replace-InFile "$root\COCKPIT.md"                    ('Vers' + [char]0x00E3 + 'o atual: ' + $current)  ('Vers' + [char]0x00E3 + 'o atual: ' + $NewVersion)
# fallback: regex tolerante ao encoding do acento (NFC/NFD)
if (Test-Path "$root\COCKPIT.md") {
    $raw = [System.IO.File]::ReadAllText("$root\COCKPIT.md", [System.Text.Encoding]::UTF8)
    $pattern = '(?m)^(Vers.{1,3}o atual:\s+)' + [regex]::Escape($current)
    if ($raw -match $pattern) {
        $upd = $raw -replace $pattern, ('${1}' + $NewVersion)
        if ($raw -ne $upd) {
            if (-not $DryRun) { [System.IO.File]::WriteAllText("$root\COCKPIT.md", $upd, [System.Text.Encoding]::UTF8) }
            Write-Host "  [OK]    $root\COCKPIT.md (regex)"
        }
    }
}
Replace-InFile "$root\OPERATIONS.md"                 ('**' + $current + '**')             ('**' + $NewVersion + '**')
Write-Host ""

Write-Host "[ GIT ]"
if (-not $DryRun) {
    git -C $root add "package.json" "vscode-extension/package.json" "python/pyproject.toml" 2>&1 | Out-Null
    $msg = "chore: bump version $current -> $NewVersion"
    git -C $root commit -m $msg 2>&1 | Out-Null
    Write-Host "  [OK]    commit: $msg"
} else {
    Write-Host "  [SKIP]  git commit (dry run)"
}

if (-not $NoTag) {
    foreach ($tag in @("v$NewVersion", "go/v$NewVersion")) {
        if (-not $DryRun) {
            git -C $root tag $tag 2>&1 | Out-Null
            Write-Host "  [OK]    tag: $tag"
        } else {
            Write-Host "  [SKIP]  tag: $tag (dry run)"
        }
    }
}

if (-not $NoPush -and -not $DryRun) {
    Write-Host ""
    Write-Host "[ PUSH ]"
    git -C $root push origin main 2>&1 | Select-Object -Last 2 | ForEach-Object { Write-Host "  $_" }
    git -C $root push origin "v$NewVersion" "go/v$NewVersion" 2>&1 | Select-Object -Last 2 | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "  BUMP OK: $current -> $NewVersion"
Write-Host ""
Write-Host "  Proximos passos:"
Write-Host "  1. npm run build ; npm publish --access public"
Write-Host "  2. cd python ; ..\\.venv\Scripts\python -m build ; ..\\.venv\Scripts\python -m twine upload dist/*"
Write-Host "  3. cd rust ; cargo publish   (semver independente — editar Cargo.toml se necessario)"
Write-Host "  4. cd vscode-extension ; npx vsce publish"
Write-Host "  5. Go: indexa automaticamente via tag go/v$NewVersion (~10min)"
Write-Host "  6. .\healthcheck.ps1"