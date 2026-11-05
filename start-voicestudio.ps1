# start-voicestudio.ps1
# Inicia o backend VoiceStudio (processo separado, AGPL-3.0-only) se estiver instalado.
# O YAMI NAO redistribui o VoiceStudio; apenas conversa com ele via HTTP/MCP.

$locations = @(
  "C:\Users\$env:USERNAME\Jarvis\VoiceStudio",
  "$env:LOCALAPPDATA\Programs\VoiceStudio",
  "C:\Program Files\VoiceStudio"
)

$found = $locations | Where-Object { Test-Path (Join-Path $_ "jarvis.ps1") } | Select-Object -First 1

if (-not $found) {
  Write-Host "VoiceStudio nao encontrado. Instale-o separadamente (AGPL-3.0-only)."
  Write-Host "O YAMI continua funcionando com voz offline (speechSynthesis)."
  exit 0
}

Write-Host "Iniciando VoiceStudio em $found ..."
& (Join-Path $found "jarvis.ps1") status
Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$found\jarvis.ps1`"","listen" -WindowStyle Hidden
Write-Host "VoiceStudio iniciado. Backend esperado em http://127.0.0.1:3900"
