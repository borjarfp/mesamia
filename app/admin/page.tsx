import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getAccessStore } from '@/server/access/store'
import { isAdminEmail } from '@/server/auth/access'
import { requireSessionForPage } from '@/server/auth/family'
import { AdminAccess } from '@/components/menu/admin-access'
import { PageShell } from '@/components/menu/page-shell'
import { ProfileMenu } from '@/components/menu/profile-menu'

// Pantalla de administración: solo el administrador (ADMIN_EMAIL). Para cualquier otra persona es un 404, no un
// "prohibido": ni siquiera se revela que existe. Aquí se decide quién puede entrar a la app.
export default async function AdminPage() {
  const session = await requireSessionForPage()
  if (!isAdminEmail(session.email)) notFound()
  const emails = await getAccessStore().list()

  return <PageShell>
    <header className="px-5 pb-4 pt-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3"><Link href="/planificador" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"><ChevronLeft className="size-4" />Volver</Link><ProfileMenu /></div>
      <p className="mb-1 text-sm font-medium text-emerald-600">Administración</p>
      <h1 className="text-3xl font-semibold tracking-tight">Acceso a la app</h1>
      <p className="mt-1 text-sm text-slate-500">Solo pueden entrar con Google los correos de esta lista (y tú, siempre).</p>
    </header>
    <div className="flex-1 px-5 pb-10 sm:px-8"><AdminAccess adminEmail={session.email} initial={emails} /></div>
  </PageShell>
}
