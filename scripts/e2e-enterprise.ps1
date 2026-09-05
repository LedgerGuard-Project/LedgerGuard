$ErrorActionPreference = 'Stop'
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/auth/login' -ContentType 'application/json' -Body (@{email='admin@ledgerguard.com';password='Admin@123';tenantId='ledgerguard-platform'} | ConvertTo-Json)
$H = @{ Authorization = 'Bearer ' + $login.data.accessToken }

# 1. Operations queue
try {
  $q = Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/operations/queue' -Headers $H
  Write-Output ("QUEUE: items=" + $q.data.items.Count)
} catch { Write-Output ("QUEUE FAIL: " + $_.Exception.Message) }

# 2. Close dashboard
try {
  $c = Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/operations/close' -Headers $H
  Write-Output ("CLOSE: readiness=" + $c.data.readinessScore + " ready=" + $c.data.readyToClose)
} catch { Write-Output ("CLOSE FAIL: " + $_.Exception.Message) }

# 3. Create exception
try {
  $body = @{ type='failed_payment'; severity='high'; amountMinor=12500; currency='USD'; reason='PSP timeout on charge, needs review' } | ConvertTo-Json
  $e = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/billing/exceptions' -Headers $H -ContentType 'application/json' -Body $body
  Write-Output ("EXCEPTION CREATED: " + $e.data.exception.exceptionId + " status=" + $e.data.exception.status + " sla=" + $e.data.exception.sla.status)
} catch { Write-Output ("EXC CREATE FAIL: " + $_.Exception.Message) }

# 4. List exceptions
try {
  $l = Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/billing/exceptions' -Headers $H
  Write-Output ("EXCEPTIONS LIST: total=" + $l.data.total + " first=" + $l.data.items[0].exceptionId)
} catch { Write-Output ("LIST FAIL: " + $_.Exception.Message) }

# 5. Create API key (company_admin)
try {
  $keyBody = @{ name='E2E test key'; permissions=@('READ','BILLING') } | ConvertTo-Json
  $k = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/developer/api-keys' -Headers $H -ContentType 'application/json' -Body $keyBody
  Write-Output ("APIKEY: " + $k.data.apiKey.keyId + " raw=" + $k.data.rawKey.Substring(0,12) + "...")
} catch { Write-Output ("APIKEY FAIL: " + $_.Exception.Message) }

# 6. Create webhook endpoint (finance_manager)
try {
  $whBody = @{ url='http://localhost:9999/hook'; description='E2E'; events=@('payment.completed','invoice.created') } | ConvertTo-Json
  $w = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/developer/webhooks' -Headers $H -ContentType 'application/json' -Body $whBody
  Write-Output ("WEBHOOK: " + $w.data.endpoint.endpointId + " secret=whsec_...")
} catch { Write-Output ("WEBHOOK FAIL: " + $_.Exception.Message) }

# 7. List webhooks
try {
  $w2 = Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/developer/webhooks' -Headers $H
  Write-Output ("WEBHOOKS LIST: count=" + $w2.data.items.Count)
} catch { Write-Output ("WH LIST FAIL: " + $_.Exception.Message) }

# 8. Viewer RBAC: try to create exception with viewer token -> expect 403
try {
  $vlogin = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/auth/login' -ContentType 'application/json' -Body (@{email='viewer@ledgerguard.com';password='Admin@123';tenantId='ledgerguard-platform'} | ConvertTo-Json)
  $VH = @{ Authorization = 'Bearer ' + $vlogin.data.accessToken }
  try {
    $vb = @{ type='timeout'; amountMinor=100; currency='USD'; reason='x' } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/billing/exceptions' -Headers $VH -ContentType 'application/json' -Body $vb | Out-Null
    Write-Output "RBAC VIEWER-FORBIDDEN: FAIL (viewer was allowed)"
  } catch {
    Write-Output ("RBAC VIEWER-FORBIDDEN: OK status=" + $_.Exception.Response.StatusCode.value__)
  }
} catch { Write-Output ("VIEWER LOGIN FAIL: " + $_.Exception.Message) }
