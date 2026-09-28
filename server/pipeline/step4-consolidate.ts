import { generateStructured, textPart } from '../clients/gemini'
import type { RecipeSourceName } from '../clients/tavily'
import { GEMINI_MODEL_FLASH } from '../env'
import { buildRecipeSelectionSystemInstruction, buildRecipeSelectionUserPrompt } from '../prompts/recipeConsolidation'
import { checkDishRestrictions } from '../rules/restrictions'
import { RecipeSelectionSchema, type Difficulty } from '../types'
import type { RecipeLookup } from './step3-fetch-recipes'

export type SelectedRecipe = {
  title: string
  description: string
  ingredients: string[]
  steps: string[]
  totalTimeMinutes: number
  difficulty: Difficulty
  source: { kind: 'web'; url: string; name: RecipeSourceName } | { kind: 'ia' }
}

// Paso 4: para cada plato, Gemini compara las candidatas web del Paso 3 con su propia receta y se
// queda con la mejor (ver buildRecipeSelectionSystemInstruction) — una llamada por plato, como
// antes, solo que ahora decide en vez de limitarse a limpiar la primera página que devolviera
// Tavily. Así "Generado por IA" sale cuando es la mejor opción, no solo cuando Tavily no encuentra
// nada.
//
// La elección se vuelve a pasar por las restricciones de la familia (server/rules/restrictions.ts)
// con código determinista: no nos fiamos de que Gemini haya revisado bien la página (una paella con
// gambas, una receta de 90 min para un martes). Si no las cumple, se descarta y ese hueco se queda
// con el plato tal cual lo planificó el Paso 2, que sí está validado. Lo mismo si la llamada falla:
// un plato sin receta elegida no tira abajo la semana.
export async function selectRecipes(lookups: RecipeLookup[]): Promise<Map<string, SelectedRecipe>> {
  const entries = await Promise.all(
    lookups.map(async lookup => {
      const { day, meal, proteinCategory } = lookup.dish
      let selection
      try {
        selection = await generateStructured({
          model: GEMINI_MODEL_FLASH,
          schema: RecipeSelectionSchema,
          systemInstruction: buildRecipeSelectionSystemInstruction(),
          contents: [{ role: 'user', parts: [textPart(buildRecipeSelectionUserPrompt(lookup.dish, lookup.candidates))] }],
        })
      } catch {
        return null
      }
      const { choice, reason: _reason, ...recipe } = selection
      // "ia", o un número de candidata que no existe (Gemini eligió "3" con solo 2 candidatas): se
      // trata como receta propia, nunca como una fuente web inventada.
      const candidate = choice === 'ia' ? undefined : lookup.candidates[Number(choice) - 1]
      if (checkDishRestrictions({ day, meal, proteinCategory, ...recipe }).length > 0) return null
      const value: SelectedRecipe = { ...recipe, source: candidate ? { kind: 'web', url: candidate.url, name: candidate.sourceName } : { kind: 'ia' } }
      return [lookup.key, value] as const
    }),
  )
  return new Map(entries.filter(entry => entry !== null))
}
