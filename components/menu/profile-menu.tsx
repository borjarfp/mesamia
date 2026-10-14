'use client'

import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { ChevronDown, LogOut, User, UserCog } from 'lucide-react'

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

// Desplegable de perfil, arriba a la derecha de las cabeceras: "Configurar perfil" (/perfil) y
// "Cerrar sesión". No necesita datos del usuario, así que no pide nada al servidor.
export function ProfileMenu() { return <div className="print:hidden"><Menu.Root><Menu.Trigger className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-3 text-sm font-medium text-slate-700 shadow-xs outline-none transition-colors hover:bg-slate-50 focus-visible:ring-3 focus-visible:ring-emerald-600/30 data-popup-open:bg-slate-50"><span className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><User className="size-4" /></span>Perfil<ChevronDown className="size-4 text-slate-400" /></Menu.Trigger><Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50"><Menu.Popup className="min-w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none"><Menu.LinkItem closeOnClick className={itemClass} render={<Link href="/perfil" />}><UserCog className="size-4 text-slate-500" />Configurar perfil</Menu.LinkItem><Menu.Item className={itemClass} onClick={logout}><LogOut className="size-4 text-slate-500" />Cerrar sesión</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div> }
