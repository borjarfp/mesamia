import { useEffect, useState } from 'react'
import { TEST_MODE_HEADER, TEST_MODE_PARAM } from '@/lib/test-mode-constants'

// Modo pruebas (oculto): `?pruebas=1` en la URL lo activa y lo recuerda en sessionStorage para el
// resto de la pestaña, así se puede navegar entre Planificador y Guardados sin arrastrar el
// parámetro; `?pruebas=0` lo desactiva. Mientras está activo, cada llamada a la API lleva la
// cabecera TEST_MODE_HEADER y el servidor no llama a Gemini ni a Tavily (ver server/test-mode.ts).
const STORAGE_KEY = 'mesamia:modo-pruebas'

export function isTestModeActive(): boolean {
  if (typeof window === 'undefined') return false
  const param = new URLSearchParams(window.location.search).get(TEST_MODE_PARAM)
  try {
    if (param === '1') sessionStorage.setItem(STORAGE_KEY, '1')
    if (param === '0') sessionStorage.removeItem(STORAGE_KEY)
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return param === '1'
  }
}

// Cabeceras a añadir a cada fetch de lib/api.ts.
export function testModeHeaders(): Record<string, string> {
  return isTestModeActive() ? { [TEST_MODE_HEADER]: '1' } : {}
}

// Para pintar cosas solo en modo pruebas. Empieza en false y se lee tras montar: en el servidor no
// hay sessionStorage, y así no hay desajuste de hidratación.
export function useTestMode(): boolean {
  const [active, setActive] = useState(false)
  useEffect(() => setActive(isTestModeActive()), [])
  return active
}
