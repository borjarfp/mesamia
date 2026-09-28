'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, LoaderCircle, Printer, Search, Sparkles } from 'lucide-react'
import type { DayName, FinalDayPlan, FinalDish, MealChange, MealSlot, SchoolMenuExtraction, WeekPlan } from '@/server/types'
import { ApiError, saveHistoryEntry, substituteDish } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { DayCard } from '@/components/menu/day-card'
import { PrintMenu } from '@/components/menu/print-menu'
import { ResponsiveModal } from '@/components/menu/responsive-modal'
import { sourceStyles } from '@/lib/menu-data'

type Selected = { day: DayName; meal: MealSlot }

// Qué huecos se cambiaron respecto a la propuesta original de la IA (`week.days`, la prop, que no
// se modifica) — se guarda con la semana para que la IA aprenda de ello en las siguientes (ver
// server/history/taste-context.ts). Se compara título + URL: cambiar y volver a elegir el mismo
// plato no cuenta como cambio. Un plato "Manual" es que se escribió a mano; si no, fue una alternativa.
function diffChanges(proposed: FinalDayPlan[], final: FinalDayPlan[]): MealChange[] {
  return final.flatMap(day => (['comida', 'cena'] as const).flatMap(meal => {
    const before = proposed.find(item => item.day === day.day)?.[meal]
    const after = day[meal]
    if (!before || (before.title === after.title && before.sourceUrl === after.sourceUrl)) return []
    return [{ day: day.day, meal, proposedTitle: before.title, kind: after.sourceName === 'Manual' ? 'manual' as const : 'alternativa' as const }]
  }))
}

