# 🧪 Guía de Pruebas del Pipeline CI/CD

Esta guía te ayudará a probar cada una de las validaciones importantes del pipeline de manera sistemática.

---

## 📋 Índice de Pruebas

1. [Prueba Inicial - Pipeline Básico](#1-prueba-inicial---pipeline-básico)
2. [Validación de Formato de Código](#2-validación-de-formato-de-código)
3. [Análisis de Código .NET Analyzers](#3-análisis-de-código-net-analyzers)
4. [Escaneo de Seguridad NuGet](#4-escaneo-de-seguridad-nuget)
5. [Validación de JSON](#5-validación-de-json)
6. [Linting de JavaScript](#6-linting-de-javascript)
7. [Análisis de Tamaño de Assets](#7-análisis-de-tamaño-de-assets)
8. [Code Coverage (Cuando tengas tests)](#8-code-coverage)
9. [Build Matrix (Múltiples versiones .NET)](#9-build-matrix)
10. [Resumen y Rendimiento](#10-resumen-y-rendimiento)

---

## 1. Prueba Inicial - Pipeline Básico

### ✅ Objetivo
Verificar que el pipeline se ejecuta completamente sin errores críticos.

### 📝 Pasos

```bash
# 1. Hacer commit del pipeline mejorado
git add .github/workflows/ci-frontend.yml
git commit -m "feat: pipeline CI/CD completo con todas las mejoras"
git push
```

### 🔍 Qué revisar en GitHub Actions

1. Ve a la pestaña **Actions** en GitHub
2. Verifica que el workflow "CI - FrontEnd (.NET 8)" se está ejecutando
3. Espera a que complete (puede tomar 5-10 minutos)

### ✅ Criterios de éxito

- ✅ El pipeline completa sin fallos críticos (puede tener warnings en amarillo)
- ✅ Se generan 3 artefactos:
  - `frontend_publish.zip`
  - `security-scan-results`
  - `code-coverage-report`
- ✅ La pestaña **Summary** muestra un resumen en Markdown
- ✅ El step "Build Performance Analysis" muestra el tiempo total
- ✅ El step "Pipeline Summary" muestra toda la información

---

## 2. Validación de Formato de Código

### ✅ Objetivo
Probar que `dotnet format` detecta problemas de formato en el código C#.

### 📝 Pasos para introducir error de formato

1. Abre el archivo `Controllers/LoginController.cs`
2. Cambia el espaciado en alguna línea, por ejemplo:

**Antes:**
```csharp
public IActionResult Index()
{
    var tokenSesion = Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];
```

**Después (agregar espacios extra):**
```csharp
public IActionResult Index()
{
        var tokenSesion = Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];
```

3. Hacer commit y push:

```bash
git add Controllers/LoginController.cs
git commit -m "test: probar validación de formato de código"
git push
```

### 🔍 Qué revisar en GitHub Actions

1. Ve al step **"Check code formatting"**
2. Deberías ver advertencias sobre formato incorrecto
3. El pipeline continúa (porque tiene `continue-on-error: true`)

### ✅ Criterios de éxito

- ⚠️ El step muestra advertencias de formato
- ✅ El pipeline continúa sin fallar
- 📝 El log muestra qué archivos tienen problemas de formato

### 🔧 Cómo corregir

```bash
# Ejecuta localmente para arreglar automáticamente
dotnet format FrontendQuickpass.sln

# Hacer commit de los cambios
git add .
git commit -m "fix: corregir formato de código"
git push
```

---

## 3. Análisis de Código .NET Analyzers

### ✅ Objetivo
Probar que el análisis estático detecta problemas de calidad en el código.

### 📝 Pasos para introducir un problema

1. Abre el archivo `Controllers/DashboardController.cs`
2. Agrega una variable no utilizada:

```csharp
public IActionResult Index()
{
    var unusedVariable = "Esta variable no se usa";  // ⚠️ Advertencia

    var tokenCookie = Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];
    // ... resto del código
}
```

3. Hacer commit y push:

```bash
git add Controllers/DashboardController.cs
git commit -m "test: probar análisis estático de código"
git push
```

### 🔍 Qué revisar en GitHub Actions

1. Ve al step **"Run .NET Code Analysis"**
2. Busca advertencias sobre variables no utilizadas
3. El pipeline continúa ejecutándose

### ✅ Criterios de éxito

- ⚠️ El step muestra advertencias CS0219 (variable no utilizada)
- ✅ El pipeline continúa sin fallar
- 📝 El log indica la línea exacta del problema

### 🔧 Cómo corregir

Simplemente elimina la variable no utilizada y vuelve a hacer commit.

---

## 4. Escaneo de Seguridad NuGet

### ✅ Objetivo
Verificar que detecta vulnerabilidades en paquetes NuGet.

### 📝 Pasos

**Nota:** Tus paquetes actuales probablemente no tienen vulnerabilidades. Para probar esto:

1. Revisa el step **"Security scan - NuGet packages"** en el pipeline actual
2. Si no hay vulnerabilidades, verás: "✅ No se encontraron vulnerabilidades"

### 🔍 Qué revisar en GitHub Actions

1. Ve al step **"Security scan - NuGet packages"**
2. Verás la salida del comando `dotnet list package --vulnerable`
3. Descarga el artefacto `security-scan-results`

### ✅ Criterios de éxito

- ✅ El step se ejecuta sin errores
- 📝 Se genera el archivo `vulnerable-packages.txt`
- 📦 El artefacto está disponible para descarga

### 🔧 Si hay vulnerabilidades

```bash
# Actualizar paquetes a versiones seguras
dotnet list package --vulnerable
dotnet add package <NombrePaquete> --version <VersionSegura>

git add *.csproj
git commit -m "fix: actualizar paquetes con vulnerabilidades"
git push
```

---

## 5. Validación de JSON

### ✅ Objetivo
Probar que detecta errores de sintaxis en archivos `appsettings.json`.

### 📝 Pasos para introducir error

1. Abre `appsettings.json`
2. Introduce un error de sintaxis (coma extra, comilla faltante, etc.):

**Antes:**
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information"
    }
  }
}
```

**Después (error de sintaxis):**
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
    }
  },
}
```

3. Hacer commit y push:

```bash
git add appsettings.json
git commit -m "test: probar validación de JSON"
git push
```

### 🔍 Qué revisar en GitHub Actions

1. Ve al step **"Validate JSON configuration files"**
2. Deberías ver: "❌ appsettings.json - Error: ..."
3. El pipeline continúa ejecutándose

### ✅ Criterios de éxito

- ❌ El step muestra error en el archivo JSON
- ✅ El pipeline continúa sin fallar
- 📝 El log muestra exactamente qué está mal

### 🔧 Cómo corregir

Corrige el JSON (quita las comas extras) y vuelve a hacer commit.

---

## 6. Linting de JavaScript

### ✅ Objetivo
Probar que ESLint detecta problemas en archivos JavaScript.

### 📝 Pasos para introducir problemas

1. Abre cualquier archivo JS, por ejemplo `wwwroot/js/login.js` (si existe)
2. Introduce problemas comunes:

```javascript
// Problema 1: Variable declarada pero no usada
var unusedVar = "no se usa";

// Problema 2: Usar == en lugar de ===
if (x == 5) {
    console.log("test");
}

// Problema 3: Variable sin declarar
myUndeclaredVar = "test";
```

3. Hacer commit y push:

```bash
git add wwwroot/js/
git commit -m "test: probar linting de JavaScript"
git push
```

### 🔍 Qué revisar en GitHub Actions

1. Ve al step **"JavaScript Linting"**
2. Deberías ver advertencias de ESLint
3. El pipeline continúa ejecutándose

### ✅ Criterios de éxito

- ⚠️ El step muestra advertencias de ESLint
- ✅ El pipeline continúa sin fallar (permite hasta 50 warnings)
- 📝 El log muestra archivo y línea de cada problema

### 🔧 Cómo corregir

Corrige los problemas señalados por ESLint y vuelve a hacer commit.

---

## 7. Análisis de Tamaño de Assets

### ✅ Objetivo
Verificar que analiza el tamaño de archivos estáticos.

### 📝 Pasos

Esta prueba no requiere cambios, solo observar.

### 🔍 Qué revisar en GitHub Actions

1. Ve al step **"Analyze Static Assets Size"**
2. Verás un análisis de:
   - Archivos JavaScript > 50KB
   - Archivos CSS > 50KB
   - Tamaño total de `wwwroot/`

### ✅ Criterios de éxito

- 📊 El step muestra estadísticas de tamaño
- 🎨 Usa colores: Verde (<50KB), Amarillo (50-100KB), Rojo (>100KB)
- 📝 Muestra el top 10 de archivos más grandes

### 💡 Recomendaciones

Si ves archivos muy grandes (>100KB en rojo):
- Considera minificar JavaScript/CSS
- Comprimir imágenes
- Usar lazy loading para assets grandes

---

## 8. Code Coverage

### ✅ Objetivo
Verificar que el sistema de code coverage está listo para cuando agregues tests.

### 📝 Pasos

Actualmente no tienes tests, así que:

1. Ve al step **"Test with Code Coverage (Release)"**
2. Verás que no encuentra proyectos de test (esto es normal)

### 🔍 Qué revisar en GitHub Actions

1. Step **"Test with Code Coverage"**: No falla, solo avisa
2. Step **"Generate Code Coverage Report"**: Muestra "⚠️ No se generó cobertura de código (sin tests)"
3. El artefacto `code-coverage-report` puede estar vacío

### ✅ Criterios de éxito

- ✅ El step no falla (tiene `continue-on-error: true`)
- ⚠️ Muestra advertencia de que no hay tests
- 📝 El log es claro sobre por qué no hay coverage

### 🚀 Cómo habilitar en el futuro

Cuando agregues un proyecto de tests:

```bash
# Crear proyecto de tests
dotnet new xunit -n FrontendQuickpass.Tests
dotnet sln add FrontendQuickpass.Tests/FrontendQuickpass.Tests.csproj
dotnet add FrontendQuickpass.Tests reference FrontendQuickpass

# El pipeline automáticamente detectará y ejecutará los tests
```

---

## 9. Build Matrix

### ✅ Objetivo
Probar el build en múltiples versiones de .NET.

### 📝 Pasos para habilitar

1. Edita `.github/workflows/ci-frontend.yml`
2. Busca la sección de `matrix`:

```yaml
strategy:
  matrix:
    dotnet-version: ['8.0.x']
    # Puedes descomentar la siguiente línea para probar en múltiples versiones:
    # dotnet-version: ['8.0.x', '9.0.x']
```

3. Descomenta y cambia a:

```yaml
strategy:
  matrix:
    dotnet-version: ['8.0.x', '9.0.x']
```

4. Hacer commit y push:

```bash
git add .github/workflows/ci-frontend.yml
git commit -m "test: habilitar build matrix para .NET 8 y 9"
git push
```

### 🔍 Qué revisar en GitHub Actions

1. Verás **2 jobs paralelos** ejecutándose
2. Uno para .NET 8.0.x
3. Otro para .NET 9.0.x

### ✅ Criterios de éxito

- ✅ Ambos jobs se ejecutan en paralelo
- ✅ Cada uno muestra su versión en el resumen
- 📝 El tiempo total es casi el mismo (porque son paralelos)

### 💡 Nota

Si tu proyecto usa características específicas de .NET 8, el build con .NET 9 puede fallar. Esto es esperado y te ayuda a detectar incompatibilidades.

---

## 10. Resumen y Rendimiento

### ✅ Objetivo
Verificar que el resumen final y análisis de rendimiento funcionan.

### 📝 Pasos

No requiere cambios, solo observar.

### 🔍 Qué revisar en GitHub Actions

#### A) En el Step "Build Performance Analysis"
- ⏱️ Muestra hora de inicio y fin
- 📊 Muestra duración en minutos y segundos
- 🎨 Color verde si <5 min, amarillo si 5-10 min, rojo si >10 min

#### B) En el Step "Pipeline Summary (Console)"
- 🔧 Configuración completa
- 📦 Lista de artefactos
- ✅ Lista de validaciones
- 🔗 Información del commit y links

#### C) En la pestaña "Summary" de GitHub Actions
- 📋 Resumen en formato Markdown
- 📊 Tabla de configuración
- ✓ Checklist de validaciones
- 🔗 Links clickeables a commits

### ✅ Criterios de éxito

- ✅ El resumen en consola es completo y legible
- ✅ El GitHub Summary se genera correctamente
- ✅ Todos los links funcionan
- ✅ La duración del build es razonable (<10 minutos)

---

## 📊 Checklist Final de Pruebas

Usa este checklist para ir marcando qué has probado:

- [ ] **Prueba 1:** Pipeline básico funciona
- [ ] **Prueba 2:** Validación de formato detecta problemas
- [ ] **Prueba 3:** Análisis estático detecta code smells
- [ ] **Prueba 4:** Escaneo de seguridad funciona
- [ ] **Prueba 5:** Validación JSON detecta errores
- [ ] **Prueba 6:** Linting JS detecta problemas
- [ ] **Prueba 7:** Análisis de assets muestra tamaños
- [ ] **Prueba 8:** Code coverage está preparado
- [ ] **Prueba 9:** Build matrix funciona (opcional)
- [ ] **Prueba 10:** Resumen y rendimiento son correctos

---

## 🎯 Estrategia de Prueba Recomendada

### Fase 1: Prueba inicial (1 commit)
1. Hacer commit del pipeline nuevo
2. Revisar que todo funciona básicamente

### Fase 2: Pruebas de validación (5-7 commits)
3. Probar validación de formato
4. Probar análisis de código
5. Probar validación JSON
6. Probar linting JS
7. Revisar escaneo de seguridad

### Fase 3: Pruebas avanzadas (2-3 commits)
8. Probar build matrix (opcional)
9. Revisar análisis de assets
10. Validar todos los resúmenes

---

## 🚀 Comandos Útiles

### Ver logs localmente antes de hacer commit

```bash
# Validar formato (verificar sin cambiar)
dotnet format FrontendQuickpass.sln --verify-no-changes

# Aplicar formato automáticamente
dotnet format FrontendQuickpass.sln

# Validar JSON
Get-Content appsettings.json | ConvertFrom-Json

# Ejecutar build con analyzers
dotnet build /p:EnforceCodeStyleInBuild=true

# Escanear vulnerabilidades
dotnet list package --vulnerable

# Linting JS (después de instalarlo)
npx eslint "wwwroot/js/**/*.js"
```

### Revertir cambios de prueba

```bash
# Si metiste errores de prueba y quieres revertir
git checkout -- <archivo>

# O revertir el último commit
git reset --soft HEAD~1
```

---

## 💡 Tips Adicionales

1. **No hagas todos los tests a la vez**: Prueba uno por uno para entender cada validación
2. **Revisa los logs completos**: Haz clic en cada step para ver detalles
3. **Descarga los artefactos**: Revisa especialmente el reporte de seguridad
4. **Usa el GitHub Summary**: Es la forma más rápida de ver el estado general
5. **Mide los tiempos**: Si el pipeline tarda más de 10 minutos, podemos optimizarlo

---

## 🆘 Solución de Problemas

### El pipeline falla completamente
- Revisa el primer step que falló
- Busca mensajes de error en rojo
- Compara con el archivo original del pipeline

### Algún step tarda mucho
- Los steps de npm install y dotnet restore deberían usar cache
- Si el cache no funciona, puede tardar más la primera vez

### No se generan artefactos
- Verifica que el step de "Upload artifact" se ejecutó
- Revisa que los paths de los archivos sean correctos

### El resumen no aparece
- El GitHub Summary solo aparece en la pestaña "Summary" del workflow run
- Asegúrate de estar viendo el run correcto

---

**¡Listo para empezar las pruebas! 🚀**

Cualquier duda durante las pruebas, avísame y te ayudo a resolver.
