import type { ReactNode } from 'react'
import { requireFamilyForPage } from '@/server/auth/family'

// Puerta de familia: sin familia activa (tiene varias y no ha elegido) va al selector. La
// comprobación de verdad, contra la BD, está en cada endpoint de /api/**; esto solo evita enseñar la
// pantalla vacía.
export default async function Layout({ children }: { children: ReactNode }) {
  await requireFamilyForPage()
  return children
}