// Vista completa de una semana ya generada/guardada: tarjetas de día + exportar (+ drawer
// de sustitución y confirmación si `editable`, ambos contra la API real). La usa tanto el
// planificador (semana actual, editable) como /semana/[slug] (guardadas: `editable={false}`,
// histórico de solo consulta).
export function WeekView({
  week,
  weekLabel,
  weekStart,
  schoolMenu,
  dateLabels,
  title = 'Tu menú semanal',
  subtitle = 'Guárdalo o imprímelo para tenerlo siempre a mano.',
  editable = true,
  badgeLabel = 'Listo para ti',
}: {
  week: WeekPlan
  weekLabel: string
  weekStart?: string
  schoolMenu?: SchoolMenuExtraction
  dateLabels?: Partial<Record<DayName, string>>
  title?: string
  subtitle?: string
  editable?: boolean
  badgeLabel?: string
}) {
  const router = useRouter()
  const [days, setDays] = useState<FinalDayPlan[]>(week.days)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [alternatives, setAlternatives] = useState<FinalDish[]>([])
  const [substituting, setSubstituting] = useState(false)
  const [substituteError, setSubstituteError] = useState<string | null>(null)
  const [customTitle, setCustomTitle] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const selectedDish = useMemo(() => {
    if (!selected) return null
    const day = days.find(item => item.day === selected.day)
    return day ? day[selected.meal] : null
  }, [days, selected])

  const handlePrint = () => window.print()

  // Abrir "Cambiar" ya NO busca alternativas (a petición): el modal ofrece "Buscar alternativas"
  // (Gemini + Tavily, 15-40s) y el campo libre a la vez, y el usuario elige. `searchId` descarta la
  // respuesta de una búsqueda si mientras tanto se cerró el modal o se abrió otro plato.
  const searchId = useRef(0)
  const openMeal = (day: DayName, meal: MealSlot) => {
    searchId.current++
    setSelected({ day, meal })
    setCustomTitle('')
    setAlternatives([])
    setSubstituteError(null)
    setSubstituting(false)
  }
  const searchAlternatives = () => {
    if (!selected) return
    const id = ++searchId.current
    setAlternatives([])
    setSubstituteError(null)
    setSubstituting(true)
    substituteDish({ ...selected, currentWeek: { days, generatedAt: week.generatedAt }, schoolMenu, weekStart })
      .then(result => { if (id === searchId.current) setAlternatives(result.alternatives) })
      .catch(error => { if (id === searchId.current) setSubstituteError(error instanceof ApiError ? error.message : 'No se han podido buscar alternativas.') })
      .finally(() => { if (id === searchId.current) setSubstituting(false) })
  }
  const closeDrawer = () => { searchId.current++; setSelected(null); setCustomTitle(''); setAlternatives([]); setSubstituteError(null); setSubstituting(false) }

  const replace = (dish: FinalDish) => {
    if (!selected) return
    setDays(current => current.map(item => item.day === selected.day ? { ...item, [selected.meal]: dish } : item))
    closeDrawer()
  }
  const submitCustom = () => {
    const trimmed = customTitle.trim()
    if (!trimmed) return
    replace({ title: trimmed, description: '', ingredients: [], proteinCategory: 'otro', sourceKind: 'ia', sourceName: 'Manual' })
  }

  const confirmPlanning = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await saveHistoryEntry(weekLabel, { days, generatedAt: week.generatedAt }, weekStart, diffChanges(week.days, days))
      setConfirmOpen(false)
      router.push('/guardados')
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'No se ha podido guardar la semana.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="hidden border-emerald-200 text-emerald-700 sm:inline-flex">{badgeLabel}</Badge><Button variant="outline" size="sm" onClick={handlePrint} className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"><Printer data-icon="inline-start" />Exportar PDF / imprimir</Button>{editable && <Button size="sm" onClick={() => setConfirmOpen(true)} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Check data-icon="inline-start" />Confirmar planificación</Button>}</div></div>
    <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3 print:hidden">{days.map(item => <DayCard key={item.day} item={item} dateLabel={dateLabels?.[item.day]} onChange={editable ? (meal) => openMeal(item.day, meal) : undefined} />)}</div>
    <PrintMenu days={days} weekLabel={weekLabel} dateLabels={dateLabels} />
    {editable && <ResponsiveModal open={!!selected} onOpenChange={open => !open && closeDrawer()} title="Cambia este plato" description={<>Ahora: {selectedDish?.title ?? 'tu menú'}</>} footer={<Button variant="outline" onClick={closeDrawer}>Cancelar</Button>}>
      {!substituting && alternatives.length === 0 && <div className="flex flex-col gap-2 rounded-xl border border-slate-100 p-4"><p className="text-sm font-medium">Buscar alternativas</p><p className="text-xs text-slate-500">Te proponemos 3 platos que cumplen las reglas del menú, con la mejor receta para cada uno. Tarda unos segundos.</p><Button onClick={searchAlternatives} className="mt-1 gap-2 bg-emerald-600 hover:bg-emerald-700"><Search data-icon="inline-start" />Buscar alternativas</Button></div>}
      {substituting && <div className="flex items-center gap-2 rounded-xl border border-slate-100 p-4 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin text-emerald-600" />Buscando alternativas y la mejor receta para cada una...</div>}
      {substituteError && <Alert className="border-red-100 bg-red-50 text-red-800"><AlertCircle className="size-4" /><AlertDescription>{substituteError}</AlertDescription></Alert>}
      {!substituting && alternatives.map(alt => <button key={alt.title} onClick={() => replace(alt)} className="flex items-center gap-3 rounded-xl border border-slate-100 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Sparkles className="size-4" /></div><div className="min-w-0 flex-1"><p className="font-medium">{alt.title}</p>{!!alt.totalTimeMinutes && <p className="mt-0.5 text-xs text-slate-500">{alt.totalTimeMinutes} min</p>}</div><Badge className={sourceStyles[alt.sourceName] ?? ''} variant="outline">{alt.sourceName}</Badge></button>)}
      {!substituting && alternatives.length > 0 && <Button variant="ghost" size="sm" onClick={searchAlternatives} className="gap-2 self-start text-emerald-700"><Search data-icon="inline-start" />Buscar otras alternativas</Button>}
      <Separator className="my-1" /><form onSubmit={event => { event.preventDefault(); submitCustom() }} className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-200 p-4"><p className="text-sm font-medium">O escribe tu propio plato</p><div className="flex gap-2"><Input value={customTitle} onChange={event => setCustomTitle(event.target.value)} placeholder="Ej. Sobras de ayer" className="flex-1" /><Button type="submit" disabled={!customTitle.trim()} className="shrink-0 bg-emerald-600 hover:bg-emerald-700">Guardar</Button></div></form>
    </ResponsiveModal>}
    {editable && <ResponsiveModal open={confirmOpen} onOpenChange={open => !saving && setConfirmOpen(open)} title="¿Confirmar esta planificación?" description={<>Guardaremos "{weekLabel}" en tu historial de Guardados. Antes de continuar, puedes imprimir el menú semanal.</>} footer={<><Button onClick={confirmPlanning} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">{saving ? <><LoaderCircle className="size-4 animate-spin" />Guardando...</> : 'Confirmar y guardar'}</Button><Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>Cancelar</Button></>}>
      {saveError && <Alert className="border-red-100 bg-red-50 text-red-800"><AlertCircle className="size-4" /><AlertDescription>{saveError}</AlertDescription></Alert>}
      <Button variant="outline" onClick={handlePrint} className="w-full gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"><Printer data-icon="inline-start" />Imprimir menú semanal</Button>
    </ResponsiveModal>}
  </>
}
