'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { ArrowLeftRight, ChevronDown, LogOut, User, UserCog, Users } from 'lucide-react'
import type { Family } from '@/server/types'
import { listFamilies } from '@/lib/api'

// El logout es un POST (lo borra la cookie en el servidor y responde 303 a /login): se envía con un
// formulario creado al vuelo para que el navegador siga la redirección, sin pasar por fetch.
function logout() {
  const form = document.createElement('form')
  form.method = 'post'
  form.action = '/api/auth/logout'
  document.body.appendChild(form)
  form.submit()
}

const itemClass = 'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-highlighted:bg-slate-100 data-highlighted:text-slate-900'

// Desplegable de perfil, arriba a la derecha de las cabeceras: familia activa (si la hay), "Cambiar de
// familia" (solo con varias), "Configurar perfil" (/perfil) y "Cerrar sesión".
export function ProfileMenu() {
  const [families, setFamilies] = useState<Family[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => { let alive = true; listFamilies().then(result => { if (alive) { setFamilies(result.families); setActiveId(result.activeId) } }).catch(() => {}); return () => { alive = false } }, [])
  const active = families.find(family => family.id === activeId)
  return <div className="print:hidden"><Menu.Root><Menu.Trigger className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-3 text-sm font-medium text-slate-700 shadow-xs outline-none transition-colors hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-emerald-600/30 data-popup-open:bg-slate-50"><span className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><User className="size-4" /></span>Perfil<ChevronDown className="size-4 text-slate-400" /></Menu.Trigger><Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50"><Menu.Popup className="min-w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none">{active && <div className="flex items-center gap-2 border-b border-slate-100 px-3 pb-2 pt-1.5 text-xs text-slate-500"><Users className="size-3.5 shrink-0" /><span className="truncate">Familia: <span className="font-medium text-slate-700">{active.name}</span></span></div>}{families.length > 1 && <Menu.LinkItem closeOnClick className={itemClass} render={<Link href="/familias/seleccionar?cambiar=1" />}><ArrowLeftRight className="size-4 text-slate-500" />Cambiar de familia</Menu.LinkItem>}<Menu.LinkItem closeOnClick className={itemClass} render={<Link href="/perfil" />}><UserCog className="size-4 text-slate-500" />Configurar perfil</Menu.LinkItem><Menu.Item className={itemClass} onClick={logout}><LogOut className="size-4 text-slate-500" />Cerrar sesión</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>
}
