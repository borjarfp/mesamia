'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, CalendarX2, Check, ChevronLeft, ChevronRight, FileText, History, Info, LoaderCircle, Sparkles, X } from 'lucide-react'
import type { SchoolMenuExtraction, WeekPlan } from '@/server/types'
import { ApiError, getTasteContext, planFullWeek } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AppHeader } from '@/components/menu/app-header'
import { GenerationProgress } from '@/components/menu/generation-progress'
import { PageShell } from '@/components/menu/page-shell'
import { RulesPanel } from '@/components/menu/rules-panel'
import { TabNav } from '@/components/menu/tab-nav'
import { WeekView } from '@/components/menu/week-view'
import { checkSchoolMenuDates } from '@/lib/school-dates'
import { getWeek, relativeWeekLabel } from '@/lib/week-dates'

const CHILDREN = ['Aina', 'Iria'] as const
type ChildName = (typeof CHILDREN)[number]
type UploadedFile = { id: string; file: File; child: ChildName }

export default function PlanificadorPage() {
  const [uploaded, setUploaded] = useState<UploadedFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generationDone, setGenerationDone] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [week, setWeek] = useState<WeekPlan | null>(null)
  const [schoolMenu, setSchoolMenu] = useState<SchoolMenuExtraction | undefined>(undefined)
  // Por defecto se planifica la semana que viene (offset 1): lo normal es preparar la siguiente, no
  // la que ya está en curso. Con las flechas del header se puede elegir cualquier otra.
  const [weekOffset, setWeekOffset] = useState(1)
  const weekInfo = getWeek(weekOffset)
  // Qué semanas guardadas verá la IA como historial de gustos al planificar la semana elegida (las 3
  // anteriores, ver server/history/taste-context.ts). Solo informativo: el servidor lo calcula solo.
  const [tasteWeeks, setTasteWeeks] = useState<string[] | null>(null)
  useEffect(() => { let active = true; getTasteContext(weekInfo.start).then(result => { if (active) setTasteWeeks(result.weeks.map(week => week.label)) }).catch(() => { if (active) setTasteWeeks(null) }); return () => { active = false } }, [weekInfo.start])

  // Los archivos se copian a un array AQUÍ, de forma síncrona, y no dentro del updater de
  // setUploaded: React puede ejecutar ese updater más tarde, y para entonces el FileList ya está
  // vacío — es un objeto "vivo" que se vacía al hacer `input.value = ''` justo después (y el
  // DataTransfer de un drop se bloquea al acabar el evento). Así fallaba sin ningún error: el primer
  // archivo entraba, pero a partir del segundo no aparecía nada en el cuadrado verde.
  const addFiles = (files: FileList | File[] | null) => {
    const added = Array.from(files ?? []).map(file => ({ id: `${file.name}-${file.size}-${file.lastModified}`, file, child: 'Aina' as ChildName }))
    if (added.length > 0) setUploaded(current => [...current, ...added.filter(item => !current.some(existing => existing.id === item.id))])
  }
  const removeFile = (id: string) => setUploaded(current => current.filter(item => item.id !== id))
  const setFileChild = (id: string, child: ChildName) => setUploaded(current => current.map(item => item.id === id ? { ...item, child } : item))

  const runGenerate = async (task: () => Promise<{ schoolMenu: SchoolMenuExtraction; week: WeekPlan }>) => {
    setGenerating(true)
    setGenerationDone(false)
    setGenerateError(null)
    try {
      const result = await task()
      // Deja ver la barra al 100% un instante antes de pintar la semana (si terminó antes de los
      // ~1,9 min esperados, salta de donde estuviera al 100%).
      setGenerationDone(true)
      await new Promise(resolve => setTimeout(resolve, 600))
      setSchoolMenu(result.schoolMenu)
      setWeek(result.week)
    } catch (error) {
      setGenerateError(error instanceof ApiError ? error.message : 'No se ha podido generar el menú. Inténtalo de nuevo.')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerate = () => {
    if (uploaded.length === 0) { setGenerateError('Sube al menos un menú del cole antes de generar.'); return }
    const byChild = new Map<ChildName, File[]>()
    for (const item of uploaded) byChild.set(item.child, [...(byChild.get(item.child) ?? []), item.file])
    const uploads = Array.from(byChild, ([child, files]) => ({ child, files }))
    runGenerate(() => planFullWeek(uploads, weekInfo.start))
  }

  return <PageShell>
    <AppHeader eyebrow={relativeWeekLabel(weekOffset)} title={<WeekPicker label={weekInfo.label} onPrev={() => setWeekOffset(offset => offset - 1)} onNext={() => setWeekOffset(offset => offset + 1)} onReset={weekOffset !== 1 ? () => setWeekOffset(1) : undefined} />} subtitle="Menú familiar inteligente" />
    <TabNav active="planner" />
    <div className="flex-1 px-5 pb-10 sm:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <Card onDragOver={event => { event.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)} onDrop={event => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files) }} className={`mb-5 overflow-hidden border-emerald-100 bg-emerald-50/60 shadow-none transition print:hidden ${dragActive ? 'border-emerald-400 bg-emerald-100/60 ring-2 ring-emerald-300' : ''}`}><CardContent className="p-4"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-white p-2 text-emerald-600"><FileText className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-medium">Menús del cole / guardería</p><p className="mt-0.5 text-xs leading-relaxed text-slate-500">Arrastra o sube los PDF o imágenes de Aina e Iria — toca el nombre en cada archivo si hay que corregir a quién pertenece.</p>{uploaded.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{uploaded.map(item => <Badge key={item.id} variant="secondary" className="gap-1.5 bg-white text-xs"><Check className="size-3 text-emerald-600" />{item.file.name}<span className="flex gap-0.5">{CHILDREN.map(child => <button key={child} type="button" onClick={() => setFileChild(item.id, child)} className={`rounded px-1 text-[10px] font-semibold transition ${item.child === child ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-700'}`}>{child}</button>)}</span><button onClick={() => removeFile(item.id)} aria-label={`Quitar ${item.file.name}`}><X className="size-3" /></button></Badge>)}</div>}</div><label className="cursor-pointer rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"><input type="file" accept=".pdf,image/*" multiple className="sr-only" onChange={event => { addFiles(event.target.files); event.target.value = '' }} />Subir</label></div></CardContent></Card>
      <RulesPanel />
      <Button onClick={handleGenerate} disabled={generating || uploaded.length === 0} className="mb-6 h-auto min-h-12 w-full whitespace-normal rounded-xl bg-emerald-600 py-3 text-base font-semibold leading-snug shadow-lg shadow-emerald-600/15 hover:bg-emerald-700">{generating ? <><LoaderCircle className="animate-spin" data-icon="inline-start" />Analizando menús y buscando recetas...</> : <><Sparkles data-icon="inline-start" />Generar menú semanal inteligente</>}</Button>
      {/* Deshabilitado sin ningún menú subido (a petición): se explica aquí por qué, para que no parezca roto. */}
      {uploaded.length === 0 && !generating && <p className="-mt-4 mb-6 flex items-start gap-1.5 text-xs font-medium text-amber-700 print:hidden"><Info className="mt-0.5 size-3.5 shrink-0" />Sube el menú del cole de al menos una niña para poder generar la semana.</p>}
      {tasteWeeks && <p className="-mt-4 mb-6 flex items-start gap-1.5 text-xs text-slate-500 print:hidden"><History className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />{tasteWeeks.length > 0 ? <>La IA tendrá en cuenta lo que aceptasteis y cambiasteis en: {tasteWeeks.join(' · ')}.</> : <>Aún no hay semanas guardadas anteriores a esta: cuando confirméis semanas, la IA aprenderá de lo que cambiéis.</>}</p>}
      {generating && <GenerationProgress done={generationDone} />}
      {generateError && <Alert className="mb-6 border-red-100 bg-red-50 text-red-800"><AlertCircle className="size-4" /><AlertDescription>{generateError}</AlertDescription></Alert>}
      {!generating && !week && <EmptyState />}
      {week && schoolMenu && <SchoolDatesNotice check={checkSchoolMenuDates(schoolMenu, weekInfo.start)} weekLabel={weekInfo.label} />}
      {week && <WeekView key={week.generatedAt} week={week} schoolMenu={schoolMenu} weekLabel={weekInfo.label} weekStart={weekInfo.start} dateLabels={weekInfo.dateLabels} />}
    </div>
  </PageShell>
}

