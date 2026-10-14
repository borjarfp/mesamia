'use client'

import { useState, type FormEvent } from 'react'
import { LoaderCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import type { AllowedEmail } from '@/server/access/store'
import { addAccessEmail, ApiError, getAccessList, removeAccessEmail } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : 'Ha ocurrido un error inesperado.')
const dateOf = (iso: string) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

// Lista de correos con acceso a la app. El administrador (tú) siempre tiene acceso y no se puede quitar. Quitar a
// alguien le cierra la sesión que tenga abierta.
export function AdminAccess({ adminEmail, initial }: { adminEmail: string; initial: AllowedEmail[] }) {
  const [emails, setEmails] = useState(initial)
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function reload() { setEmails((await getAccessList()).emails) }
  // El administrador va aparte (siempre tiene acceso); nunca sale como una fila que se pueda quitar.
  const others = emails.filter(item => item.email !== adminEmail.toLowerCase())
  async function add(event: FormEvent) {
    event.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!EMAIL.test(email)) return setError('Escribe un correo válido.')
    setBusy('add'); setError(null); setNotice(null)
    try { const { added } = await addAccessEmail(email); await reload(); setNewEmail(''); setNotice(added ? `${email} ya puede entrar.` : `${email} ya estaba en la lista.`) }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(null) }
  }
  async function remove(email: string) {
    setBusy(email); setError(null); setNotice(null)
    try { await removeAccessEmail(email); await reload(); setConfirming(null); setNotice(`${email} ya no puede entrar.`) }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(null) }
  }

  return <div className="space-y-4">
    <form onSubmit={add} noValidate className="rounded-2xl border border-slate-200 p-4 sm:p-5">
      <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Dar acceso a un correo</span><span className="flex gap-2"><Input type="email" value={newEmail} placeholder="correo@gmail.com" onChange={event => { setNewEmail(event.target.value); setError(null) }} /><Button type="submit" disabled={!newEmail.trim() || busy !== null} className="bg-emerald-600 text-white hover:bg-emerald-700">{busy === 'add' ? <LoaderCircle className="animate-spin" /> : <Plus />}Dar acceso</Button></span></label>
      <p className="mt-2 text-xs text-slate-500">Tiene que ser el correo de la cuenta de Google con la que va a entrar.</p>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
    </form>
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5"><h2 className="text-base font-semibold tracking-tight">Pueden entrar <span className="font-normal text-slate-500">({others.length + 1})</span></h2></div>
      <ul className="divide-y divide-slate-100">
        <li className="flex items-center gap-3 px-4 py-3 sm:px-5"><ShieldCheck className="size-4 shrink-0 text-emerald-600" /><span className="min-w-0 flex-1 truncate text-sm font-medium">{adminEmail}</span><span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">Administrador</span></li>
        {others.map(item => <li key={item.email} className="px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.email}</span><span className="block text-xs text-slate-500">{item.addedBy === 'migración' ? 'Ya usaba la app (estaba en una familia)' : `Añadido por ${item.addedBy}`} · {dateOf(item.createdAt)}</span></span>
            {confirming !== item.email && <Button variant="ghost" size="sm" onClick={() => setConfirming(item.email)} disabled={busy !== null} className="text-red-600 hover:text-red-700"><Trash2 />Quitar acceso</Button>}
          </div>
          {confirming === item.email && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>¿Quitar el acceso a {item.email}? Dejará de poder entrar y se le cerrará la sesión que tenga abierta. Sus familias y semanas no se borran.</p><div className="mt-2 flex gap-2"><Button variant="outline" size="sm" onClick={() => setConfirming(null)} disabled={busy !== null}>Cancelar</Button><Button size="sm" onClick={() => remove(item.email)} disabled={busy !== null} className="bg-red-600 text-white hover:bg-red-700">{busy === item.email && <LoaderCircle className="animate-spin" />}Sí, quitar acceso</Button></div></div>}
        </li>)}
        {others.length === 0 && <li className="px-4 py-4 text-sm text-slate-500 sm:px-5">Todavía no has dado acceso a nadie más. Solo tú puedes entrar.</li>}
      </ul>
    </section>
  </div>
}
