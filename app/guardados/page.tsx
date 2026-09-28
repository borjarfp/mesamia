'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, BookOpen, CalendarDays, LoaderCircle } from 'lucide-react'
import type { HistoryEntry } from '@/server/types'
import { ApiError, listHistory } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { AppHeader } from '@/components/menu/app-header'
import { PageShell } from '@/components/menu/page-shell'
import { TabNav } from '@/components/menu/tab-nav'

function summarize(entry: HistoryEntry): string {
  const dishCount = entry.week.days.length * 2
  return `7 días · ${dishCount} platos`
}

export default function GuardadosPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listHistory()
      .then(result => setEntries(result.entries))
      .catch(err => setError(err instanceof ApiError ? err.message : 'No se ha podido cargar el historial.'))
  }, [])

  return <PageShell>
    <AppHeader eyebrow="Tus menús" title="Historial" subtitle="Todo lo que habéis disfrutado juntos" />
    <TabNav active="history" />
    <div className="flex-1 px-5 pb-10 sm:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <Alert className="mb-6 border-emerald-100 bg-emerald-50 text-emerald-800"><BookOpen className="size-4" /><AlertDescription>La IA aprende de vuestros menús guardados para adaptar cada nueva propuesta a los gustos de la familia.</AlertDescription></Alert>
      {error && <Alert className="mb-6 border-red-100 bg-red-50 text-red-800"><AlertCircle className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>}
      {!entries && !error && <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Cargando semanas guardadas...</div>}
      {entries && entries.length === 0 && <p className="text-sm text-slate-500">Todavía no habéis guardado ninguna semana. Generad una en Planificador y confirmadla para verla aquí.</p>}
      <div className="flex flex-col gap-3">{entries?.map(entry => <Card key={entry.id} className="border-slate-100 shadow-none"><CardContent className="flex items-center gap-4 p-4"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><CalendarDays className="size-5" /></div><div className="flex-1"><p className="font-medium">{entry.label}</p><p className="mt-1 text-xs text-slate-500">{summarize(entry)}</p></div><Button variant="ghost" size="sm" nativeButton={false} className="text-emerald-700" render={<Link href={`/semana/${entry.id}`}>Ver</Link>} /></CardContent></Card>)}</div>
    </div>
  </PageShell>
}
