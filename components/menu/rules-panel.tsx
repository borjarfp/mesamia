'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronDown, ListChecks } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ruleGroups } from '@/lib/menu-data'

// Recuerda en este navegador si se ha ocultado el panel (misma preferencia en /planificador y en
// las semanas guardadas). Es solo una comodidad: si localStorage falla, el panel sale abierto.
const STORAGE_KEY = 'mesamia:rules-panel-open'

// Todas las reglas del menú, abiertas por defecto (a petición: "poder verlas y tenerlas en cuenta")
// y ocultables con un clic. `note` añade una aclaración bajo el título (la usan las semanas
// guardadas: las reglas son las actuales, y la semana puede ser de antes de alguna).
export function RulesPanel({ note }: { note?: string }) {
  const [open, setOpen] = useState(true)
  useEffect(() => { try { if (localStorage.getItem(STORAGE_KEY) === 'false') setOpen(false) } catch {} }, [])
  const toggle = (next: boolean) => { setOpen(next); try { localStorage.setItem(STORAGE_KEY, String(next)) } catch {} }
  return <Collapsible open={open} onOpenChange={toggle} className="mb-6 rounded-xl border border-slate-100 bg-slate-50 print:hidden"><CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-4 text-left"><span className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="size-4 text-emerald-600" />Reglas del menú</span><span className="flex items-center gap-1 text-xs font-medium text-emerald-700">{open ? 'Ocultar' : 'Mostrar'}<ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} /></span></CollapsibleTrigger><CollapsibleContent className="px-4 pb-4">{note && <p className="-mt-1 mb-3 text-xs text-slate-500">{note}</p>}<div className="grid gap-4 md:grid-cols-3">{ruleGroups.map(group => <div key={group.title}><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-700">{group.title}</p><ul className="flex flex-col gap-1.5 text-xs leading-relaxed text-slate-600">{group.rules.map(rule => <li key={rule} className="flex gap-2"><Check className="mt-0.5 size-3 shrink-0 text-emerald-600" />{rule}</li>)}</ul></div>)}</div></CollapsibleContent></Collapsible>
}
