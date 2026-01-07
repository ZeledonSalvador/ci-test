# Script PowerShell para configurar los secrets de GitHub
# Ejecutar desde el directorio del repositorio

Write-Host "🔐 Configurando secrets de GitHub para notificaciones por email..." -ForegroundColor Cyan
Write-Host ""

# Verificar que estamos en un repositorio git
if (-not (Test-Path ".git")) {
    Write-Host "❌ Error: No estás en un directorio de repositorio git" -ForegroundColor Red
    Write-Host "   Por favor, ejecuta este script desde: c:\Users\salvador.zeledon\Desktop\DevOps\CI-FrontEnd\ci-test" -ForegroundColor Yellow
    exit 1
}

# Verificar que gh CLI está instalado
try {
    $ghVersion = gh --version 2>$null
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✅ GitHub CLI está instalado" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: GitHub CLI (gh) no está instalado" -ForegroundColor Red
    Write-Host "   Descárgalo desde: https://cli.github.com/" -ForegroundColor Yellow
    Write-Host "   O configura los secrets manualmente desde la UI de GitHub" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "📋 Secrets a configurar:" -ForegroundColor Cyan
Write-Host "   1. SMTP_USERNAME = salvador.zeledon@almapac.com"
Write-Host "   2. SMTP_PASSWORD = xVGiC5xyx$"
Write-Host "   3. NOTIFICATION_EMAIL = salvador.zeledo@almapac.com,salvadorzeledon606@gmail.com"
Write-Host ""

# Confirmación
$confirm = Read-Host "¿Deseas continuar? (S/N)"
if ($confirm -ne 'S' -and $confirm -ne 's') {
    Write-Host "❌ Cancelado por el usuario" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "🔧 Configurando secrets..." -ForegroundColor Cyan

# Secret 1: SMTP_USERNAME
Write-Host "   → Configurando SMTP_USERNAME..." -NoNewline
try {
    echo "salvador.zeledon@almapac.com" | gh secret set SMTP_USERNAME
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅" -ForegroundColor Green
    } else {
        throw "Error al configurar SMTP_USERNAME"
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "      Error: $_" -ForegroundColor Red
}

# Secret 2: SMTP_PASSWORD
Write-Host "   → Configurando SMTP_PASSWORD..." -NoNewline
try {
    echo "xVGiC5xyx$" | gh secret set SMTP_PASSWORD
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅" -ForegroundColor Green
    } else {
        throw "Error al configurar SMTP_PASSWORD"
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "      Error: $_" -ForegroundColor Red
}

# Secret 3: NOTIFICATION_EMAIL
Write-Host "   → Configurando NOTIFICATION_EMAIL..." -NoNewline
try {
    echo "salvador.zeledo@almapac.com,salvadorzeledon606@gmail.com" | gh secret set NOTIFICATION_EMAIL
    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✅" -ForegroundColor Green
    } else {
        throw "Error al configurar NOTIFICATION_EMAIL"
    }
} catch {
    Write-Host " ❌" -ForegroundColor Red
    Write-Host "      Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "✅ Configuración completada!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Verifica los secrets en:" -ForegroundColor Cyan
Write-Host "   https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/settings/secrets/actions" -ForegroundColor Yellow
Write-Host ""
Write-Host "🧪 Para probar, haz un commit que cause un error y el workflow enviará un email." -ForegroundColor Cyan
