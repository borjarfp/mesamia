import { z } from 'zod'

// Validación compartida por las rutas de /api/families. Los correos se guardan en minúsculas y sin
// espacios, porque son la identidad de la persona (el de su sesión de Google).
export const FamilyNameSchema = z.string().trim().min(1, 'El nombre de la familia no puede estar vacío.').max(60, 'El nombre de la familia admite como máximo 60 caracteres.')
export const MemberEmailSchema = z.string().trim().toLowerCase().email('Hay un correo con formato no válido.').max(254)
export const MAX_MEMBERS = 20
