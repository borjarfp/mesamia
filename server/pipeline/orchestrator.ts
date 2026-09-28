import type { RuleViolation, SchoolMenuExtraction, WeekPlan } from '../types'
import { assembleWeek } from './assemble'
import { selectRecipes } from './step4-consolidate'
import { extractSchoolMenu, type SchoolMenuUpload } from './step1-extract-school-menu'
import { fetchRecipes, slotKey } from './step3-fetch-recipes'
import { planWeek } from './step2-plan-week'

export type GenerateResult = {
  week: WeekPlan
  violations: RuleViolation[]
}

// Pasos 2 → 4 del pipeline: planificar los huecos, buscar recetas candidatas para cada uno
// (concurrente), elegir la mejor de cada plato (web o propia de Gemini), y ensamblar la semana. Se usa tanto desde
// /api/menus/generate (cuando el cliente ya tiene el JSON del menú escolar) como desde
// planFullWeek() más abajo (cuando parte de los archivos originales).
// `tasteContext`: las semanas anteriores en texto para el LLM (server/history/taste-context.ts).
export async function generateFromSchoolMenu(schoolMenu: SchoolMenuExtraction, tasteContext?: string): Promise<GenerateResult> {
  const { slots, violations } = await planWeek(schoolMenu, tasteContext)
  const lookups = await fetchRecipes(slots.map(dish => ({ key: slotKey(dish.day, dish.meal), dish })))
  const selected = await selectRecipes(lookups)
  const week = assembleWeek(slots, selected)
  return { week, violations }
}

export type PlanFullWeekResult = GenerateResult & { schoolMenu: SchoolMenuExtraction }

// Pipeline completo, Pasos 1 → 4, de una sola vez: el caso de uso que dispara el botón único
// "Generar menú semanal inteligente" del frontend (sube los PDF/imágenes y quiere la semana ya
// lista, sin pasos intermedios).
export async function planFullWeek(uploads: SchoolMenuUpload[], tasteContext?: string, weekStart?: string): Promise<PlanFullWeekResult> {
  const schoolMenu = await extractSchoolMenu(uploads, weekStart)
  const result = await generateFromSchoolMenu(schoolMenu, tasteContext)
  return { schoolMenu, ...result }
}
