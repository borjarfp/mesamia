import type { FamilyRules } from '@/server/rules/family-rules'
import type { DayName, Family, FinalDish, HistoryEntry, MealChange, MealSlot, RuleViolation, SchoolMenuExtraction, ShoppingList, WeekPlan } from '@/server/types'
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
  if (response.status === 401 && typeof window !== 'undefined') window.location.assign('/login')
  // Hay sesión pero ninguna familia activa (varias y sin elegir, o la elegida ya no es suya).
  if (response.status === 409 && body?.error?.code === 'family_required' && typeof window !== 'undefined') window.location.assign('/familias/seleccionar')
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

// --- Familias (/api/families) ------------------------------------------------------------------

// GET /api/families — las familias de la persona y el id de la activa (null si hay que elegir).
export async function listFamilies(): Promise<{ families: Family[]; activeId: string | null }> {
  const response = await apiFetch('/api/families', { cache: 'no-store' })
  return parseOrThrow(response)
}

// POST /api/families — crea una familia (con quien la crea como único miembro).
export async function createFamily(name: string): Promise<{ family: Family }> {
  const response = await apiFetch('/api/families', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
  return parseOrThrow(response)
}

// PATCH /api/families/[id] — lo único editable: el nombre y los correos con acceso (lista completa).
export async function updateFamily(id: string, input: { name: string; members: string[] }): Promise<{ family: Family }> {
  const response = await apiFetch(`/api/families/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  return parseOrThrow(response)
}

// DELETE /api/families/[id] — borra la familia y sus semanas (siempre queda al menos una).
export async function deleteFamily(id: string): Promise<void> {
  const response = await apiFetch(`/api/families/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseOrThrow(response)
}

// POST /api/families/select — elige la familia activa.
export async function selectFamily(familyId: string): Promise<{ family: Family }> {
  const response = await apiFetch('/api/families/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ familyId }) })
  return parseOrThrow(response)
}

// --- Reglas del menú de la familia -------------------------------------------------------------

// GET /api/rules — las reglas de la familia ACTIVA (para el RulesPanel).
export async function getActiveRules(): Promise<{ familyId: string; familyName: string; rules: FamilyRules }> {
  const response = await apiFetch('/api/rules', { cache: 'no-store' })
  return parseOrThrow(response)
}

// GET /api/families/[id]/rules — las reglas de una familia (para editarlas en el perfil).
export async function getFamilyRules(id: string): Promise<{ rules: FamilyRules }> {
  const response = await apiFetch(`/api/families/${encodeURIComponent(id)}/rules`, { cache: 'no-store' })
  return parseOrThrow(response)
}

// PUT /api/families/[id]/rules — guarda las reglas completas de la familia.
export async function saveFamilyRules(id: string, rules: FamilyRules): Promise<{ rules: FamilyRules }> {
  const response = await apiFetch(`/api/families/${encodeURIComponent(id)}/rules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rules) })
  return parseOrThrow(response)
}
