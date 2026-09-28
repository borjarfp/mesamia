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
