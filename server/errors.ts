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
