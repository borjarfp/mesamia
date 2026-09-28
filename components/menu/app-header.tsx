'use client'

import type { ReactNode } from 'react'
import { Utensils } from 'lucide-react'

// Cabecera compartida por /planificador y /guardados: logo + eyebrow/título/subtítulo. `title` admite
// un nodo para que /planificador pueda meter ahí su selector de semana.
export function AppHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: ReactNode; subtitle: string }) { return <header className="px-5 pb-4 pt-8 sm:px-8"><div className="mb-6 flex items-center"><div className="flex items-center gap-2"><div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><Utensils className="size-5" /></div><span className="font-semibold tracking-tight">Mesa<span className="text-emerald-600">Mía</span></span></div></div><p className="mb-1 text-sm font-medium text-emerald-600">{eyebrow}</p>{typeof title === 'string' ? <h1 className="text-3xl font-semibold tracking-tight">{title}</h1> : title}<p className="mt-1 text-sm text-slate-500">{subtitle}</p></header> }
