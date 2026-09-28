import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Utensils } from 'lucide-react'
import { historyStore } from '@/server/history/store'
import { PageShell } from '@/components/menu/page-shell'
import { RulesPanel } from '@/components/menu/rules-panel'
import { WeekView } from '@/components/menu/week-view'

export const runtime = 'nodejs'

// Vista de solo lectura de una semana ya guardada: sin subida de menús del cole ni botón de
// generar (eso es solo de /planificador) y `editable={false}` en <WeekView> — un histórico no se
// puede modificar, ni cambiar un plato ni escribir uno manual; solo se consulta y se imprime.
//
// `slug` es ahora el id real de un HistoryEntry (server/history/store.ts) — ya no hay
// generateStaticParams: las semanas guardadas se crean en tiempo de ejecución (al "Confirmar
// planificación"), no se conocen en build time. Al ser un Server Component se lee el HistoryStore
// directamente en proceso, sin llamar a la propia API por HTTP.
export default async function SavedWeekPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const entry = await historyStore.get(slug)
  if (!entry) notFound()

  const savedDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(entry.createdAt))

  return <PageShell>
    <header className="px-5 pb-4 pt-8 sm:px-8">
      <Link href="/guardados" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 print:hidden"><ChevronLeft className="size-4" />Volver</Link>
      <div className="mb-6 flex items-center gap-2"><div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><Utensils className="size-5" /></div><span className="font-semibold tracking-tight">Mesa<span className="text-emerald-600">Mía</span></span></div>
      <p className="mb-1 text-sm font-medium text-emerald-600">Semana guardada</p>
      <h1 className="text-3xl font-semibold tracking-tight">{entry.label}</h1>
      <p className="mt-1 text-sm text-slate-500">Guardada el {savedDate}</p>
    </header>
    <div className="flex-1 px-5 pb-10 sm:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <RulesPanel note="Son las reglas actuales: si esta semana se guardó antes de añadir alguna, puede no cumplirla." />
      <WeekView week={entry.week} weekLabel={entry.label} title="Menú de esta semana" subtitle="Así fue la semana que guardasteis." editable={false} badgeLabel="Histórico" />
    </div>
  </PageShell>
}
