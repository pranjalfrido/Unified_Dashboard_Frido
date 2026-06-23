$BASE = "https://unified-dashboard-frido.vercel.app"
$FROM = "2026-04-01"
$TO   = "2026-06-16"

$cur = [datetime]::ParseExact($FROM, "yyyy-MM-dd", $null)
$end = [datetime]::ParseExact($TO,   "yyyy-MM-dd", $null)

while ($cur -le $end) {
  $chunkEnd = $cur.AddDays(6)
  if ($chunkEnd -gt $end) { $chunkEnd = $end }

  $s = $cur.ToString("yyyy-MM-dd")
  $e = $chunkEnd.ToString("yyyy-MM-dd")

  Write-Host "Syncing $s -> $e ..." -NoNewline
  try {
    $body = "{`"start`":`"$s`",`"end`":`"$e`"}"
    $r = Invoke-RestMethod -Uri "$BASE/api/sync-month" -Method POST -ContentType "application/json" -Body $body
    Write-Host " OK $($r.rows_upserted) rows"
  } catch {
    Write-Host " FAILED: $_"
  }

  $cur = $chunkEnd.AddDays(1)
}

Write-Host "Done! Checking status..."
Invoke-RestMethod -Uri "$BASE/api/sync-status"
