import { NextResponse } from 'next/server'
import { ValidationError } from '@/server/errors'
import { toErrorResponse } from '@/server/http'
import { substituteDish } from '@/server/pipeline/substitute'
import { DayNameSchema, MealSlotSchema, SchoolMenuExtractionSchema, WeekPlanSchema } from '@/server/types'
import { z } from 'zod'

export const runtime = 'nodejs'

const RequestBodySchema = z.object({
  day: DayNameSchema,
  meal: MealSlotSchema,
  currentWeek: WeekPlanSchema,
  schoolMenu: SchoolMenuExtractionSchema.optional(),
  count: z.number().int().min(1).max(5).optional(),
})

// POST /api/menus/substitute
// Sustituir un único plato (equivalente al botón "Cambiar" del frontend): propone varias
// alternativas (3 por defecto) para un día/comida concreto, validadas contra el resto de la semana
// ya fijada, cada una con su búsqueda de receta real (Tavily) si la hay.
//
// Body JSON: { day, meal, currentWeek: WeekPlan, schoolMenu?: SchoolMenuExtraction, count?: number }
// - schoolMenu es opcional: sin él no se puede comprobar la regla de "no repetir la comida escolar"
//   para ese día, pero el resto de reglas (límites semanales) se sigue aplicando igual.
// Respuesta: { alternatives: FinalDish[], violations: RuleViolation[] }
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => {
      throw new ValidationError('El cuerpo de la petición debe ser JSON válido.')
    })
    const parsed = RequestBodySchema.safeParse(body)
    if (!parsed.success) {
      throw new ValidationError('El cuerpo no tiene la forma esperada.', parsed.error.issues)
    }

    const result = await substituteDish(parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}
