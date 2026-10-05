'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Printer, RefreshCw } from 'lucide-react'
import { ApiError, getShoppingList } from '@/lib/api'
import { SHOPPING_CATEGORIES, type ShoppingList } from '@/server/types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { GenerationProgress } from '@/components/menu/generation-progress'

// Lista de la compra de una semana guardada. Si ya está generada llega en `initial`; si no, se pide
// al montarse la pestaña (el servidor la genera y la guarda, así que solo se espera la primera vez).
// 1 persona de lunes a jueves, 2 el viernes y 4 el fin de semana: lo aplica el servidor.
export function ShoppingListView({ id, initial }: { id: string; initial?: ShoppingList }) {
  const [list, setList] = useState<ShoppingList | undefined>(initial)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [regenerating, setRegenerating] = useState(false)
  useEffect(() => {
    if (list) return
    let cancelled = false
    setError(null)
    getShoppingList(id).then(({ shoppingList }) => { if (!cancelled) setList(shoppingList) }).catch(e => { if (!cancelled) setError(e instanceof ApiError ? e.message : 'No se ha podido generar la lista de la compra.') })
    return () => { cancelled = true }
  }, [id, attempt]) // eslint-disable-line react-hooks/exhaustive-deps
  // Rehace la lista; si falla, se conserva la anterior y se avisa.
  const regenerate = async () => {
    setRegenerating(true); setError(null)
    try { setList((await getShoppingList(id, true)).shoppingList) } catch (e) { setError(e instanceof ApiError ? e.message : 'No se ha podido volver a generar la lista de la compra.') } finally { setRegenerating(false) }
  }
  if (error && !list) return <div className="space-y-3"><Alert variant="destructive"><AlertCircle className="size-4" /><AlertDescription>{error}</AlertDescription></Alert><Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Reintentar</Button></div>
  if (!list || regenerating) return <GenerationProgress done={false} expectedMs={20_000} title="Preparando la lista de la compra" description="Sumando los ingredientes de las 14 comidas y cenas." className="" />
  const groups = SHOPPING_CATEGORIES.map(category => ({ category, items: list.items.filter(item => item.category === category) })).filter(group => group.items.length > 0)
  return <div>
    {error && <Alert variant="destructive" className="mb-4 print:hidden"><AlertCircle className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Para comidas y cenas: 1 persona de lunes a jueves, 2 el viernes y 4 el sábado y el domingo.</p><div className="flex gap-2 print:hidden"><Button variant="outline" onClick={regenerate}><RefreshCw className="size-4" />Volver a generar</Button><Button variant="outline" onClick={() => window.print()}><Printer className="size-4" />Imprimir lista</Button></div></div>
    {groups.length === 0 ? <p className="text-sm text-slate-500">No hay ingredientes que comprar.</p> : <div className="grid gap-4 sm:grid-cols-2">{groups.map(group => <section key={group.category} className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4"><h3 className="mb-2 text-sm font-semibold text-emerald-700">{group.category}</h3><ul className="divide-y divide-slate-100">{group.items.map((item, i) => <li key={i} className="flex items-baseline justify-between gap-3 py-1.5 text-sm"><span className="text-slate-800">{item.name}</span><span className="shrink-0 font-medium tabular-nums text-slate-500">{item.quantity}</span></li>)}</ul></section>)}</div>}
  </div>
}
