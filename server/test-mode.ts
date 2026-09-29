import { AsyncLocalStorage } from 'node:async_hooks'
import { TEST_MODE_HEADER } from '@/lib/test-mode-constants'

// Modo pruebas en el servidor: si la petición trae la cabecera TEST_MODE_HEADER (la pone
// lib/api.ts cuando la URL tenía ?pruebas=1), todo lo que se ejecute dentro de withTestMode()
// ve isTestMode() === true. No hay que pasar un flag por todo el pipeline: lo consultan solo los
// dos puntos de salida a servicios externos (server/clients/gemini.ts y tavily.ts, que devuelven
// datos de prueba de server/testing/) y el historial (server/history/store.ts, que usa otro
// fichero). Todo lo demás — motor de reglas, reintentos, elección de receta, ensamblado — corre
// exactamente igual.
const storage = new AsyncLocalStorage<boolean>()

export function isTestMode(): boolean {
  return storage.getStore() === true
}

export function runWithTestMode<T>(enabled: boolean, fn: () => Promise<T>): Promise<T> {
  return storage.run(enabled, fn)
}

// Para las rutas de app/api/**: `return withTestMode(request, async () => { ... })`.
export function withTestMode<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  return runWithTestMode(request.headers.get(TEST_MODE_HEADER) === '1', fn)
}
