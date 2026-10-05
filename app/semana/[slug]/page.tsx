import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Utensils } from 'lucide-react'
import { getHistoryStore } from '@/server/history/store'
import { runWithTestMode } from '@/server/test-mode'
import { TEST_MODE_PARAM } from '@/lib/test-mode-constants'
import { PageShell } from '@/components/menu/page-shell'
import { DeleteWeekButton } from '@/components/menu/delete-week-button'
import { SavedWeekTabs } from '@/components/menu/saved-week-tabs'

export const runtime = 'nodejs'

// Vista de solo lectura de una semana ya guardada: sin subida de menús del cole ni botón de
// generar (eso es solo de /planificador) y `editable={false}` en <WeekView> — un histórico no se
// puede modificar, ni cambiar un plato ni escribir uno manual; solo se consulta y se imprime.
//
// `slug` es ahora el id real de un HistoryEntry (server/history/store.ts) — ya no hay
// generateStaticParams: las semanas guardadas se crean en tiempo de ejecución (al "Confirmar
// planificación"), no se conocen en build time. Al ser un Server Component se lee el HistoryStore
// directamente en proceso, sin llamar a la propia API por HTTP.
//
// Modo pruebas: un Server Component no recibe la cabecera que pone lib/api.ts, así que se lee del
// query param (?pruebas=1, que /guardados añade a sus enlaces en ese modo) para leer del store de
// pruebas.
export default async function SavedWeekPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const entry = await runWithTestMode(query[TEST_MODE_PARAM] === '1', () => getHistoryStore().get(slug))
  if (!entry) notFound()

  const savedDate = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(entry.createdAt))

  return <PageShell>
    <header className="px-5 pb-4 pt-8 sm:px-8">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden"><Link href="/guardados" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"><ChevronLeft className="size-4" />Volver</Link><DeleteWeekButton id={entry.id} label={entry.label} redirectTo="/guardados" /></div>
      <div className="mb-6 flex items-center gap-2"><div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><Utensils className="size-5" /></div><span className="font-semibold tracking-tight">Mesa<span className="text-emerald-600">Mía</span></span></div>
      <p className="mb-1 text-sm font-medium text-emerald-600">Semana guardada</p>
      <h1 className="text-3xl font-semibold tracking-tight">{entry.label}</h1>
      <p className="mt-1 text-sm text-slate-500">Guardada el {savedDate}</p>
    </header>
    <div className="flex-1 px-5 pb-10 sm:px-8 lg:px-12 xl:px-16 2xl:px-24">
      <SavedWeekTabs entry={entry} />
    </div>
  </PageShell>
}
