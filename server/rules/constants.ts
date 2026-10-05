// Límites semanales tal como los pide el enunciado. Se cuentan sobre los 14 huecos que planifica el
// sistema (comida + cena de los 7 días); las comidas escolares de las niñas no entran en el recuento.
export const MAX_HUEVO = 4
export const MAX_AVE = 3
export const MAX_PESCADO = 3
export const MAX_CARNE_ROJA = 1
export const MIN_LEGUMBRE = 4

// De lunes a viernes: recetas fáciles de "40/50 min" como mucho. Se le pide a Gemini apuntar a 40 y
// el motor de reglas rechaza lo que pase de 50 (server/rules/restrictions.ts).
export const TARGET_WEEKDAY_MINUTES = 40
export const MAX_WEEKDAY_MINUTES = 50

// Cuántas personas comen cada día (comida y cena): lunes a jueves 1, viernes 2, sábado y domingo 4.
// Pedido por el usuario. Se usa para las cantidades de las recetas de la IA y para la lista de la
// compra. Es una constante pura (sin zod) para poder importarla también desde el cliente.
export const PEOPLE_BY_DAY = { lunes: 1, martes: 1, miercoles: 1, jueves: 1, viernes: 2, sabado: 4, domingo: 4 } as const
export const peopleLabel = (people: number) => `${people} ${people === 1 ? 'persona' : 'personas'}`
