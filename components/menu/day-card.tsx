'use client'

import { useState } from 'react'
import { ChevronDown, Clock, ExternalLink } from 'lucide-react'
import type { Difficulty, FinalDayPlan, FinalDish, MealSlot } from '@/server/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PEOPLE_BY_DAY, peopleLabel } from '@/server/rules/constants'
import { hasExternalLink, sourceStyles } from '@/lib/menu-data'
import { dayLabel } from '@/lib/week-dates'

// `onChange` es opcional: sin él (semanas guardadas, de solo lectura) no se pinta el botón
// "Cambiar" en ningún plato — no solo se deshabilita, directamente no existe la posibilidad.
export function DayCard({ item, dateLabel, onChange }: { item: FinalDayPlan; dateLabel?: string; onChange?: (meal: MealSlot) => void }) { return <Card className="border-slate-100 shadow-none"><CardHeader className="space-y-0 p-4 pb-2"><CardTitle className="text-base">{dayLabel(item.day)}</CardTitle>{dateLabel && <p className="text-xs text-slate-400">{dateLabel}</p>}</CardHeader><CardContent className="flex flex-col gap-2 p-4 pt-2"><Meal label="Comida" data={item.comida} people={PEOPLE_BY_DAY[item.day]} onChange={onChange && (() => onChange('comida'))} /><Meal label="Cena" data={item.cena} people={PEOPLE_BY_DAY[item.day]} onChange={onChange && (() => onChange('cena'))} /></CardContent></Card> }

const DIFFICULTY_LABELS: Record<Difficulty, string> = { facil: 'Fácil', media: 'Media', dificil: 'Difícil' }

// "Ver receta": resumen del plato + ingredientes + cómo se hace, oculto por defecto (a petición:
// "que se muestre cuando el usuario quiera"). Platos manuales o antiguos pueden no tener pasos o ni
// siquiera descripción: se enseña lo que haya y, si no hay nada, no se pinta el botón.
function Meal({ label, data, people, onChange }: { label: string; data: FinalDish; people: number; onChange?: () => void }) {
  const [showRecipe, setShowRecipe] = useState(false)
  const hasRecipe = !!data.description || data.ingredients.length > 0 || !!data.steps?.length
  const badge = <Badge variant="outline" className={`mt-2 gap-1 text-[11px] ${sourceStyles[data.sourceName] ?? ''}`}>{data.sourceName}{(hasExternalLink(data.sourceName) || (data.sourceKind === 'web' && !!data.sourceUrl)) && <ExternalLink className="size-3" />}</Badge>
  return <div className="rounded-xl bg-slate-50 p-3"><div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>{onChange && <Button variant="ghost" size="sm" onClick={onChange} className="h-7 px-2 text-xs text-emerald-700">Cambiar</Button>}</div><p className="text-sm font-semibold">{data.title}</p>{!!(data.totalTimeMinutes || data.difficulty) && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock className="size-3" />{[data.totalTimeMinutes && `${data.totalTimeMinutes} min`, data.difficulty && DIFFICULTY_LABELS[data.difficulty]].filter(Boolean).join(' · ')}</p>}<div className="flex flex-wrap items-center justify-between gap-2">{data.sourceKind === 'web' && data.sourceUrl ? <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-block hover:opacity-80">{badge}</a> : badge}{hasRecipe && <button type="button" onClick={() => setShowRecipe(open => !open)} aria-expanded={showRecipe} className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800">{showRecipe ? 'Ocultar receta' : 'Ver receta'}<ChevronDown className={`size-3.5 transition-transform ${showRecipe ? 'rotate-180' : ''}`} /></button>}</div>{showRecipe && <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600">{data.description && <p className="whitespace-pre-line">{data.description}</p>}{data.ingredients.length > 0 && <div><p className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Ingredientes</p>{data.sourceKind === 'ia' ? <><ul className="list-disc pl-4">{data.ingredients.map((ingredient, i) => <li key={i}>{ingredient}</li>)}</ul><p className="mt-1 text-slate-400">Cantidades para {peopleLabel(people)}.</p></> : <p>{data.ingredients.join(', ')}</p>}</div>}{!!data.steps?.length && <div><p className="mb-1 font-semibold uppercase tracking-wider text-slate-400">Cómo se hace</p><ol className="flex list-decimal flex-col gap-1 pl-4">{data.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></div>}{!data.steps?.length && data.sourceKind === 'web' && data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">{data.sourceName === 'Manual' ? 'Ver la receta original' : `Ver los pasos en ${data.sourceName}`}{data.sourceName === 'Cookidoo' && ' (con tu suscripción)'}<ExternalLink className="size-3" /></a>}</div>}</div>
}
