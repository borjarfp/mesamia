import type { DayName, FinalDish, HistoryEntry, HistorySummary, MealSlot, RuleViolation, SchoolMenuExtraction, WeekPlan } from '@/server/types'

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

async function parseOrThrow<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.error?.message ?? `Error inesperado (${response.status}).`
    throw new ApiError(message, body?.error?.code)
  }
  return body as T
}

export type SchoolMenuUpload = { child: string; files: File[] }

// POST /api/menus/plan — pipeline completo (Pasos 1-4) a partir de los archivos subidos.
export async function planFullWeek(uploads: SchoolMenuUpload[], history?: HistorySummary[]): Promise<{ schoolMenu: SchoolMenuExtraction; week: WeekPlan; violations: RuleViolation[] }> {
  const formData = new FormData()
  for (const upload of uploads) for (const file of upload.files) formData.append(upload.child, file)
  if (history && history.length > 0) formData.append('history', JSON.stringify(history))
  const response = await fetch('/api/menus/plan', { method: 'POST', body: formData })
  return parseOrThrow(response)
}

// POST /api/menus/generate — Pasos 2-4 a partir de un menú escolar ya conocido. Ahora mismo no lo
// usa ninguna pantalla (el botón "Probar con un menú de ejemplo" se quitó), se mantiene como cliente
// del endpoint.
export async function generateFromSchoolMenu(schoolMenu: SchoolMenuExtraction, history?: HistorySummary[]): Promise<{ week: WeekPlan; violations: RuleViolation[] }> {
  const response = await fetch('/api/menus/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolMenu, history }),
  })
  return parseOrThrow(response)
}

// POST /api/menus/substitute — alternativas reales para un único hueco ("Cambiar").
export async function substituteDish(input: { day: DayName; meal: MealSlot; currentWeek: WeekPlan; schoolMenu?: SchoolMenuExtraction; count?: number }): Promise<{ alternatives: FinalDish[]; violations: RuleViolation[] }> {
  const response = await fetch('/api/menus/substitute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseOrThrow(response)
}

// POST /api/history — "Confirmar planificación".
export async function saveHistoryEntry(label: string, week: WeekPlan, weekStart?: string): Promise<{ entry: HistoryEntry }> {
  const response = await fetch('/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, weekStart, week }),
  })
  return parseOrThrow(response)
}

// GET /api/history — listado de Guardados.
export async function listHistory(): Promise<{ entries: HistoryEntry[] }> {
  const response = await fetch('/api/history', { cache: 'no-store' })
  return parseOrThrow(response)
}
