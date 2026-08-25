# Stops STALE LedgerGuard development processes that occupy the well-known
# dev ports (backend 4000, frontend 5173/5174) so that `npm run dev` never
# fails with EADDRINUSE.
#
# SAFETY: a process is only stopped when BOTH conditions hold:
#   1. it is actively LISTENING on one of the LedgerGuard dev ports, and
#   2. its command line references this LedgerGuard checkout
# Unrelated applications on those ports are left untouched, and the running
# script's own ancestry is explicitly excluded.

param(
    # Ports guarded against stale LedgerGuard listeners. Override per caller:
    # root npm run dev guards all dev ports; the backend workspace hook guards
    # only 4000 so it can never kill its sibling frontend during startup.
    [int[]]$Ports = @(4000, 5173, 5174)
)

$ErrorActionPreference = 'SilentlyContinue'

$killed  = 0

# Ancestor IDs of this script - never kill our own parents/grandparents.
$selfAncestry = New-Object System.Collections.Generic.HashSet[int]
$cursor = $PID
while ($cursor -and $cursor -ne 0) {
    [void]$selfAncestry.Add($cursor)
    $cursor = (Get-CimInstance Win32_Process -Filter "ProcessId=$cursor").ParentProcessId
}

foreach ($port in $ports) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $listeners) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid"
        if (-not $proc -or $proc.Name -notmatch '^node\.exe$') { continue }
        if ($proc.CommandLine -notmatch 'LedgerGuard') { continue }
        if ($selfAncestry.Contains($ownerPid)) { continue }

        # Collect this listener's ancestor chain (npm -> node wrappers) while
        # they belong to LedgerGuard, so watchers cannot respawn the server.
        $tree = New-Object System.Collections.Generic.HashSet[int]
        [void]$tree.Add($ownerPid)
        $walk = $proc.ParentProcessId
        while ($walk -and $walk -ne 0 -and -not $selfAncestry.Contains($walk)) {
            $anc = Get-CimInstance Win32_Process -Filter "ProcessId=$walk"
            if (-not $anc -or $anc.CommandLine -notmatch 'LedgerGuard|node|cmd') { break }
            [void]$tree.Add($walk)
            $walk = $anc.ParentProcessId
        }
        foreach ($tPid in $tree) { Stop-Process -Id $tPid -Force -ErrorAction SilentlyContinue }
        $killed += $tree.Count
        Write-Host ("Stopped stale LedgerGuard process(es) on port " + $port + ": " + (($tree | Sort-Object) -join ', '))
    }
}

if ($killed -eq 0) { Write-Host 'No stale LedgerGuard processes found.' }
