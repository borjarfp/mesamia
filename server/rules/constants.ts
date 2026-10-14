// Cuántas personas comen cada día (comida y cena): lunes a jueves 1, viernes 2, sábado y domingo 4.
// Pedido por el usuario. Se usa para las cantidades de las recetas de la IA y para la lista de la
// compra. Es una constante pura (sin zod) para poder importarla también desde el cliente.
// OJO: es igual para todas las familias (no está en las reglas por familia: si cambiara, las semanas
// ya guardadas mostrarían cantidades que no cuadran; haría falta guardar las personas en cada semana).
//
// Los límites semanales y de tiempo ya NO son constantes: son reglas de cada familia
// (server/rules/family-rules.ts, DEFAULT_FAMILY_RULES).
export const PEOPLE_BY_DAY = { lunes: 1, martes: 1, miercoles: 1, jueves: 1, viernes: 2, sabado: 4, domingo: 4 } as const
export const peopleLabel = (people: number) => `${people} ${people === 1 ? 'persona' : 'personas'}`
