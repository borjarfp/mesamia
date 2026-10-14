'use client'

import { useState } from 'react'
import { ChevronRight, LoaderCircle, Users } from 'lucide-react'
import type { Family } from '@/server/types'
import { ApiError, selectFamily } from '@/lib/api'

// Lista de familias para elegir con cuál trabajar. Al elegir se guarda la selección en el servidor y
// se entra con una navegación completa (no soft) para que ninguna pantalla conserve datos de otra familia.
export function FamilyPicker({ families, activeId }: { families: Family[]; activeId?: string | null }) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function choose(id: string) {
    setPending(id)
    setError(null)
    try { await selectFamily(id); window.location.assign('/planificador') }
    catch (e) { setError(e instanceof ApiError ? e.message : 'No se ha podido elegir la familia.'); setPending(null) }
  }
  return <div className="space-y-3">
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <ul className="space-y-2">{families.map(family => <li key={family.id}><button type="button" disabled={pending !== null} onClick={() => choose(family.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-xs transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-60">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Users className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{family.name}</span><span className="block text-sm text-slate-500">{family.members.length} {family.members.length === 1 ? 'persona' : 'personas'}{family.id === activeId ? ' · activa' : ''}</span></span>
      {pending === family.id ? <LoaderCircle className="size-5 animate-spin text-emerald-600" /> : <ChevronRight className="size-5 text-slate-400" />}
    </button></li>)}</ul>
  </div>
}
