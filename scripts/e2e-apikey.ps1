$ErrorActionPreference = 'Stop'
$login = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/auth/login' -ContentType 'application/json' -Body (@{email='admin@ledgerguard.com';password='Admin@123';tenantId='ledgerguard-platform'} | ConvertTo-Json)
$H = @{ Authorization = 'Bearer ' + $login.data.accessToken }

# Create a READ-only API key
$keyBody = @{ name='auth-test'; permissions=@('READ') } | ConvertTo-Json
$k = Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/developer/api-keys' -Headers $H -ContentType 'application/json' -Body $keyBody
$rawKey = $k.data.rawKey
$keyId = $k.data.apiKey.keyId
Write-Output ("CREATED KEY: " + $keyId + " role eager")

# 1. Use the API key to read exceptions (READ scope -> viewer role, read allowed)
try {
  $K = @{ Authorization = 'Bearer ' + $rawKey }
  $r = Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/billing/exceptions' -Headers $K
  Write-Output ("APIKEY READ: OK total=" + $r.data.total)
} catch { Write-Output ("APIKEY READ FAIL: " + $_.Exception.Message) }

# 2. Use READ-only key to CREATE an exception -> should be 403 (viewer cannot mutate)
try {
  $K = @{ Authorization = 'Bearer ' + $rawKey }
  $vb = @{ type='timeout'; amountMinor=100; currency='USD'; reason='x' } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri 'http://localhost:4000/api/billing/exceptions' -Headers $K -ContentType 'application/json' -Body $vb | Out-Null
  Write-Output "APIKEY READ-ONLY WRITE: FAIL (was allowed)"
} catch { Write-Output ("APIKEY READ-ONLY WRITE: OK status=" + $_.Exception.Response.StatusCode.value__) }

# 3. Revoke the key
try {
  Invoke-RestMethod -Method Post -Uri ("http://localhost:4000/api/developer/api-keys/" + $keyId + "/revoke") -Headers $H | Out-Null
  Write-Output "KEY REVOKED"
} catch { Write-Output ("REVOKE FAIL: " + $_.Exception.Message) }

# 4. Use revoked key -> should be 401
try {
  $K = @{ Authorization = 'Bearer ' + $rawKey }
  Invoke-RestMethod -Method Get -Uri 'http://localhost:4000/api/billing/exceptions' -Headers $K | Out-Null
  Write-Output "REVOKED KEY ACCESS: FAIL (was allowed)"
} catch {
  Write-Output ("REVOKED KEY ACCESS: OK status=" + $_.Exception.Response.StatusCode.value__)
}
