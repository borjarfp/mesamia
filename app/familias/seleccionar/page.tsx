import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Utensils } from 'lucide-react'
import { FAMILY_COOKIE, requireSessionForPage, resolveFamilies } from '@/server/auth/family'
import { FamilyPicker } from '@/components/menu/family-picker'
import { PageShell } from '@/components/menu/page-shell'
import { ProfileMenu } from '@/components/menu/profile-menu'

// Selector de familia: se llega aquí al entrar con varias familias y sin ninguna elegida, o desde
// "Cambiar de familia" (?cambiar=1). Con una sola familia no hay nada que elegir: se entra directo.
export default async function SelectFamilyPage({ searchParams }: { searchParams: Promise<{ cambiar?: string }> }) {
  const [session, { cambiar }] = await Promise.all([requireSessionForPage(), searchParams])
  const { families, active } = await resolveFamilies(session, (await cookies()).get(FAMILY_COOKIE)?.value)
  if (families.length === 1 && !cambiar) redirect('/planificador')

  return <PageShell>
    <header className="px-5 pb-4 pt-8 sm:px-8">
      <div className="mb-6 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white"><Utensils className="size-5" /></div><span className="font-semibold tracking-tight">Mesa<span className="text-emerald-600">Mía</span></span></div><ProfileMenu /></div>
      <p className="mb-1 text-sm font-medium text-emerald-600">Tus familias</p>
      <h1 className="text-3xl font-semibold tracking-tight">¿Con qué familia quieres trabajar?</h1>
      <p className="mt-1 text-sm text-slate-500">Las semanas guardadas y los gustos de la IA son de cada familia.</p>
    </header>
    <div className="flex-1 px-5 pb-10 sm:px-8"><div className="max-w-xl space-y-4"><FamilyPicker families={families} activeId={active?.id} /><p className="text-sm text-slate-500">¿Quieres crear una familia o cambiar quién tiene acceso? <Link href="/perfil" className="font-medium text-emerald-700 hover:text-emerald-800">Configurar perfil</Link></p></div></div>
  </PageShell>
}
