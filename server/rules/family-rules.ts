// Reglas del menú de UNA familia: el tipo, los valores por defecto y las comprobaciones puras.
// Módulo puro (sin zod, sin env, sin código de servidor) para poder importarlo también desde el
// cliente (el editor de reglas y el RulesPanel). El esquema zod con el que se valida lo que llega por
// la API está en family-rules-schema.ts (solo servidor).
//
// Es la ÚNICA fuente de verdad: el motor de reglas (engine.ts, restrictions.ts), los prompts de
// Gemini (prompts/familyRules.ts) y el texto que ve el usuario (lib/menu-data.ts) se generan todos a
// partir de este objeto, así que no pueden desincronizarse.

// Pescados/mariscos elegibles. Los términos son lo que busca restrictions.ts (palabra completa, sin
// acentos, plural opcional). Un pescado que no esté en ninguna entrada no se detecta.
export const FISH_CATALOG = [
  { key: 'merluza', label: 'Merluza / pescadilla', terms: ['merluza', 'pescadilla'] },
  { key: 'salmon', label: 'Salmón', terms: ['salmon'] },
  { key: 'cefalopodos', label: 'Pota, calamar, pulpo y sepia', terms: ['pota', 'calamar', 'chipiron', 'puntillita', 'pulpo', 'sepia', 'choco'] },
  { key: 'bacalao', label: 'Bacalao', terms: ['bacalao', 'abadejo', 'bacaladilla'] },
  { key: 'dorada', label: 'Dorada', terms: ['dorada'] },
  { key: 'lubina', label: 'Lubina', terms: ['lubina'] },
  { key: 'sardina', label: 'Sardina', terms: ['sardina'] },
  { key: 'anchoa', label: 'Anchoa / boquerón', terms: ['boqueron', 'anchoa'] },
  { key: 'caballa', label: 'Caballa / jurel', terms: ['caballa', 'jurel'] },
  { key: 'rape', label: 'Rape', terms: ['rape'] },
  { key: 'lenguado', label: 'Lenguado', terms: ['lenguado'] },
  { key: 'trucha', label: 'Trucha', terms: ['trucha'] },
  { key: 'emperador', label: 'Emperador / pez espada', terms: ['emperador', 'pez espada'] },
  { key: 'rodaballo', label: 'Rodaballo', terms: ['rodaballo'] },
  { key: 'salmonete', label: 'Salmonete', terms: ['salmonete'] },
  { key: 'mero', label: 'Mero', terms: ['mero'] },
  { key: 'panga', label: 'Panga / tilapia', terms: ['panga', 'tilapia'] },
  { key: 'otros', label: 'Otros (corvina, besugo, cazón, raya, arenque…)', terms: ['perca', 'palometa', 'corvina', 'besugo', 'cazon', 'raya', 'arenque', 'lucio'] },
] as const
export type FishKey = (typeof FISH_CATALOG)[number]['key']
export const FISH_KEYS = FISH_CATALOG.map(fish => fish.key) as [FishKey, ...FishKey[]]

// Carnes elegibles, igual que el pescado: los términos son lo que busca restrictions.ts. Una carne que no
// esté en ninguna entrada no se detecta ("buey" no está a propósito: chocaría con "buey de mar").
export const MEAT_CATALOG = [
  { key: 'pollo', label: 'Pollo', terms: ['pollo', 'gallina'] },
  { key: 'pavo', label: 'Pavo', terms: ['pavo'] },
  { key: 'otras_aves', label: 'Pato, codorniz y otras aves', terms: ['pato', 'codorniz', 'oca', 'perdiz', 'faisan'] },
  { key: 'ternera', label: 'Ternera / vacuno', terms: ['ternera', 'vacuno', 'novillo', 'añojo'] },
  { key: 'cerdo', label: 'Cerdo', terms: ['cerdo', 'cochinillo', 'costilla', 'panceta', 'tocino', 'bacon', 'beicon', 'secreto iberico', 'presa iberica', 'pluma iberica'] },
  { key: 'jamon', label: 'Jamón y fiambres', terms: ['jamon', 'paleta iberica', 'lacon', 'fiambre'] },
  { key: 'embutidos', label: 'Embutidos (chorizo, salchichas, morcilla…)', terms: ['chorizo', 'salchicha', 'salchichon', 'morcilla', 'mortadela', 'fuet', 'butifarra', 'longaniza', 'sobrasada'] },
  { key: 'cordero', label: 'Cordero / cabrito', terms: ['cordero', 'cabrito', 'lechal'] },
  { key: 'conejo', label: 'Conejo / liebre', terms: ['conejo', 'liebre'] },
  { key: 'otras_carnes', label: 'Otras (caza, hígado, callos…)', terms: ['venado', 'jabali', 'higado', 'callos'] },
] as const
export type MeatKey = (typeof MEAT_CATALOG)[number]['key']
export const MEAT_KEYS = MEAT_CATALOG.map(meat => meat.key) as [MeatKey, ...MeatKey[]]

