import Link from 'next/link'
import { cookies } from 'next/headers'
import { ChevronLeft, Lock } from 'lucide-react'
import { FAMILY_COOKIE, requireSessionForPage, resolveFamilies } from '@/server/auth/family'
import { FamiliesManager } from '@/components/menu/families-manager'
import { Input } from '@/components/ui/input'
import { PageShell } from '@/components/menu/page-shell'
import { ProfileMenu } from '@/components/menu/profile-menu'

// Perfil de solo lectura: nombre y correo salen de la sesión (lo que Google devolvió al iniciar
// sesión), no hay nada que guardar en base de datos porque no se pueden modificar. proxy.ts ya
// exige sesión; el redirect es por si la cookie caducara entre la comprobación y el render.
export default async function ProfilePage() {
  const session = await requireSessionForPage()
  const { families, active } = await resolveFamilies(session, (await cookies()).get(FAMILY_COOKIE)?.value)
  const initial = (session.name || session.email).charAt(0).toUpperCase()

  return <PageShell>
    <header className="px-5 pb-4 pt-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3"><Link href="/planificador" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"><ChevronLeft className="size-4" />Volver</Link><ProfileMenu /></div>
      <p className="mb-1 text-sm font-medium text-emerald-600">Tu cuenta</p>
      <h1 className="text-3xl font-semibold tracking-tight">Perfil</h1>
      <p className="mt-1 text-sm text-slate-500">Tus datos y las familias con las que planificas.</p>
    </header>
    <div className="flex flex-1 flex-col px-5 pb-8 sm:px-8">
      {/* Escritorio (lg): tus datos a la izquierda, fijos, y las familias a la derecha, todo a la vez. En móvil/tablet, las familias van debajo. */}
      <div className="grid gap-8 lg:flex-1 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:gap-10">
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center gap-4">
            {session.picture
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={session.picture} alt="" referrerPolicy="no-referrer" className="size-14 shrink-0 rounded-full object-cover" />
              : <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-2xl font-semibold text-emerald-700">{initial}</div>}
            <p className="min-w-0 break-words text-lg font-semibold tracking-tight">{session.name || session.email}</p>
          </div>
          <div className="space-y-4">
            <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Nombre</span><Input readOnly value={session.name ?? ''} placeholder="Sin nombre" className="bg-slate-50 text-slate-600" /></label>
            <label className="block space-y-1.5"><span className="text-sm font-medium text-slate-700">Correo electrónico</span><Input readOnly value={session.email} className="bg-slate-50 text-slate-600" /></label>
          </div>
          <p className="flex items-start gap-2 text-sm text-slate-500"><Lock className="mt-0.5 size-4 shrink-0" />Estos datos vienen de tu cuenta de Google y no se pueden modificar aquí.</p>
        </aside>
        <section className="flex min-w-0 flex-col gap-4"><div><h2 className="text-xl font-semibold tracking-tight">Familias</h2><p className="text-sm text-slate-500">Las semanas guardadas son de cada familia. Aquí puedes cambiar su nombre, quién tiene acceso, sus reglas del menú y crear nuevas.</p></div><FamiliesManager initialFamilies={families} activeId={active?.id ?? null} myEmail={session.email} /></section>
      </div>
    </div>
  </PageShell>
}
