'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, FileText, LoaderCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export type UploadedFile = { id: string; file: File; child: string }

// Menús escolares de los hijos e hijas de la familia (los nombres salen de la familia activa, se editan en Perfil).
// Una fila por hijo o hija con su propia zona de subida (botón o arrastrar): así cada archivo queda asociado a
// quien es sin tener que corregirlo después. Aquí NO se añaden ni se quitan: eso se hace en la configuración de la
// familia (Perfil → Familias → "Hijos e hijas").
export function SchoolMenuUploads({ kids, uploaded, onAddFiles, onRemoveFile }: { kids: string[] | null; uploaded: UploadedFile[]; onAddFiles: (child: string, files: FileList | File[] | null) => void; onRemoveFile: (id: string) => void }) {
  const [dragging, setDragging] = useState<string | null>(null)

  return <Card className="mb-5 overflow-hidden border-emerald-100 bg-emerald-50/60 shadow-none print:hidden"><CardContent className="p-4">
    <div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-white p-2 text-emerald-600"><FileText className="size-5" /></div><div className="min-w-0 flex-1"><p className="font-medium">Menús del cole o la guardería <span className="font-normal text-slate-400">(opcional)</span></p><p className="mt-0.5 text-xs leading-relaxed text-slate-500">Si quieres, sube el menú de cada hijo o hija (PDF o imagen), o arrástralo sobre su nombre. Sirve para que la cena no repita lo que comen ese día en el cole y para que la comida de los adultos se le parezca.</p></div></div>
    {kids === null && <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="size-3.5 animate-spin" />Cargando…</p>}
    {kids && kids.length === 0 && <p className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-600">¿Tienes hijos o hijas? Añádelos en la configuración de la familia para subir sus menús. Si no, puedes generar el menú igualmente. <Link href="/perfil" className="font-medium text-emerald-700 hover:underline">Ir a Perfil</Link></p>}
    {kids && kids.length > 0 && <ul className="mt-3 space-y-2">{kids.map(kid => {
      const files = uploaded.filter(item => item.child === kid)
      return <li key={kid} onDragOver={event => { event.preventDefault(); setDragging(kid) }} onDragLeave={() => setDragging(current => (current === kid ? null : current))} onDrop={event => { event.preventDefault(); setDragging(null); onAddFiles(kid, event.dataTransfer.files) }} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-white px-3 py-2.5 transition ${dragging === kid ? 'border-emerald-400 ring-2 ring-emerald-300' : 'border-emerald-100'}`}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">{kid.charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{kid}</span>{files.length === 0 ? <span className="block text-xs text-slate-400">Sin menú todavía</span> : <span className="mt-1 flex flex-wrap gap-1.5">{files.map(item => <Badge key={item.id} variant="secondary" className="gap-1.5 bg-emerald-50 text-xs"><Check className="size-3 text-emerald-600" />{item.file.name}<button type="button" onClick={() => onRemoveFile(item.id)} aria-label={`Quitar ${item.file.name}`}><X className="size-3" /></button></Badge>)}</span>}</span>
        <label className="cursor-pointer rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"><input type="file" accept=".pdf,image/*" multiple className="sr-only" aria-label={`Subir el menú de ${kid}`} onChange={event => { onAddFiles(kid, event.target.files); event.target.value = '' }} />{files.length === 0 ? 'Subir menú' : 'Añadir otro'}</label>
      </li>
    })}</ul>}
  </CardContent></Card>
}
