$cfg = 'c:\Users\priya\Desktop\LedgerGuard\backend\src\config\index.ts'
$seed = 'c:\Users\priya\Desktop\LedgerGuard\backend\src\database\seed.ts'
$login = 'c:\Users\priya\Desktop\LedgerGuard\frontend\src\pages\LoginPage.tsx'
$api = 'c:\Users\priya\Desktop\LedgerGuard\frontend\src\lib\api.ts'

$out = @()
$out += '--- config ---'
Select-String -Path $cfg -Pattern 'DEV_ADMIN_PASSWORD' | ForEach-Object { $out += $_.Line }
Select-String -Path $cfg -Pattern 'Admin@123' | ForEach-Object { $out += $_.Line }
$out += '--- seed ---'
Select-String -Path $seed -Pattern 'verifyPassword\(input|keep it as-is|passwordHash = existing' | ForEach-Object { $out += $_.Line }
$out += '--- login ---'
Select-String -Path $login -Pattern 'Admin@123|account.password' | ForEach-Object { $out += $_.Line }
$out += '--- api ---'
Select-String -Path $api -Pattern 'INVALID_CREDENTIALS|TENANT_NOT_FOUND|Workspace not found|Invalid email or' | ForEach-Object { $out += $_.Line }

Set-Content -Path 'c:\Users\priya\Desktop\LedgerGuard\grep-out.txt' -Value $out
$out
