# Configuración de GitHub

## Pasos completados ✅

1. ✅ Repositorio inicializado y código commiteado
2. ✅ GitHub Actions configurados:
   - `.github/workflows/generate-and-deploy.yml` - Deploy automático
   - `.github/workflows/refresh-on-demand.yml` - Sincronización manual

## Próximos pasos en GitHub

### 1. Subir código al repositorio

```bash
git push -u origin main
```

⚠️ **Nota**: Si el repositorio ya existe en GitHub, puede que necesites hacer `git pull origin main --allow-unrelated-histories` primero.

### 2. Configurar Secrets en GitHub

Ve a: **Settings → Secrets and variables → Actions → New repository secret**

Crea los siguientes secrets:

| Name | Value |
|------|-------|
| `AGILETEST_AUTH_BASE_URL` | `https://agiletest.atlas.devsamurai.com` |
| `AGILETEST_API_BASE_URL` | `https://agiletest.atlas.devsamurai.com` |
| `AGILETEST_CLIENT_ID` | Tu client ID de AgileTest |
| `AGILETEST_CLIENT_SECRET` | Tu client secret de AgileTest |
| `AGILETEST_PROJECT_ID` | `10033` (o tu project ID) |
| `JIRA_BASE_URL` | `https://dgomezpaiscorral.atlassian.net` |

### 3. Habilitar GitHub Pages

1. Ve a **Settings → Pages**
2. En **Source**, selecciona: **GitHub Actions**
3. El workflow se ejecutará automáticamente al hacer push

### 4. Verificar el despliegue

Después del primer push:
- Ve a **Actions** tab
- Verás el workflow "Generate & Deploy to GitHub Pages" ejecutándose
- Cuando termine (verde ✅), tu sitio estará en: 
  ```
  https://a1varoG1z.github.io/gherkin-dictionary/
  ```

## Funcionalidades configuradas

### 🕐 Actualización automática diaria
- **Cuándo**: Todos los días a las 23:00 UTC (00:00 CET en invierno, 01:00 CEST en verano)
- **Qué hace**: Re-genera `data.json` desde AgileTest y redespliega
- **Cómo verificar**: Mira en Actions → Scheduled runs

### 🔄 Sincronización manual desde GitHub
- **Dónde**: Actions tab → "Generate & Deploy to GitHub Pages" → Run workflow
- **Cuándo usarlo**: Cuando quieras actualizar inmediatamente sin esperar al schedule

### 🔄 Sincronización desde el HTML (botón Sync)
El botón "🔄 Sync" en la interfaz permite:
1. Click en el botón
2. Ingresa tu GitHub Personal Access Token (PAT) cuando te lo pida
3. El workflow `refresh-on-demand.yml` se activa
4. Espera 2-3 minutos y recarga la página

**Para que funcione el botón Sync, necesitas**:
1. Crear un Personal Access Token:
   - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token
   - Scope: Marcar `repo` (Full control of private repositories)
   - Copiar el token
2. En la página HTML, click "🔄 Sync"
3. Pegar el token cuando te lo pida (se guarda en localStorage del navegador)

## Ajustes del horario

Si quieres cambiar el horario del schedule diario, edita `.github/workflows/generate-and-deploy.yml`:

```yaml
schedule:
  - cron: '0 23 * * *'  # 23:00 UTC = 00:00 CET
```

Formato cron: `minuto hora día mes día_semana`
- `0 22 * * *` = 22:00 UTC (23:00 CET en invierno)
- `0 0 * * *` = 00:00 UTC (01:00 CET en invierno)

## Troubleshooting

### El workflow falla con error de autenticación
- Verifica que todos los secrets estén configurados correctamente
- Asegúrate que el CLIENT_ID y CLIENT_SECRET sean válidos

### El botón Sync no funciona
1. Verifica que el PAT tenga scope `repo`
2. Verifica en la consola del navegador (F12) si hay errores
3. El workflow tarda ~2-3 minutos en completar, no es instantáneo

### GitHub Pages muestra 404
1. Espera 1-2 minutos después del primer deploy
2. Verifica que Pages esté habilitado en Settings → Pages
3. Verifica que el workflow haya terminado exitosamente (verde ✅)

### El data.json no se actualiza
- Verifica los logs del workflow en Actions tab
- Asegúrate que las credenciales de AgileTest sean correctas