// "Otros ingredientes que no quieres": cada palabra se busca tal cual, salvo estas, que se expanden a una
// lista de términos. Así "marisco" prohíbe gambas, mejillones…, y "aceitunas" no bloquea el aceite de oliva.
// `group` agrupa las que comparten línea de prompt y mensaje de violación (champiñones y tofu van juntos,
// como antes de que las reglas fueran por familia). `words` van sin acentos y en singular; ver classifyCustomWords.
export type AliasGroup = 'marisco' | 'atun' | 'aceitunas' | 'champi_tofu'
export const INGREDIENT_ALIASES = [
  { group: 'marisco', suggestion: 'marisco', words: ['marisco', 'frutos del mar'], terms: ['marisco', 'frutos del mar', 'gamba', 'langostino', 'camaron', 'cigala', 'carabinero', 'bogavante', 'langosta', 'cangrejo', 'necora', 'buey de mar', 'centolla', 'percebe', 'mejillon', 'almeja', 'berberecho', 'navaja', 'vieira', 'zamburiña', 'ostra', 'coquina', 'erizo de mar'] },
  { group: 'atun', suggestion: 'atún', words: ['atun', 'bonito'], terms: ['atun', 'bonito del norte'] },
  { group: 'aceitunas', suggestion: 'aceitunas', words: ['aceituna', 'olivas', 'olivada'], terms: ['aceituna', 'olivas', 'olivada'] },
  { group: 'champi_tofu', suggestion: 'champiñones', words: ['champinon'], terms: ['champiñon'] },
  { group: 'champi_tofu', suggestion: 'tofu', words: ['tofu'], terms: ['tofu'] },
] as const

const stripMarks = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// Reparte las palabras de "Otros ingredientes" entre los grupos conocidos (en un orden fijo, el de siempre,
// da igual en qué orden las escribiera la familia) y las demás, que se buscan tal cual.
export function classifyCustomWords(custom: readonly string[]): { groups: Array<{ group: AliasGroup; aliases: Array<(typeof INGREDIENT_ALIASES)[number]>; terms: string[] }>; others: string[] } {
  const matched = new Set<(typeof INGREDIENT_ALIASES)[number]>()
  const others: string[] = []
  for (const raw of custom) {
    const word = raw.trim()
    if (!word) continue
    const normalized = stripMarks(word)
    const candidates = [normalized, normalized.replace(/es$/, ''), normalized.replace(/s$/, '')]
    const alias = INGREDIENT_ALIASES.find(item => (item.words as readonly string[]).some(known => candidates.includes(known)))
    if (alias) matched.add(alias)
    else if (!others.includes(word)) others.push(word)
  }
  const groups = (['marisco', 'atun', 'aceitunas', 'champi_tofu'] as const).flatMap(group => {
    const aliases = INGREDIENT_ALIASES.filter(item => item.group === group && matched.has(item))
    return aliases.length ? [{ group, aliases, terms: aliases.flatMap(item => [...item.terms]) }] : []
  })
  return { groups, others }
}

// El pescado "de siempre" (merluza, salmón y cefalópodos): con él se usan los textos exactos de antes de
// que las reglas fueran por familia; con cualquier otra selección, textos generados.
export const isDefaultFishSelection = (allowed: readonly string[]) => allowed.length === 3 && ['merluza', 'salmon', 'cefalopodos'].every(key => allowed.includes(key))

