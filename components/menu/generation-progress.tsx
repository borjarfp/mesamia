'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

// Tiempo medio real de una generación completa (medido por el usuario: ~1,9 min). La barra avanza
// en lineal hasta ese tiempo, pero nunca pasa del 99% mientras la petición siga en vuelo — solo
// llega al 100% cuando `done` (la respuesta ya ha llegado), tarde lo que tarde.
export const EXPECTED_GENERATION_MS = 114_000
// "Buscar alternativas" en el modal de cambiar plato (a petición: "en principio pon 1 min").
export const EXPECTED_SUBSTITUTION_MS = 60_000

// Sirve para cualquier espera larga contra la IA: por defecto es la de generar la semana; el modal de
// cambiar plato le pasa su propio tiempo y textos. Se reinicia al montarse, así que cada búsqueda
// empieza de 0.
export function GenerationProgress({ done, expectedMs = EXPECTED_GENERATION_MS, title = 'Preparando tu menú semanal', description = 'Leyendo los menús, planificando la semana y eligiendo la mejor receta para cada plato.', className = 'mb-6' }: { done: boolean; expectedMs?: number; title?: string; description?: string; className?: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => { const start = Date.now(); const timer = setInterval(() => setElapsed(Date.now() - start), 250); return () => clearInterval(timer) }, [])
  const percent = done ? 100 : Math.min(99, Math.floor((elapsed / expectedMs) * 100))
  const remaining = Math.ceil((expectedMs - elapsed) / 1000)
  const status = done ? '¡Listo!' : remaining > 60 ? `Quedan unos ${Math.ceil(remaining / 60)} min` : remaining > 0 ? `Quedan unos ${remaining} s` : 'Casi listo, está tardando un poco más de lo normal…'
  return <div className={`${className} rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800`}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 font-medium"><Sparkles className="size-4 shrink-0" />{title}</span><span className="font-semibold tabular-nums">{percent}%</span></div><div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 ease-linear" style={{ width: `${percent}%` }} /></div><p className="mt-2 text-xs text-emerald-700">{status} · {description}</p></div>
}
