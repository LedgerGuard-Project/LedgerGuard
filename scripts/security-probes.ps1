$ErrorActionPreference = 'Stop'
$base = 'http://localhost:4000'

function PostJson($uri, $headers, $body) {
  $json = $body | ConvertTo-Json -Depth 10
  try {
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -ContentType 'application/json' -Body $json
  } catch {
    $err = $null
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $err = $_.ErrorDetails.Message }
    else { $err = $_.Exception.Message }
    return @{ __error = $err }
  }
}

function GetJson($uri, $headers) {
  try {
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
  } catch {
    $err = $null
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $err = $_.ErrorDetails.Message }
    else { $err = $_.Exception.Message }
    return @{ __error = $err }
  }
}

# === 1. RBAC: viewer must NOT be able to create payments ===
$vLogin = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email='viewer@ledgerguard.com'; password='Admin@123'; tenantId='ledgerguard-platform' } | ConvertTo-Json)
$vH = @{ Authorization = "Bearer $($vLogin.data.accessToken)" }
$r = PostJson "$base/api/billing/payments" $vH @{ amount=100; currency='INR'; customerId='CUS-x'; paymentMethod='card' }
if ($r.__error -and $r.__error -match '403|FORBIDDEN|INSUFFICIENT_ROLE|ROLE') { Write-Host "RBAC PROBE PASS: viewer denied => $($r.__error)" }
else { Write-Host "RBAC PROBE FAIL: viewer was allowed! $($r | ConvertTo-Json -Depth 5)"; exit 1 }

# === Tenant A setup: one unpaid invoice to attack ===
$aLogin = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email='admin@ledgerguard.com'; password='Admin@123'; tenantId='ledgerguard-platform' } | ConvertTo-Json)
$aH = @{ Authorization = "Bearer $($aLogin.data.accessToken)" }
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$cust = PostJson "$base/api/billing/customers" $aH (@{ name='Probe Customer'; email="probe-$ts@ledgerguard.com"; currency='INR' })
$custId = $cust.data.customer.customerId
$inv = PostJson "$base/api/billing/invoices" $aH (@{ customerId=$custId; currency='INR'; items=@(@{ description='Probe'; quantity=1; unitPrice=5000 }); status='issued'; issueDate='2026-08-24'; dueDate='2026-09-30' })
$invId = $inv.data.invoice.invoiceId
Write-Host "TENANT A target invoice: $invId"

# === 2. Cross-tenant isolation: register tenant B, attack tenant A's invoice ===
$bReg = Invoke-RestMethod -Uri "$base/api/auth/register" -Method Post -ContentType 'application/json' -Body (@{ companyName='Probe Tenant B'; tenantId="probe-b-$ts"; name='B Admin'; email="badmin-$ts@probe.com"; password='Probe@12345' } | ConvertTo-Json)
$bToken = $bReg.data.accessToken
if (-not $bToken) { Write-Host "REGISTER B FAIL: $($bReg | ConvertTo-Json -Depth 5)"; exit 1 }
$bH = @{ Authorization = "Bearer $bToken" }

$r = GetJson "$base/api/billing/invoices/$invId" $bH
if ($r.__error -and $r.__error -match '404|NOT_FOUND') { Write-Host "CROSS-TENANT READ PROBE PASS: tenant B got => $($r.__error)" }
else { Write-Host "CROSS-TENANT READ PROBE FAIL: $($r | ConvertTo-Json -Depth 5)"; exit 1 }

$r = PostJson "$base/api/billing/payments" ($bH + @{'Idempotency-Key'="probe-$ts"}) @{ amount=5000; currency='INR'; customerId=$custId; invoiceId=$invId; paymentMethod='card' }
if ($r.__error -and $r.__error -match '404|403|NOT_FOUND|FORBIDDEN') { Write-Host "CROSS-TENANT PAYMENT PROBE PASS: tenant B got => $($r.__error)" }
else { Write-Host "CROSS-TENANT PAYMENT PROBE FAIL: $($r | ConvertTo-Json -Depth 5)"; exit 1 }

# === 3. Closed-period rejection ===
$mLogin = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email='manager@ledgerguard.com'; password='Admin@123'; tenantId='ledgerguard-platform' } | ConvertTo-Json)
$mH = @{ Authorization = "Bearer $($mLogin.data.accessToken)" }
$per = PostJson "$base/api/billing/financial-periods" $mH (@{ name="Probe Period $ts"; startDate='2026-08-01'; endDate='2026-08-31' })
$perId = $per.data.period.periodId
if (-not $perId) { Write-Host "PERIOD CREATE FAIL: $($per | ConvertTo-Json -Depth 5)"; exit 1 }
$closeRes = PostJson "$base/api/billing/financial-periods/$perId/close" $mH @{}
Write-Host "PERIOD CLOSED: $perId"
$r = PostJson "$base/api/billing/payments" ($aH + @{'Idempotency-Key'="probe-pay-$ts"}) @{ amount=5000; currency='INR'; customerId=$custId; invoiceId=$invId; paymentMethod='card' }
if ($r.__error -and $r.__error -match 'CLOSED|PERIOD') { Write-Host "CLOSED-PERIOD PROBE PASS: payment rejected => $($r.__error)" }
else { Write-Host "CLOSED-PERIOD PROBE FAIL: $($r | ConvertTo-Json -Depth 5)"; exit 1 }
# cleanup: reopen so the environment stays usable
$reopen = PostJson "$base/api/billing/financial-periods/$perId/reopen" $aH @{}
Write-Host "PERIOD REOPENED (cleanup): $((GetJson "$base/api/billing/financial-periods/$perId" $aH).data.period.status)"

Write-Host '=== ALL SECURITY PROBES PASSED ==='
