import { z } from 'zod'

// Validación compartida por las rutas de /api/families. Los correos se guardan en minúsculas y sin
// espacios, porque son la identidad de la persona (el de su sesión de Google).
export const FamilyNameSchema = z.string().trim().min(1, 'El nombre de la familia no puede estar vacío.').max(60, 'El nombre de la familia admite como máximo 60 caracteres.')
export const MemberEmailSchema = z.string().trim().toLowerCase().email('Hay un correo con formato no válido.').max(254)
export const MAX_MEMBERS = 20

// Hijos e hijas de la familia: solo el nombre, tal como se mostrará y como se le dirá a Gemini de quién es cada menú.
// Sin duplicados (sin distinguir mayúsculas ni tildes) para que cada nombre sea una clave única al subir menús.
export const MAX_CHILDREN = 10
export const ChildNameSchema = z.string().trim().min(1, 'El nombre no puede estar vacío.').max(30, 'Cada nombre admite como máximo 30 caracteres.').refine(name => !/[\u0000-\u001f\u007f]/.test(name), 'El nombre contiene caracteres no válidos.')
export const normalizeChildName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export const ChildrenSchema = z.array(ChildNameSchema).max(MAX_CHILDREN, `Admite como máximo ${MAX_CHILDREN} hijos o hijas.`).refine(names => new Set(names.map(normalizeChildName)).size === names.length, 'Hay dos hijos o hijas con el mismo nombre.')
