// Errores tipados del backend. Cada uno sabe a qué código HTTP / forma de respuesta se traduce
// (ver toErrorResponse en http.ts), para que las rutas no tengan que adivinar caso a caso.

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export class ValidationError extends Error {
  issues?: unknown
  constructor(message: string, issues?: unknown) {
    super(message)
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

// Fallo de un servicio externo (Gemini o Tavily): la API respondió con error, con una forma
// inesperada, o no respondió output utilizable.
export class UpstreamApiError extends Error {
  provider: 'gemini' | 'tavily'
  cause_?: unknown
  constructor(provider: 'gemini' | 'tavily', message: string, cause?: unknown) {
    super(message)
    this.name = 'UpstreamApiError'
    this.provider = provider
    this.cause_ = cause
  }
}

// Sin sesión válida (cookie ausente, caducada o manipulada) → 401.
export class UnauthorizedError extends Error {
  constructor(message = 'Inicia sesión para continuar.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

// Hay sesión pero ninguna familia activa (tiene varias y no ha elegido) → 409. El cliente reacciona
// llevando al selector de familia.
export class FamilyRequiredError extends Error {
  constructor(message = 'Elige una familia para continuar.') {
    super(message)
    this.name = 'FamilyRequiredError'
  }
}

// Hay sesión, pero esa persona no puede hacer esto → 403. `code` distingue "ya no tienes acceso a la app"
// ('access_revoked': el cliente cierra la sesión y manda al login) de "esto es solo del administrador"
// ('forbidden').
export class ForbiddenError extends Error {
  code: 'access_revoked' | 'forbidden'
  constructor(message: string, code: 'access_revoked' | 'forbidden' = 'forbidden') {
    super(message)
    this.name = 'ForbiddenError'
    this.code = code
  }
}
