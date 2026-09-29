import type { ReactNode } from 'react'
import { TestModeBadge } from '@/components/menu/test-mode-badge'

// Envoltorio visual compartido por /planificador, /guardados y /semana/[slug]: el fondo gris,
// la "tarjeta" blanca a ancho completo y el layout en columna que hace que el contenido
// (flex-1 en cada página) ocupe el resto de la pantalla.
export function PageShell({ children }: { children: ReactNode }) { return <main className="min-h-screen bg-[#f5f8f6] text-slate-900"><div className="mx-auto flex min-h-screen w-full flex-col bg-white shadow-sm">{children}</div><TestModeBadge /></main> }
