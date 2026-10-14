import { ConfigError } from './errors'

// Única puerta de entrada a las credenciales de servicios externos: NUNCA hardcodear claves, todo
// sale de variables de entorno (.env.local en desarrollo; en el hosting real, sus "Environment
// Variables"). Si falta una, se falla pronto y con un mensaje claro en vez de dejar que el SDK
// correspondiente lance su propio error genérico más adelante en el pipeline.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new ConfigError(
      `Falta la variable de entorno ${name}. Defínela en .env.local (desarrollo) o en las variables ` +
        `de entorno del hosting (producción) — nunca hardcodeada en el código.`,
    )
  }
  return value
}

export function getGeminiApiKey(): string {
  return requireEnv('GEMINI_API_KEY')
}

export function getTavilyApiKey(): string {
  return requireEnv('TAVILY_API_KEY')
}

// Modelos configurables (no hardcodeados a una versión fija): Flash para tareas más mecánicas
// (extracción OCR, estandarización de recetas), Pro para la que exige más razonamiento (planificar
// la semana cumpliendo las restricciones).
//
// El default de GEMINI_MODEL_PRO es "gemini-2.5-flash" y no un modelo Pro de verdad: probado con
// una clave real de nivel gratuito, "gemini-2.5-pro" devuelve 404 ("no longer available to new
// users") y el sustituto que sugiere el propio error de Google, "gemini-3.1-pro-preview", devuelve
// 429 (cuota 0 en el nivel gratuito). Flash sí respondió correctamente. Si la cuenta tiene acceso
// de verdad a un modelo Pro, fijar GEMINI_MODEL_PRO por variable de entorno para usarlo en el Paso
// 2 (planificación) — es la única llamada donde de verdad importa la diferencia de capacidad.
export const GEMINI_MODEL_FLASH = process.env.GEMINI_MODEL_FLASH || 'gemini-2.5-flash'
export const GEMINI_MODEL_PRO = process.env.GEMINI_MODEL_PRO || 'gemini-2.5-flash'

// Inicio de sesión con Google (server/auth/). AUTH_SECRET firma la cookie de sesión (mínimo 32
// caracteres; generar con `openssl rand -base64 32`). GOOGLE_CLIENT_ID/SECRET salen de una
// credencial "ID de cliente de OAuth" (aplicación web) en Google Cloud Console.
export function getAuthSecret(): string {
  const secret = requireEnv('AUTH_SECRET')
  if (secret.length < 32) throw new ConfigError('AUTH_SECRET debe tener al menos 32 caracteres (openssl rand -base64 32).')
  return secret
}

export function getGoogleClientId(): string {
  return requireEnv('GOOGLE_CLIENT_ID')
}

export function getGoogleClientSecret(): string {
  return requireEnv('GOOGLE_CLIENT_SECRET')
}

// Correo del administrador: el único que entra a /admin y gestiona quién puede acceder a la app. Siempre
// tiene acceso, aunque no esté en la lista. Configurable por ADMIN_EMAIL; por defecto, el del propietario.
// (Ya no existe AUTH_ALLOWED_EMAILS: la lista de acceso vive en la BD y se edita en /admin.)
export const DEFAULT_ADMIN_EMAIL = 'borja.rfp@gmail.com'
export function getAdminEmail(): string {
  return (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase()
}
