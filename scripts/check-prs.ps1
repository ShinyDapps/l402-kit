# Monitor all open PRs + VERITY RADAR queues + treasury alerts.
# Use:
#   $env:GITHUB_PAT = "<from memory/credentials.md>"
#   $env:DASHBOARD_SECRET = "<from memory/credentials.md>"
#   powershell scripts/check-prs.ps1

$ghToken = $env:GITHUB_PAT
$dashSecret = $env:DASHBOARD_SECRET

if (-not $ghToken)    { Write-Host "ERR: set `$env:GITHUB_PAT (see memory/credentials.md)"; exit 1 }
if (-not $dashSecret) { Write-Host "ERR: set `$env:DASHBOARD_SECRET (see memory/credentials.md)"; exit 1 }

$h = @{ Authorization = "Bearer $ghToken"; Accept = "application/vnd.github+json" }

Write-Host "=========================================="
Write-Host "PRs ABERTOS (verificado $(Get-Date -Format 'yyyy-MM-dd HH:mm'))"
Write-Host "=========================================="

$prs = @(
  @{ name = "x402 #2262 (NOSSA)"; url = "https://api.github.com/repos/x402-foundation/x402/pulls/2262" },
  @{ name = "awesome-mcp #5585";  url = "https://api.github.com/repos/punkpeye/awesome-mcp-servers/pulls/5585" },
  @{ name = "awesome-L402 #14";   url = "https://api.github.com/repos/Fewsats/awesome-L402/pulls/14" },
  @{ name = "lightninglabs #25";  url = "https://api.github.com/repos/lightninglabs/L402/pulls/25" },
  @{ name = "btcpayserver #1589"; url = "https://api.github.com/repos/btcpayserver/btcpayserver-doc/pulls/1589" }
)

foreach ($pr in $prs) {
  try {
    $r = Invoke-RestMethod $pr.url -Headers $h -ErrorAction Stop
    $state = if ($r.merged) { "MERGED" } else { $r.state.ToUpper() }
    $lastEvent = ([DateTime]::Parse($r.updated_at)).ToString("MM-dd HH:mm")
    Write-Host ("{0,-22} {1,-6} comments={2,-3} reviews={3,-3} updated={4}" -f $pr.name, $state, $r.comments, $r.review_comments, $lastEvent)
  } catch {
    Write-Host "$($pr.name): ERR — $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "=========================================="
Write-Host "VERITY — Revenue + RADAR + Alerts"
Write-Host "=========================================="

# Fiscal hoje
$fiscal = curl.exe -s "https://l402kit.com/api/verity/fiscal" | ConvertFrom-Json
Write-Host "Revenue hoje:   $($fiscal.revenue_sats) sats"
Write-Host "Consumer spent: $($fiscal.consumer_spent_sats) / $($fiscal.consumer_budget_sats) sats"

# RADAR
$radar = Invoke-RestMethod "https://l402kit.com/api/verity/admin/radar" -Headers @{ "x-dashboard-secret" = $dashSecret }
Write-Host ""
Write-Host "RADAR queues:"
Write-Host "  human_hot:  $($radar.queues.human_hot.Count)"
Write-Host "  human_warm: $($radar.queues.human_warm.Count)"
Write-Host "  agent_hot:  $($radar.queues.agent_hot.Count)"
Write-Host "  agent_warm: $($radar.queues.agent_warm.Count)"

if ($radar.hot_with_drafts.Count -gt 0) {
  Write-Host ""
  Write-Host "🔴 HOT LEADS:"
  foreach ($lead in $radar.hot_with_drafts) {
    Write-Host "  - [$($lead.persona)] $($lead.title)"
    Write-Host "    $($lead.url)"
  }
}

# Alerts
$alerts = Invoke-RestMethod "https://l402kit.com/api/verity/admin/alerts" -Headers @{ "x-dashboard-secret" = $dashSecret }
Write-Host ""
if ($alerts.count -gt 0) {
  Write-Host "🚨 ALERTS ($($alerts.count)):"
  foreach ($a in $alerts.alerts) { Write-Host "  - $($a.type): $($a.message)" }
} else {
  Write-Host "Alerts: 0"
}
