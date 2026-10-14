'use client'

import { useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import type { Family } from '@/server/types'
import { ApiError, createFamily, deleteFamily, selectFamily, updateFamily } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Ha ocurrido un error inesperado.'

type Busy = 'save' | 'delete' | 'select' | null

// Una familia editable: solo el nombre y las personas con acceso (por correo). Los cambios no se
// guardan hasta pulsar "Guardar cambios".
function FamilyCard({ family, active, canDelete, myEmail, onSaved, onDeleted }: { family: Family; active: boolean; canDelete: boolean; myEmail: string; onSaved: (family: Family) => void; onDeleted: (id: string) => void }) {
  const [name, setName] = useState(family.name)
  const [members, setMembers] = useState(family.members)
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const dirty = name.trim() !== family.name || members.join('|') !== family.members.join('|')

  function addMember(event: FormEvent) {
    event.preventDefault()
    const email = newEmail.trim().toLowerCase()
    if (!EMAIL.test(email)) return setError('Escribe un correo válido.')
    if (members.includes(email)) return setError('Ese correo ya está en la familia.')
    setMembers([...members, email]); setNewEmail(''); setError(null); setSaved(false)
  }
  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    setBusy(kind); setError(null)
    try { await task() } catch (e) { setError(errorMessage(e)) } finally { setBusy(null) }
  }
  const save = () => run('save', async () => { const { family: updated } = await updateFamily(family.id, { name: name.trim(), members }); onSaved(updated); setSaved(true) })
  const remove = () => run('delete', async () => { await deleteFamily(family.id); onDeleted(family.id) })
  const use = () => run('select', async () => { await selectFamily(family.id); window.location.assign('/planificador') })

  return <section className={`rounded-2xl border p-4 sm:p-5 ${active ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {active ? <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">Familia activa</span>
        : <Button variant="outline" size="sm" onClick={use} disabled={busy !== null}>{busy === 'select' && <LoaderCircle className="animate-spin" />}Usar esta familia</Button>}
    </div>
    <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Nombre de la familia</span><Input value={name} maxLength={60} onChange={event => { setName(event.target.value); setSaved(false) }} /></label>
    <div className="mt-4 space-y-2">
      <p className="text-sm font-medium text-slate-700">Personas con acceso</p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">{members.map(email => <li key={email} className="flex items-center justify-between gap-2 px-3 py-2 text-sm"><span className="min-w-0 truncate">{email}{email === myEmail && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Tú</span>}</span>{email !== myEmail && <button type="button" aria-label={`Quitar a ${email}`} onClick={() => { setMembers(members.filter(item => item !== email)); setSaved(false) }} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"><X className="size-4" /></button>}</li>)}</ul>
      <form onSubmit={addMember} className="flex gap-2"><Input type="email" value={newEmail} placeholder="correo@gmail.com" onChange={event => setNewEmail(event.target.value)} /><Button type="submit" variant="outline"><Plus />Añadir</Button></form>
      <p className="text-xs text-slate-500">Deben entrar con la cuenta de Google de ese correo.</p>
    </div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button onClick={save} disabled={!dirty || !name.trim() || busy !== null} className="bg-emerald-600 text-white hover:bg-emerald-700">{busy === 'save' && <LoaderCircle className="animate-spin" />}Guardar cambios</Button>
      {saved && !dirty && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check className="size-4" />Guardado</span>}
      <span className="flex-1" />
      {!confirming && <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} disabled={!canDelete || busy !== null} title={canDelete ? undefined : 'Tienes que conservar al menos una familia'} className="text-red-600 hover:text-red-700"><Trash2 />Borrar familia</Button>}
    </div>
    {confirming && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p>¿Borrar «{family.name}»? Se borra para todas sus personas y se pierden sus semanas guardadas. No se puede deshacer.</p><div className="mt-2 flex gap-2"><Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={busy !== null}>Cancelar</Button><Button size="sm" onClick={remove} disabled={busy !== null} className="bg-red-600 text-white hover:bg-red-700">{busy === 'delete' && <LoaderCircle className="animate-spin" />}Sí, borrar</Button></div></div>}
    {!canDelete && <p className="mt-2 text-xs text-slate-500">Es tu única familia, no se puede borrar.</p>}
  </section>
}

// Sección "Familias" del perfil: editar las que tiene la persona y crear nuevas.
export function FamiliesManager({ initialFamilies, activeId: initialActiveId, myEmail }: { initialFamilies: Family[]; activeId: string | null; myEmail: string }) {
  const [families, setFamilies] = useState(initialFamilies)
  const [activeId, setActiveId] = useState(initialActiveId)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!newName.trim()) return
    setCreating(true); setError(null)
    try { const { family } = await createFamily(newName.trim()); setFamilies(current => [...current, family]); setNewName('') }
    catch (e) { setError(errorMessage(e)) } finally { setCreating(false) }
  }
  function removed(id: string) {
    setFamilies(current => current.filter(family => family.id !== id))
    // El servidor limpia la selección si era la activa: con varias familias hay que volver a elegir.
    if (id === activeId) { setActiveId(null); window.location.assign('/familias/seleccionar') }
  }

  return <div className="space-y-4">
    {families.map(family => <FamilyCard key={family.id} family={family} active={family.id === activeId || (activeId === null && families.length === 1)} canDelete={families.length > 1} myEmail={myEmail} onSaved={updated => setFamilies(current => current.map(item => item.id === updated.id ? updated : item))} onDeleted={removed} />)}
    <form onSubmit={create} className="rounded-2xl border border-dashed border-slate-300 p-4 sm:p-5">
      <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Nueva familia</span><span className="flex gap-2"><Input value={newName} maxLength={60} placeholder="Nombre de la familia" onChange={event => setNewName(event.target.value)} /><Button type="submit" disabled={!newName.trim() || creating} className="bg-emerald-600 text-white hover:bg-emerald-700">{creating ? <LoaderCircle className="animate-spin" /> : <Plus />}Crear</Button></span></label>
      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </form>
  </div>
}
