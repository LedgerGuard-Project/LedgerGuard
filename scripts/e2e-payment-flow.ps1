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
    Write-Host "API ERROR $uri => $err"
    throw $_
  }
}

function GetJson($uri, $headers) {
  try {
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method Get
  } catch {
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { throw $_.ErrorDetails.Message }
    throw $_.Exception.Message
  }
}

# --- Login ---
$login = Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email='admin@ledgerguard.com'; password='Admin@123'; tenantId='ledgerguard-platform' } | ConvertTo-Json)
$token = $login.data.accessToken
$h = @{ Authorization = "Bearer $token" }
Write-Host "LOGGED IN as $($login.data.user.role)"

# --- Create customer ---
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$cust = PostJson "$base/api/billing/customers" $h (@{ name='E2E Audit Customer'; email="e2e-$ts@ledgerguard.com"; currency='INR' })
$customerId = $cust.data.customer.customerId
Write-Host "CUSTOMER $customerId"

# --- Create invoice = INR 10000 ---
$invoice = PostJson "$base/api/billing/invoices" $h (@{
  customerId = $customerId
  currency = 'INR'
  items = @(@{ description='Enterprise License'; quantity=1; unitPrice=10000; taxRate=0 })
  status = 'issued'
  issueDate = '2026-08-22'
  dueDate = '2026-09-30'
})
$invoiceId = $invoice.data.invoice.invoiceId
$totalMinor = $invoice.data.invoice.totalMinor
Write-Host "INVOICE $invoiceId totalMinor=$totalMinor"

# --- Payment (idempotency key via header + body) ---
$key = "E2E-PAY-$ts"
$hPay = @{ Authorization = "Bearer $token"; 'Idempotency-Key' = $key }
$pay = PostJson "$base/api/billing/payments" $hPay @{
  amount = 10000
  currency = 'INR'
  customerId = $customerId
  invoiceId = $invoiceId
  paymentMethod = 'card'
  idempotencyKey = $key
}
if ($pay.data.status -ne 'completed') { Write-Host "PAYMENT FAILED: $($pay | ConvertTo-Json -Depth 6)"; exit 1 }
$payStatus = $pay.data.status
$payTxn = $pay.data.transaction.transactionId
Write-Host "PAYMENT OK status=$payStatus txn=$payTxn"

# --- Replay same idempotency key ---
$replay = PostJson "$base/api/billing/payments" $hPay (@{
  amount = 10000
  currency = 'INR'
  customerId = $customerId
  invoiceId = $invoiceId
  paymentMethod = 'card'
  idempotencyKey = $key
})
$replayWasReplay = $replay.data.replay
Write-Host "REPLAY replay=$replayWasReplay"

# --- Invoice status after payment ---
$invAfter = GetJson "$base/api/billing/invoices/$invoiceId" $h
Write-Host "INVOICE STATUS AFTER PAYMENT = $($invAfter.data.invoice.status)"

# --- Refund 4000 ---
$refund = PostJson "$base/api/billing/payments/$payTxn/refund" $h (@{
  amount = 4000
  currency = 'INR'
  reference = "REF-$key"
})
Write-Host "REFUND OK txn=$($refund.data.transaction.transactionId)"

# --- Over-refund 7000 (should be rejected) ---
try {
  PostJson "$base/api/billing/payments/$payTxn/refund" $h (@{ amount = 7000; currency = 'INR' })
  Write-Host "OVER-REFUND UNEXPECTEDLY SUCCEEDED"
} catch {
  Write-Host "OVER-REFUND rejected (expected)"
}

# --- Ledger check ---
$ledger = GetJson "$base/api/billing/ledger?perPage=50" $h
$chargeEntries = $ledger.data.items | Where-Object { $_.type -eq 'charge' -and $_.customerId -eq $customerId }
$refundEntries = $ledger.data.items | Where-Object { $_.type -eq 'refund' -and $_.customerId -eq $customerId }
Write-Host "LEDGER charges=$(($chargeEntries | Measure-Object).Count) refunds=$(($refundEntries | Measure-Object).Count)"

Write-Host "=== E2E FLOW COMPLETE ==="