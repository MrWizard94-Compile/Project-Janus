param(
  [string]$JavaPath = "java"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
  pnpm build
  node packages/cli/dist/bin.js setup jdtls --java $JavaPath
}
finally {
  Pop-Location
}