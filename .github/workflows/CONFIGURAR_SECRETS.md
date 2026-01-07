# 🔐 Configuración de Secrets para Notificaciones por Email

## ✅ Workflow configurado para Office 365

El workflow ya está configurado para usar **smtp.office365.com** (Outlook corporativo).

---

## 📋 Secrets a configurar en GitHub

Debes agregar estos 3 secrets en tu repositorio de GitHub:

### 1️⃣ SMTP_USERNAME
```
salvador.zeledon@almapac.com
```

### 2️⃣ SMTP_PASSWORD
```
xVGiC5xyx$
```

### 3️⃣ NOTIFICATION_EMAIL
```
salvador.zeledo@almapac.com,salvadorzeledon606@gmail.com
```

---

## 🛠️ Pasos para agregar los secrets en GitHub

### Opción A: Desde la interfaz web de GitHub

1. Ve a tu repositorio en GitHub
2. Click en **Settings** (Configuración)
3. En el menú lateral izquierdo, click en **Secrets and variables** > **Actions**
4. Click en el botón verde **New repository secret**
5. Agrega cada secret:

   **Secret 1:**
   - Name: `SMTP_USERNAME`
   - Secret: `salvador.zeledon@almapac.com`
   - Click **Add secret**

   **Secret 2:**
   - Name: `SMTP_PASSWORD`
   - Secret: `xVGiC5xyx$`
   - Click **Add secret**

   **Secret 3:**
   - Name: `NOTIFICATION_EMAIL`
   - Secret: `salvador.zeledo@almapac.com,salvadorzeledon606@gmail.com`
   - Click **Add secret**

### Opción B: Usando GitHub CLI (gh)

Si tienes GitHub CLI instalado, puedes ejecutar estos comandos desde la terminal:

```bash
# Asegúrate de estar en el directorio del repositorio
cd c:\Users\salvador.zeledon\Desktop\DevOps\CI-FrontEnd\ci-test

# Agregar los secrets
gh secret set SMTP_USERNAME -b"salvador.zeledon@almapac.com"
gh secret set SMTP_PASSWORD -b"xVGiC5xyx$"
gh secret set NOTIFICATION_EMAIL -b"salvador.zeledo@almapac.com,salvadorzeledon606@gmail.com"
```

---

## ✅ Verificar que los secrets estén configurados

1. Ve a Settings > Secrets and variables > Actions
2. Deberías ver los 3 secrets listados:
   - ✅ SMTP_USERNAME
   - ✅ SMTP_PASSWORD
   - ✅ NOTIFICATION_EMAIL

**Nota:** Por seguridad, GitHub no muestra el valor de los secrets, solo el nombre.

---

## 🧪 Probar las notificaciones

Para verificar que todo funciona:

1. **Haz un commit con un error intencional:**
   ```bash
   # Por ejemplo, agrega un error de sintaxis en algún archivo .cs
   # O modifica el workflow para que falle
   ```

2. **Haz push a la rama main**

3. **El workflow fallará y enviará un email a:**
   - salvador.zeledo@almapac.com
   - salvadorzeledon606@gmail.com

4. **Verifica tu bandeja de entrada**

---

## ⚠️ Troubleshooting

### El correo no se envía:

1. **Verifica que los secrets estén bien escritos** (sin espacios extras)
2. **Revisa los logs del step "Send failure notification email"**
3. **Verifica que la contraseña sea correcta**
4. **Asegúrate de que la cuenta puede enviar desde aplicaciones externas:**
   - Ve a https://outlook.office.com/mail/options/mail/accounts
   - O contacta a tu administrador de TI si hay restricciones

### El correo llega a spam:

- Revisa tu carpeta de spam/correo no deseado
- Marca el correo como "No es spam"
- Agrega "GitHub Actions" o la dirección remitente a tu lista de remitentes seguros

### Error de autenticación:

Si el workflow falla con error de autenticación:
1. Verifica que la contraseña sea correcta
2. Si tu cuenta tiene MFA (autenticación multifactor), puede que necesites una contraseña de aplicación
3. Contacta a tu administrador de TI para verificar que tu cuenta puede autenticarse vía SMTP

---

## 📧 Destinatarios configurados

El email de notificación se enviará a:
- ✉️ salvador.zeledo@almapac.com (Outlook corporativo)
- ✉️ salvadorzeledon606@gmail.com (Gmail personal)

---

## 🔒 Seguridad

- ✅ Los secrets están encriptados por GitHub
- ✅ No se muestran en los logs del workflow
- ✅ Solo los administradores del repositorio pueden verlos/editarlos
- ✅ Cada secret tiene acceso limitado solo a este repositorio

---

## 📝 Nota importante

**NOTA:** Observé que escribiste `salvador.zeledo@almapac.com` en el destinatario.
Verifica si es correcto o debería ser `salvador.zeledon@almapac.com` (con 'n').

Si necesitas corregirlo, simplemente actualiza el secret `NOTIFICATION_EMAIL` con el email correcto.

---

## ✨ ¡Listo!

Una vez configurados los secrets, el workflow enviará automáticamente notificaciones por email cada vez que falle el build.

El email incluirá:
- 📋 Información del commit y branch
- 🔍 Tabla con exit codes de todos los pasos
- 📊 Diagnóstico automático del problema
- 🔗 Links directos a logs y acciones recomendadas
