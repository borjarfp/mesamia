import { Utensils } from 'lucide-react'
import { PageShell } from '@/components/menu/page-shell'

const ERRORS: Record<string, string> = {
  cancelled: 'Has cancelado el inicio de sesión.',
  state: 'La sesión de inicio ha caducado. Inténtalo de nuevo.',
  google: 'Google no ha podido verificar tu cuenta. Inténtalo de nuevo.',
  forbidden: 'Esta cuenta de Google no tiene acceso a MesaMía. Pide acceso al administrador.',
  revoked: 'Ya no tienes acceso a MesaMía. Si crees que es un error, habla con el administrador.',
  access_check: 'No se ha podido comprobar tu acceso ahora mismo. Inténtalo de nuevo en un momento.',
  config: 'El inicio de sesión no está configurado en el servidor.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams
  const href = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : '/api/auth/google'
  return <PageShell><div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-16 text-center"><div className="flex items-center gap-2"><div className="flex size-11 items-center justify-center rounded-xl bg-emerald-600 text-white"><Utensils className="size-6" /></div><span className="text-2xl font-semibold tracking-tight">Mesa<span className="text-emerald-600">Mía</span></span></div><div><h1 className="text-3xl font-semibold tracking-tight">Bienvenido</h1><p className="mt-1 text-sm text-slate-500">Inicia sesión para planificar los menús de la semana.</p></div>{error && <p role="alert" className="max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{ERRORS[error] ?? 'No se ha podido iniciar sesión.'}</p>}<a href={href} className="inline-flex min-h-12 w-full max-w-sm items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"><svg viewBox="0 0 48 48" className="size-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.1z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" /></svg>Continuar con Google</a></div></PageShell>
}
