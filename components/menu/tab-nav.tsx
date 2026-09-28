import Link from 'next/link'
import { CalendarDays, History } from 'lucide-react'

// Navegación entre /planificador y /guardados: dos páginas reales, no pestañas con estado
// compartido, así que esto es un <nav> con dos <Link>, no el componente Tabs de base-ui.
const tabClass = (active: boolean) => `flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${active ? 'bg-white text-emerald-700 shadow-sm [&_svg]:text-emerald-600' : 'text-slate-500'}`

export function TabNav({ active }: { active: 'planner' | 'history' }) { return <nav className="sticky top-0 z-20 mx-5 mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 sm:mx-8 print:hidden"><Link href="/planificador" className={tabClass(active === 'planner')}><CalendarDays className="size-4" />Planificador</Link><Link href="/guardados" className={tabClass(active === 'history')}><History className="size-4" />Guardados</Link></nav> }
