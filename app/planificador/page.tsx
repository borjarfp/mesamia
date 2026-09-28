'use client'

import { useState } from 'react'
import { AlertCircle, Check, ChevronLeft, ChevronRight, FileText, LoaderCircle, Sparkles, X } from 'lucide-react'
import type { SchoolMenuExtraction, WeekPlan } from '@/server/types'
import { ApiError, planFullWeek } from '@/lib/api'
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

  const addFiles = (files: FileList | File[] | null) => setUploaded(current => [...current, ...Array.from(files ?? []).map(file => ({ id: `${file.name}-${file.size}-${file.lastModified}`, file, child: 'Aina' as ChildName }))])
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
    runGenerate(() => planFullWeek(uploads))
  }

  return <PageShell>
    <AppHeader eyebrow={relativeWeekLabel(weekOffset)} title={<WeekPicker label={weekInfo.label} onPrev={() => setWeekOffset(offset => offset - 1)} onNext={() => setWeekOffset(offset => offset + 1)} onReset={weekOffset !== 1 ? () => setWeekOffset(1) : undefined} />} subtitle="Menú familiar inteligente" />
    <TabNav active="planner" />
    <div className="flex-1 px-5 pb-10 sm:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <Card onDragOver={event => { event.preventDefault(); setDragActive(true) }} onDragLeave={() => setDragActive(false)} onDrop={event => { event.preventDefault(); setDragActive(false); addFiles(event.dataTransfer.files) }} className={`mb-5 overflow-hidden border-emerald-100 bg-emerald-50/60 shadow-none transition print:hidden ${dragActive ? 'border-emerald-400 bg-emerald-100/60 ring-2 ring-emerald-300' : ''}`}><CardContent className="p-4"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-white p-2 text-emerald-600"><FileText className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-medium">Menús del cole / guardería</p><p className="mt-0.5 text-xs leading-relaxed text-slate-500">Arrastra o sube los PDF o imágenes de Aina e Iria — toca el nombre en cada archivo si hay que corregir a quién pertenece.</p>{uploaded.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{uploaded.map(item => <Badge key={item.id} variant="secondary" className="gap-1.5 bg-white text-xs"><Check className="size-3 text-emerald-600" />{item.file.name}<span className="flex gap-0.5">{CHILDREN.map(child => <button key={child} type="button" onClick={() => setFileChild(item.id, child)} className={`rounded px-1 text-[10px] font-semibold transition ${item.child === child ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-700'}`}>{child}</button>)}</span><button onClick={() => removeFile(item.id)} aria-label={`Quitar ${item.file.name}`}><X className="size-3" /></button></Badge>)}</div>}</div><label className="cursor-pointer rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"><input type="file" accept=".pdf,image/*" multiple className="sr-only" onChange={event => { addFiles(event.target.files); event.target.value = '' }} />Subir</label></div></CardContent></Card>
      <RulesPanel />
      <Button onClick={handleGenerate} disabled={generating} className="mb-6 h-auto min-h-12 w-full whitespace-normal rounded-xl bg-emerald-600 py-3 text-base font-semibold leading-snug shadow-lg shadow-emerald-600/15 hover:bg-emerald-700">{generating ? <><LoaderCircle className="animate-spin" data-icon="inline-start" />Analizando menús y buscando recetas...</> : <><Sparkles data-icon="inline-start" />Generar menú semanal inteligente</>}</Button>
      {generating && <GenerationProgress done={generationDone} />}
      {generateError && <Alert className="mb-6 border-red-100 bg-red-50 text-red-800"><AlertCircle className="size-4" /><AlertDescription>{generateError}</AlertDescription></Alert>}
      {!generating && !week && <EmptyState />}
      {week && <WeekView week={week} schoolMenu={schoolMenu} weekLabel={weekInfo.label} weekStart={weekInfo.start} dateLabels={weekInfo.dateLabels} />}
    </div>
  </PageShell>
}

function WeekPicker({ label, onPrev, onNext, onReset }: { label: string; onPrev: () => void; onNext: () => void; onReset?: () => void }) { return <div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={onPrev} className="-ml-2 shrink-0 rounded-full text-slate-500" aria-label="Semana anterior"><ChevronLeft /></Button><h1 className="min-w-0 text-center text-2xl font-semibold tracking-tight sm:text-3xl">{label}</h1><Button variant="ghost" size="icon" onClick={onNext} className="shrink-0 rounded-full text-slate-500" aria-label="Semana siguiente"><ChevronRight /></Button></div>{onReset && <button type="button" onClick={onReset} className="mt-1 text-xs font-medium text-emerald-700 hover:underline">Volver a la semana que viene</button>}</div> }

function EmptyState() { return <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-14 text-center"><div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><Sparkles className="size-6" /></div><h2 className="font-semibold">Tu semana empieza aquí</h2><p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">Sube los menús del cole y deja que preparemos una propuesta variada para toda la familia.</p></div> }
