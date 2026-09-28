'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, LoaderCircle, Trash2 } from 'lucide-react'
import { ApiError, deleteHistoryEntry } from '@/lib/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResponsiveModal } from '@/components/menu/responsive-modal'

// Borrar una semana guardada, siempre con confirmación (no se puede deshacer). Se usa en la lista
// de /guardados (`onDeleted` la quita de la lista) y dentro de /semana/[slug] (`redirectTo`, porque
// desde un Server Component no se puede pasar una función).
export function DeleteWeekButton({ id, label, onDeleted, redirectTo, compact }: { id: string; label: string; onDeleted?: () => void; redirectTo?: string; compact?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => {
    setDeleting(true)
    setError(null)
    try {
      await deleteHistoryEntry(id)
      setOpen(false)
      onDeleted?.()
      if (redirectTo) router.push(redirectTo)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se ha podido borrar la semana.')
    } finally {
      setDeleting(false)
    }
  }
  return <>
    {compact ? <Button variant="ghost" size="icon" onClick={() => { setError(null); setOpen(true) }} className="text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Borrar la semana ${label}`}><Trash2 /></Button> : <Button variant="outline" size="sm" onClick={() => { setError(null); setOpen(true) }} className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 print:hidden"><Trash2 data-icon="inline-start" />Borrar semana</Button>}
    <ResponsiveModal open={open} onOpenChange={next => !deleting && setOpen(next)} title="¿Borrar esta semana?" description={<>Se borrará "{label}" de Guardados, con sus recetas. No se puede deshacer.</>} footer={<><Button onClick={remove} disabled={deleting} className="gap-2 bg-red-600 hover:bg-red-700">{deleting ? <><LoaderCircle className="size-4 animate-spin" />Borrando...</> : 'Borrar'}</Button><Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>Cancelar</Button></>}>
      {error && <Alert className="border-red-100 bg-red-50 text-red-800"><AlertCircle className="size-4" /><AlertDescription>{error}</AlertDescription></Alert>}
    </ResponsiveModal>
  </>
}