export type FamilyRules = {
  // Raciones por semana, contando las 14 (comida y cena de los 7 días). `null` = sin límite.
  weekly: { maxHuevo: number | null; maxAve: number | null; maxPescado: number | null; maxCarneRoja: number | null; minLegumbre: number | null }
  // De lunes a viernes (comida y cena); `null` = sin límite de tiempo. El fin de semana no tiene límite.
  weekday: { targetMinutes: number | null; maxMinutes: number | null; onlyEasy: boolean }
  // Tres bloques: pescado, carne y "otros ingredientes".
  ingredients: {
    // Con `restrictFish`, solo valen las especies de `allowedFish`; cualquier otra está prohibida,
    // también como ingrediente secundario. Sin él, cualquier pescado vale.
    restrictFish: boolean
    allowedFish: FishKey[]
    // Lo mismo con la carne (y embutidos): `restrictMeat` + `allowedMeat`.
    restrictMeat: boolean
    allowedMeat: MeatKey[]
    // Ingredientes que no pueden aparecer en ningún plato (marisco, atún, aceitunas… o cualquier palabra).
    custom: string[]
  }
  // Texto libre para la IA. Va al prompt pero NO se comprueba con código: es orientativo.
  notes: string
}

// Las reglas "de siempre": lo que se aplicaba a todas las familias antes de que fueran por familia. Se
// siguen usando para una familia SIN reglas guardadas (las que ya existían antes de esto) y las ofrece el
// editor con "Usar reglas recomendadas". Una familia NUEVA no parte de aquí sino de EMPTY_FAMILY_RULES.
export const DEFAULT_FAMILY_RULES: FamilyRules = {
  weekly: { maxHuevo: 4, maxAve: 3, maxPescado: 3, maxCarneRoja: 1, minLegumbre: 4 },
  weekday: { targetMinutes: 40, maxMinutes: 50, onlyEasy: true },
  // Lo que se aplicaba antes: sin marisco/atún/aceitunas/champiñones/tofu, pescado solo merluza/salmón/
  // cefalópodos y carne sin limitar (con la limitación activada, todos los tipos empiezan marcados).
  ingredients: { restrictFish: true, allowedFish: ['merluza', 'salmon', 'cefalopodos'], restrictMeat: false, allowedMeat: [...MEAT_KEYS], custom: ['marisco', 'atún', 'aceitunas', 'champiñones', 'tofu'] },
  notes: '',
}

// Una familia nueva empieza SIN reglas: ningún límite, ninguna restricción y ninguna nota. Se guarda
// explícitamente al crearla (si no, se aplicarían las de siempre).
export const EMPTY_FAMILY_RULES: FamilyRules = {
  weekly: { maxHuevo: null, maxAve: null, maxPescado: null, maxCarneRoja: null, minLegumbre: null },
  weekday: { targetMinutes: null, maxMinutes: null, onlyEasy: false },
  ingredients: { restrictFish: false, allowedFish: [], restrictMeat: false, allowedMeat: [], custom: [] },
  notes: '',
}

export const RULE_LIMITS = { servings: { min: 0, max: 14 }, minutes: { min: 5, max: 240 }, customWords: 30, customWordLength: 40, notesLength: 500 } as const

// Comprobaciones que no dependen de zod (el cliente las usa para avisar antes de guardar).
export function validateFamilyRules(rules: FamilyRules): string[] {
  const problems: string[] = []
  const { servings, minutes } = RULE_LIMITS
  for (const [name, value] of Object.entries(rules.weekly)) {
    if (value === null) continue
    if (!Number.isInteger(value) || value < servings.min || value > servings.max) problems.push(`Las raciones deben ser un número entero entre ${servings.min} y ${servings.max}, o dejarse vacías (${name}).`)
  }
  const { targetMinutes, maxMinutes } = rules.weekday
  if (![targetMinutes, maxMinutes].every(value => value === null || (Number.isInteger(value) && value >= minutes.min && value <= minutes.max))) problems.push(`Los minutos de lunes a viernes deben estar entre ${minutes.min} y ${minutes.max}, o dejarse vacíos.`)
  else if (targetMinutes !== null && maxMinutes !== null && targetMinutes > maxMinutes) problems.push('Los minutos objetivo no pueden superar el máximo.')
  return problems
}
