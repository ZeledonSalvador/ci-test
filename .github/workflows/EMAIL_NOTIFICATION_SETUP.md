# Configuración de Notificaciones por Email en CI Frontend

## 📧 Resumen
El workflow de CI Frontend ahora envía correos automáticos cuando el build falla, incluyendo:
- Información del commit y branch que causó el error
- Tabla con exit codes de todos los pasos
- Diagnóstico automático de la causa probable
- Links directos a logs y acciones recomendadas

---

## ⚙️ Configuración de Secrets en GitHub

Para que las notificaciones funcionen, necesitas configurar 3 secrets en tu repositorio de GitHub:

### 1. Ir a Settings > Secrets and variables > Actions

### 2. Crear los siguientes Repository Secrets:

#### **SMTP_USERNAME**
- El email desde el cual se enviarán las notificaciones
- Ejemplo: `tu-email@gmail.com`

#### **SMTP_PASSWORD**
- La contraseña de aplicación (NO la contraseña normal de tu cuenta)
- Para Gmail, necesitas generar una "App Password" (ver instrucciones abajo)

#### **NOTIFICATION_EMAIL**
- El email o emails donde quieres recibir las notificaciones
- Puedes usar múltiples emails separados por comas: `email1@company.com,email2@company.com`

---

## 📮 Configuración para Gmail (Recomendado)

### Paso 1: Habilitar autenticación de 2 factores
1. Ve a tu cuenta de Google: https://myaccount.google.com/security
2. En "Inicio de sesión en Google", habilita la "Verificación en dos pasos"

### Paso 2: Generar contraseña de aplicación
1. Ve a: https://myaccount.google.com/apppasswords
2. Selecciona "Correo" y "Windows Computer" (o el que prefieras)
3. Haz clic en "Generar"
4. Copia la contraseña generada (16 caracteres)
5. Usa esta contraseña como valor del secret `SMTP_PASSWORD`

### Configuración de secrets para Gmail:
```
SMTP_USERNAME: tu-email@gmail.com
SMTP_PASSWORD: xxxx xxxx xxxx xxxx (la contraseña de aplicación generada)
NOTIFICATION_EMAIL: destinatario@company.com
```

---

## 📮 Configuración para Outlook/Office 365

Si prefieres usar Outlook, modifica estos valores en el workflow:

```yaml
server_address: smtp.office365.com
server_port: 587
```

Y configura los secrets:
```
SMTP_USERNAME: tu-email@outlook.com
SMTP_PASSWORD: tu-contraseña-de-aplicación
NOTIFICATION_EMAIL: destinatario@company.com
```

---

## 📮 Configuración para otros proveedores SMTP

Puedes usar cualquier servidor SMTP. Modifica en el workflow:

```yaml
server_address: smtp.tu-servidor.com
server_port: 587  # o 465 para SSL
```

### Ejemplos de servidores SMTP comunes:
- **Gmail**: `smtp.gmail.com:587`
- **Outlook**: `smtp.office365.com:587`
- **Yahoo**: `smtp.mail.yahoo.com:587`
- **SendGrid**: `smtp.sendgrid.net:587`
- **Mailgun**: `smtp.mailgun.org:587`

---

## ✅ Verificación

### Cómo probar que funciona:

1. Configura los 3 secrets en GitHub
2. Introduce un error intencional (por ejemplo, en el código)
3. Haz commit y push a `main`
4. El workflow fallará y recibirás un email con:
   - Subject: `❌ CI Frontend falló - [tu-repo] [main]`
   - Información detallada del error
   - Links clickeables a los logs

---

## 🔒 Seguridad

- ✅ Los secrets NUNCA se muestran en los logs del workflow
- ✅ Solo los administradores del repositorio pueden ver/editar secrets
- ✅ Usa contraseñas de aplicación, NO tu contraseña personal
- ✅ La acción `dawidd6/action-send-mail` es de confianza y ampliamente usada

---

## 🎨 Personalización del correo

Si quieres modificar el contenido del email, edita la sección `html_body` en el step "Send failure notification email" del workflow.

Puedes agregar:
- Más información de diagnóstico
- Links adicionales
- Cambiar el formato/colores
- Agregar logos o imágenes

---

## 🐛 Troubleshooting

### El correo no se envía:
1. Verifica que los 3 secrets estén configurados correctamente
2. Verifica que la contraseña sea la "App Password", no tu contraseña normal
3. Revisa los logs del step "Send failure notification email"
4. Asegúrate de que el servidor SMTP permite conexiones desde GitHub (IPs externas)

### Gmail bloquea el envío:
- Verifica que tengas 2FA habilitado
- Usa una contraseña de aplicación, no tu contraseña normal
- Gmail puede bloquear el primer intento, revisa tu email de seguridad

### Quiero recibir notificaciones en múltiples correos:
- En `NOTIFICATION_EMAIL`, separa los emails con comas:
  ```
  email1@company.com,email2@company.com,email3@company.com
  ```

---

## 📝 Notas adicionales

- Las notificaciones **solo se envían cuando el workflow falla**
- Si quieres notificaciones de éxito también, puedes duplicar el step con `if: success()`
- El step de notificación se ejecuta **antes** del gate final, asegurando que siempre se envíe
- El correo incluye HTML formateado para mejor legibilidad

---

## 🔗 Referencias

- Action utilizada: https://github.com/dawidd6/action-send-mail
- Gmail App Passwords: https://support.google.com/accounts/answer/185833
- GitHub Secrets: https://docs.github.com/en/actions/security-guides/encrypted-secrets
