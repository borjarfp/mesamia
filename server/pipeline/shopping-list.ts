import { generateStructured, textPart } from '../clients/gemini'
import { GEMINI_MODEL_FLASH } from '../env'
import { buildShoppingListSystemInstruction, buildShoppingListUserPrompt } from '../prompts/shoppingList'
import { ShoppingListSchema, type ShoppingList, type WeekPlan } from '../types'

// Lista de la compra consolidada de una semana (1 llamada a Gemini Flash).
export function generateShoppingList(week: WeekPlan): Promise<ShoppingList> {
  return generateStructured({
    model: GEMINI_MODEL_FLASH,
    schema: ShoppingListSchema,
    systemInstruction: buildShoppingListSystemInstruction(),
    contents: [{ role: 'user', parts: [textPart(buildShoppingListUserPrompt(week))] }],
    temperature: 0.2,
  })
}