// Aviso tras generar si el menú del cole subido no es de la semana planificada (o no trae fechas).
// Se recalcula con la semana elegida en cada render, así que cambiar de semana con las flechas lo
// actualiza al momento.
function SchoolDatesNotice({ check, weekLabel }: { check: ReturnType<typeof checkSchoolMenuDates>; weekLabel: string }) { return <>{check.mismatched.length > 0 && <Alert className="mb-4 border-amber-200 bg-amber-50 text-amber-900 print:hidden"><CalendarX2 className="size-4" /><AlertDescription className="text-amber-900"><p className="font-semibold">El menú de las niñas que has subido no coincide con la semana que estás planificando ({weekLabel}).</p><ul className="mt-1 list-disc pl-4">{check.mismatched.map(item => <li key={item.child}>Menú de {item.child}: {item.range}</li>)}</ul><p className="mt-1">Revisa los archivos o cambia de semana con las flechas de arriba. El menú se ha generado igualmente con ese menú del cole.</p></AlertDescription></Alert>}{check.unknown.length > 0 && <p className="mb-4 flex items-start gap-1.5 text-xs text-slate-500 print:hidden"><Info className="mt-0.5 size-3.5 shrink-0" />No hemos podido comprobar las fechas del menú de {check.unknown.join(' y ')}: el documento no las indica.</p>}</> }

function WeekPicker({ label, onPrev, onNext, onReset }: { label: string; onPrev: () => void; onNext: () => void; onReset?: () => void }) { return <div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={onPrev} className="-ml-2 shrink-0 rounded-full text-slate-500" aria-label="Semana anterior"><ChevronLeft /></Button><h1 className="min-w-0 text-center text-2xl font-semibold tracking-tight sm:text-3xl">{label}</h1><Button variant="ghost" size="icon" onClick={onNext} className="shrink-0 rounded-full text-slate-500" aria-label="Semana siguiente"><ChevronRight /></Button></div>{onReset && <button type="button" onClick={onReset} className="mt-1 text-xs font-medium text-emerald-700 hover:underline">Volver a la semana que viene</button>}</div> }

function EmptyState() { return <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center"><div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Sparkles className="size-6" /></div><h2 className="font-semibold">Tu semana empieza aquí</h2><p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">Sube los menús del cole y deja que preparemos una propuesta variada para toda la familia.</p></div> }
