// Los 5 sitios de recetas en los que se busca con Tavily. Módulo puro (sin @tavily/core, sin env,
// sin zod) a propósito: lo importan tanto server/clients/tavily.ts (para filtrar resultados) como
// el frontend (RulesPanel, vía lib/menu-data.ts, para listarlos en pantalla), así que lo que se ve
// es siempre exactamente lo que se consulta.

export type RecipeSourceName = 'Cookidoo' | 'El Comidista' | 'Directo al Paladar' | 'Cookpad' | 'Petitchef'

// El enunciado pide restringir "estrictamente" a estos 5 sitios. `includeDomains` de Tavily solo
// filtra por dominio, y El Comidista no es un dominio propio: vive bajo una ruta de elpais.com. Por
// eso, además de mandar los dominios permitidos a Tavily, cada resultado se vuelve a comprobar
// (dominio + ruta cuando aplica) antes de aceptarlo — no nos fiamos solo del filtro del proveedor.
//
// `recipePath`: además, la URL tiene que ser una página de UNA receta, no un listado. Tavily devuelve
// a menudo páginas de búsqueda (cookpad.com/es/buscar/...) o de categoría, y antes se aceptaban como
// "receta" — el badge del plato acababa enlazando a una lista de resultados (visto probando con la
// API real). El Comidista no tiene un patrón de URL propio para recetas (son artículos), así que
// ahí solo se exige la ruta de la sección.
//
// `homeUrl` y `note` son solo para mostrarlos en pantalla.
export const RECIPE_SOURCES: Array<{ domain: string; pathPrefix?: string; recipePath?: RegExp; label: RecipeSourceName; homeUrl: string; note?: string }> = [
  { domain: 'cookidoo.es', recipePath: /^\/recipes\/recipe\//, label: 'Cookidoo', homeUrl: 'https://cookidoo.es', note: 'búsqueda propia; recetas de Thermomix, los pasos se ven con tu suscripción' },
  { domain: 'elpais.com', pathPrefix: '/gastronomia/el-comidista', label: 'El Comidista', homeUrl: 'https://elpais.com/gastronomia/el-comidista/' },
  { domain: 'directoalpaladar.com', recipePath: /receta/, label: 'Directo al Paladar', homeUrl: 'https://www.directoalpaladar.com' },
  { domain: 'cookpad.com', recipePath: /^\/[a-z]{2}\/recetas\/\d+/, label: 'Cookpad', homeUrl: 'https://cookpad.com/es' },
  { domain: 'petitchef.es', recipePath: /^\/recetas\//, label: 'Petitchef', homeUrl: 'https://www.petitchef.es' },
]
