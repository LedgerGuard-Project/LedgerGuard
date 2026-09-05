$ErrorActionPreference = 'Stop'
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/auth/login' -ContentType 'application/json' -Body (@{email='superadmin@ledgerguard.io';password='SuperAdmin123!';tenantId='ledgerguard-platform'} | ConvertTo-Json)
$H = @{ Authorization = 'Bearer ' + $login.data.accessToken }
# Detailed health (super admin) to confirm workers + sockets healthy
try {
  $h = Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/health' -Headers $H
  Write-Output ("HEALTH: status=" + $h.data.status + " redisOk=" + $h.data.dependencies.redis.ok + " tx=" + $h.data.dependencies.database.transactionsSupported)
  $w = $h.data.workers | Where-Object { $_.name -eq 'webhook.retry' }
  Write-Output ("WORKER webhook.retry: enabled=" + $w.enabled)
} catch { Write-Output ("HEALTH FAIL: " + $_.Exception.Message) }

# Audit trail — verify the new actions were recorded in the global audit log.
try {
  $a = Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/audit?limit=50' -Headers $H
  $log = ($a.data | ConvertTo-Json -Depth 20)
  $checks = @('exception_created','api_key_created','webhook_endpoint_created')
  foreach ($c in $checks) {
    if ($log -match $c) { Write-Output ("AUDIT OK: " + $c) } else { Write-Output ("AUDIT MISSING: " + $c) }
  }
} catch {
  Write-Output ("AUDIT ENDPOINT (may not exist): " + $_.Exception.Message)
}
