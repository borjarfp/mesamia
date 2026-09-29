// Modo pruebas: constantes compartidas entre el navegador (lib/test-mode.ts) y el servidor
// (server/test-mode.ts). Fichero puro a propósito: el servidor no puede importar lib/test-mode.ts
// (usa window/sessionStorage) y el navegador no puede importar server/test-mode.ts (usa
// node:async_hooks).
export const TEST_MODE_PARAM = 'pruebas'
export const TEST_MODE_HEADER = 'x-mesamia-pruebas'
