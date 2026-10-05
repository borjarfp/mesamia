import type { DayName, FinalDish, HistoryEntry, MealChange, MealSlot, RuleViolation, SchoolMenuExtraction, ShoppingList, WeekPlan } from '@/server/types'
import { testModeHeaders } from '@/lib/test-mode'

// Cliente HTTP del frontend hacia app/api/**. Cada función hace exactamente una llamada y devuelve
// ya tipado el `data` de la respuesta — el manejo de error (parsear { error: { code, message } } y
// convertirlo en una excepción con mensaje legible) está centralizado aquí, no repetido en cada
// componente que llama a la API.
export class ApiError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

// Todas las llamadas pasan por aquí para añadir la cabecera del modo pruebas (lib/test-mode.ts)
// cuando está activo: el servidor entonces no llama a Gemini ni a Tavily.
function apiFetch(url: string, init: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  return fetch(url, { ...init, headers: { ...testModeHeaders(), ...init.headers } })
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.error?.message ?? `Error inesperado (${response.status}).`
    throw new ApiError(message, body?.error?.code)
  }
  return body as T
}

export type SchoolMenuUpload = { child: string; files: File[] }

// POST /api/menus/plan — pipeline completo (Pasos 1-4) a partir de los archivos subidos. Con
// `weekStart`, el servidor añade como contexto las 3 semanas guardadas anteriores a esa.
export async function planFullWeek(uploads: SchoolMenuUpload[], weekStart?: string): Promise<{ schoolMenu: SchoolMenuExtraction; week: WeekPlan; violations: RuleViolation[] }> {
  const formData = new FormData()
  for (const upload of uploads) for (const file of upload.files) formData.append(upload.child, file)
  if (weekStart) formData.append('weekStart', weekStart)
  const response = await apiFetch('/api/menus/plan', { method: 'POST', body: formData })
  return parseOrThrow(response)
}

// POST /api/menus/generate — Pasos 2-4 a partir de un menú escolar ya conocido. Ahora mismo no lo
// usa ninguna pantalla (el botón "Probar con un menú de ejemplo" se quitó), se mantiene como cliente
// del endpoint.
export async function generateFromSchoolMenu(schoolMenu: SchoolMenuExtraction, weekStart?: string): Promise<{ week: WeekPlan; violations: RuleViolation[] }> {
  const response = await apiFetch('/api/menus/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolMenu, weekStart }),
  })
  return parseOrThrow(response)
}

// POST /api/menus/substitute — alternativas reales para un único hueco ("Cambiar").
export async function substituteDish(input: { day: DayName; meal: MealSlot; currentWeek: WeekPlan; schoolMenu?: SchoolMenuExtraction; count?: number; weekStart?: string }): Promise<{ alternatives: FinalDish[]; violations: RuleViolation[] }> {
  const response = await apiFetch('/api/menus/substitute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseOrThrow(response)
}

// POST /api/history — "Confirmar planificación".
// `changes`: qué huecos cambió la familia respecto a la propuesta de la IA (aprendizaje de gustos).
export async function saveHistoryEntry(label: string, week: WeekPlan, weekStart?: string, changes?: MealChange[]): Promise<{ entry: HistoryEntry }> {
  const response = await apiFetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, weekStart, week, changes }),
  })
  return parseOrThrow(response)
}

// GET /api/history — listado de Guardados.
export async function listHistory(): Promise<{ entries: HistoryEntry[] }> {
  const response = await apiFetch('/api/history', { cache: 'no-store' })
  return parseOrThrow(response)
}

// DELETE /api/history/[id] — borra una semana guardada (y sus recetas si ninguna otra semana las usa).
export async function deleteHistoryEntry(id: string): Promise<void> {
  const response = await apiFetch(`/api/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseOrThrow(response)
}

// GET /api/history/context — qué semanas anteriores (y en qué texto) verá la IA al planificar.
export async function getTasteContext(weekStart?: string): Promise<{ weeks: Array<{ id: string; label: string; weekStart?: string }>; text: string; instructions: string }> {
  const response = await apiFetch(`/api/history/context${weekStart ? `?weekStart=${weekStart}` : ''}`, { cache: 'no-store' })
  return parseOrThrow(response)
}

// POST /api/history/[id]/shopping-list — la lista de la compra de una semana guardada (la genera la primera vez; con `regenerate` la rehace).
export async function getShoppingList(id: string, regenerate = false): Promise<{ shoppingList: ShoppingList }> {
  const response = await apiFetch(`/api/history/${encodeURIComponent(id)}/shopping-list${regenerate ? '?regenerate=1' : ''}`, { method: 'POST' })
  return parseOrThrow(response)
}
