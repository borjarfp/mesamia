'use client'

import { FlaskConical } from 'lucide-react'
import { useTestMode } from '@/lib/test-mode'

// Aviso fijo mientras el modo pruebas está activo (?pruebas=1, ver lib/test-mode.ts): así nunca se
// confunde una semana de prueba con una de verdad. Se desactiva con ?pruebas=0.
export function TestModeBadge() {
  const active = useTestMode()
  if (!active) return null
  return <div className="pointer-events-none fixed right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 shadow-sm print:hidden" title="Sin llamadas a Gemini ni a Tavily. Se desactiva con ?pruebas=0"><FlaskConical className="size-3.5" />Modo pruebas · sin IA</div>
}
