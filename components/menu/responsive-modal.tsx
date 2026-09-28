'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'

// Un mismo modal que en escritorio (≥ md, 768px) es un Dialog centrado y en móvil es el Drawer que
// sube desde abajo (a petición: "en escritorio como un modal en el centro y en mobile como ahora").
// Lo usan los dos modales de WeekView (cambiar plato y confirmar planificación). Los botones de
// cerrar van en `footer` como botones normales con onClick → onOpenChange(false), no con
// DrawerClose/DialogClose, para que el mismo contenido sirva en los dos.
const DESKTOP_QUERY = '(min-width: 768px)'
const subscribe = (onChange: () => void) => { const query = window.matchMedia(DESKTOP_QUERY); query.addEventListener('change', onChange); return () => query.removeEventListener('change', onChange) }
// En el servidor no hay viewport: se asume móvil. No hay desajuste de hidratación que importe
// porque los modales nunca están abiertos en el primer render.
const useIsDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_QUERY).matches, () => false)

export function ResponsiveModal({ open, onOpenChange, title, description, children, footer }: { open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const isDesktop = useIsDesktop()
  if (isDesktop) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><div className="flex flex-col gap-1 p-5 pb-3"><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</div><div className="flex flex-col gap-3 px-5">{children}</div>{footer && <div className="flex flex-row-reverse flex-wrap gap-2 p-5 pt-4">{footer}</div>}</DialogContent></Dialog>
  return <Drawer open={open} onOpenChange={onOpenChange}><DrawerContent><div className="mx-auto flex min-h-0 w-full max-w-2xl flex-col overflow-y-auto"><DrawerHeader className="text-left"><DrawerTitle>{title}</DrawerTitle>{description && <DrawerDescription>{description}</DrawerDescription>}</DrawerHeader><div className="flex flex-col gap-3 px-4">{children}</div>{footer && <DrawerFooter className="gap-2 pt-4">{footer}</DrawerFooter>}</div></DrawerContent></Drawer>
}
