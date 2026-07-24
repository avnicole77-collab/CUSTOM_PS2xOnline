$ErrorActionPreference = 'Stop'
Get-ChildItem -Path . -Directory -Recurse -Force | Where-Object { $_.Name -in @('bin','obj','publish') } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'Clean completed.'
