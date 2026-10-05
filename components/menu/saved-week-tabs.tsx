'use client'

import { useState } from 'react'
import { ShoppingCart, UtensilsCrossed } from 'lucide-react'
import type { HistoryEntry } from '@/server/types'
import { RulesPanel } from '@/components/menu/rules-panel'
import { ShoppingListView } from '@/components/menu/shopping-list-view'
import { WeekView } from '@/components/menu/week-view'

// Pestañas del detalle de una semana guardada: "Menú semanal" y "Lista de la compra". Mismo aspecto
// de segmented control que TabNav, pero con estado local (es la misma página, no dos rutas).
const tabClass = (active: boolean) => `flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${active ? 'bg-white text-emerald-700 shadow-sm [&_svg]:text-emerald-600' : 'text-slate-500'}`

export function SavedWeekTabs({ entry }: { entry: HistoryEntry }) {
  const [tab, setTab] = useState<'menu' | 'shopping'>('menu')
  return <>
    <div role="tablist" className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 print:hidden"><button role="tab" aria-selected={tab === 'menu'} onClick={() => setTab('menu')} className={tabClass(tab === 'menu')}><UtensilsCrossed className="size-4" />Menú semanal</button><button role="tab" aria-selected={tab === 'shopping'} onClick={() => setTab('shopping')} className={tabClass(tab === 'shopping')}><ShoppingCart className="size-4" />Lista de la compra</button></div>
    {tab === 'menu' ? <>
      <RulesPanel note="Son las reglas actuales: si esta semana se guardó antes de añadir alguna, puede no cumplirla." />
      <WeekView week={entry.week} weekLabel={entry.label} title="Menú de esta semana" subtitle="Así fue la semana que guardasteis." editable={false} badgeLabel="Histórico" />
    </> : <ShoppingListView id={entry.id} initial={entry.shoppingList} />}
  </>
}
