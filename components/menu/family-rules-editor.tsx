'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Eraser, LoaderCircle, Plus, RotateCcw, X } from 'lucide-react'
import { DEFAULT_FAMILY_RULES, EMPTY_FAMILY_RULES, FISH_CATALOG, INGREDIENT_ALIASES, MEAT_CATALOG, RULE_LIMITS, validateFamilyRules, type FamilyRules } from '@/server/rules/family-rules'
import { ApiError, getFamilyRules, saveFamilyRules } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// "Sin cambios" no depende del orden de las listas (quitar una etiqueta y volver a añadirla la deja al final).
const canonical = (rules: FamilyRules | null) => rules && { ...rules, ingredients: { ...rules.ingredients, allowedFish: [...rules.ingredients.allowedFish].sort(), allowedMeat: [...rules.ingredients.allowedMeat].sort(), custom: [...rules.ingredients.custom].sort() } }
const same = (a: FamilyRules | null, b: FamilyRules | null) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

// Vacío = sin límite (null).
function NumberField({ label, value, onChange, suffix }: { label: string; value: number | null; onChange: (value: number | null) => void; suffix?: string }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-slate-600">{label}</span><span className="flex items-center gap-2"><Input type="number" inputMode="numeric" value={value === null || Number.isNaN(value) ? '' : value} placeholder="Sin límite" onChange={event => onChange(event.target.value === '' ? null : Number(event.target.value))} className="w-28" />{suffix && <span className="text-xs text-slate-500">{suffix}</span>}</span></label>
}

function Check_({ label, checked, onChange, children }: { label: string; checked: boolean; onChange: (checked: boolean) => void; children?: ReactNode }) {
  return <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5 size-4 accent-emerald-600" /><span>{label}{children}</span></label>
}

// "Limitar X a unos tipos": un interruptor y, si está activo, la lista de tipos permitidos (marcados los que
// la familia ya admite). Sin ningún tipo marcado, esa familia no tiene ese ingrediente en el menú.
function LimitedKind({ title, hint, enabled, onToggle, catalog, selected, onSelect, emptyWarning }: { title: string; hint: string; enabled: boolean; onToggle: (enabled: boolean) => void; catalog: ReadonlyArray<{ key: string; label: string }>; selected: readonly string[]; onSelect: (keys: string[]) => void; emptyWarning: string }) {
  return <div className="space-y-2">
    <Check_ label={title} checked={enabled} onChange={onToggle}><span className="block text-xs text-slate-500">{hint}</span></Check_>
    {enabled && <div className="grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
      {catalog.map(kind => <Check_ key={kind.key} label={kind.label} checked={selected.includes(kind.key)} onChange={checked => onSelect(checked ? [...selected, kind.key] : selected.filter(key => key !== kind.key))} />)}
      {selected.length === 0 && <p className="text-xs text-amber-700 sm:col-span-2">{emptyWarning}</p>}
    </div>}
  </div>
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => <div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{title}</p>{children}</div>

// Reglas del menú de UNA familia (límites semanales, tiempos de lunes a viernes, ingredientes
// prohibidos y notas para la IA). Se cargan al desplegar y se guardan con "Guardar reglas".
// Es lo que luego se le pide a Gemini y lo que comprueba el motor de reglas: ver server/rules/.
export function FamilyRulesEditor({ familyId, onToggle, defaultOpen = false, className = '' }: { familyId: string; onToggle?: (open: boolean) => void; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const [saved, setSaved] = useState<FamilyRules | null>(null)
  const [draft, setDraft] = useState<FamilyRules | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [word, setWord] = useState('')

  async function load() {
    setLoading(true); setError(null)
    try { const { rules } = await getFamilyRules(familyId); setSaved(rules); setDraft(rules) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'No se han podido cargar las reglas.') }
    finally { setLoading(false) }
  }
  // Abierto de entrada (la familia activa): se cargan las reglas al montar.
  useEffect(() => { if (defaultOpen) void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function toggle() {
    const next = !open
    setOpen(next)
    onToggle?.(next)
    if (next && !draft) await load()
  }
  const edit = (change: (rules: FamilyRules) => FamilyRules) => { setDraft(current => current && change(current)); setJustSaved(false) }
  const problems = draft ? validateFamilyRules(draft) : []
  const dirty = !same(draft, saved)

  async function save() {
    if (!draft) return
    setBusy(true); setError(null)
    try { const { rules } = await saveFamilyRules(familyId, draft); setSaved(rules); setDraft(rules); setJustSaved(true) }
    catch (e) { setError(e instanceof ApiError ? e.message : 'No se han podido guardar las reglas.') }
    finally { setBusy(false) }
  }
  function addCustom(raw: string) {
    const value = raw.trim().toLowerCase()
    if (!value || !draft) return
    if (draft.ingredients.custom.length >= RULE_LIMITS.customWords) return setError(`Máximo ${RULE_LIMITS.customWords} ingredientes.`)
    if (!draft.ingredients.custom.map(item => item.toLowerCase()).includes(value)) edit(rules => ({ ...rules, ingredients: { ...rules.ingredients, custom: [...rules.ingredients.custom, value] } }))
    setError(null)
  }
  function addWord(event: FormEvent) {
    event.preventDefault()
    addCustom(word)
    setWord('')
  }
  // Los que la app ya sabe expandir (marisco, atún…) y la familia no tiene puestos, para volver a añadirlos de un clic.
  const suggestions = draft ? INGREDIENT_ALIASES.map(alias => alias.suggestion).filter(item => !draft.ingredients.custom.map(word => word.toLowerCase()).includes(item)) : []

  const rules = draft
  const setWeekly = (key: keyof FamilyRules['weekly']) => (value: number | null) => edit(current => ({ ...current, weekly: { ...current.weekly, [key]: value } }))
  const setIngredient = <K extends keyof FamilyRules['ingredients']>(key: K, value: FamilyRules['ingredients'][K]) => edit(current => ({ ...current, ingredients: { ...current.ingredients, [key]: value } }))

  return <div className={`mt-4 rounded-lg border border-slate-200 bg-white ${className}`}>
    <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700"><span>Reglas del menú de esta familia</span><ChevronDown className={`size-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
    {open && <div className="space-y-5 border-t border-slate-100 p-3 sm:p-4">
      {loading && <p className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Cargando reglas…</p>}
      {rules && <>
        {/* Con ancho (xl) en dos columnas: límites y notas a la izquierda, ingredientes a la derecha. */}
        <div className="grid gap-x-10 gap-y-5 xl:grid-cols-2">
          <div className="space-y-5">
        <Section title="Equilibrio semanal">
          <p className="text-xs text-slate-500">Raciones en toda la semana (14 comidas: comida y cena de lunes a domingo). Déjalo vacío para no limitar.</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
            <NumberField label="Mínimo de legumbres" value={rules.weekly.minLegumbre} onChange={setWeekly('minLegumbre')} />
            <NumberField label="Máximo de huevo" value={rules.weekly.maxHuevo} onChange={setWeekly('maxHuevo')} />
            <NumberField label="Máximo de ave" value={rules.weekly.maxAve} onChange={setWeekly('maxAve')} />
            <NumberField label="Máximo de pescado" value={rules.weekly.maxPescado} onChange={setWeekly('maxPescado')} />
            <NumberField label="Máximo de carne roja" value={rules.weekly.maxCarneRoja} onChange={setWeekly('maxCarneRoja')} />
          </div>
        </Section>
        <Section title="Lunes a viernes">
          <div className="flex flex-wrap items-end gap-4">
            <NumberField label="Minutos objetivo" value={rules.weekday.targetMinutes} suffix="min" onChange={value => edit(current => ({ ...current, weekday: { ...current.weekday, targetMinutes: value } }))} />
            <NumberField label="Máximo de minutos" value={rules.weekday.maxMinutes} suffix="min" onChange={value => edit(current => ({ ...current, weekday: { ...current.weekday, maxMinutes: value } }))} />
          </div>
          <Check_ label="Solo recetas fáciles" checked={rules.weekday.onlyEasy} onChange={checked => edit(current => ({ ...current, weekday: { ...current.weekday, onlyEasy: checked } }))} />
        </Section>
        <Section title="Notas para la IA">
          <textarea value={rules.notes} maxLength={RULE_LIMITS.notesLength} rows={3} placeholder="p. ej. cenas ligeras, nos gusta la cocina mediterránea…" onChange={event => edit(current => ({ ...current, notes: event.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
          <p className="text-xs text-slate-500">{rules.notes.length}/{RULE_LIMITS.notesLength}. Son orientativas: no se comprueban, las reglas de arriba mandan siempre.</p>
        </Section>
          </div>
          <div>
        <Section title="Ingredientes">
          <LimitedKind title="Limitar el pescado a unas especies" hint="Cualquier otro pescado queda prohibido, también como ingrediente secundario." enabled={rules.ingredients.restrictFish} onToggle={checked => setIngredient('restrictFish', checked)} catalog={FISH_CATALOG} selected={rules.ingredients.allowedFish} onSelect={keys => setIngredient('allowedFish', keys as FamilyRules['ingredients']['allowedFish'])} emptyWarning="Sin ninguna especie marcada, no habrá pescado en el menú." />
          <LimitedKind title="Limitar la carne a algunos tipos" hint="Cualquier otra carne o embutido queda prohibido, también como ingrediente secundario (un caldo de pollo, jamón en unas lentejas…)." enabled={rules.ingredients.restrictMeat} onToggle={checked => setIngredient('restrictMeat', checked)} catalog={MEAT_CATALOG} selected={rules.ingredients.allowedMeat} onSelect={keys => setIngredient('allowedMeat', keys as FamilyRules['ingredients']['allowedMeat'])} emptyWarning="Sin ningún tipo marcado, no habrá carne ni embutidos en el menú." />
          <div className="space-y-2"><p className="text-sm text-slate-700">Otros ingredientes que no quieres</p>
            {rules.ingredients.custom.length > 0 && <ul className="flex flex-wrap gap-1.5">{rules.ingredients.custom.map(item => <li key={item} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2.5 pr-1 text-sm text-slate-700">{item}<button type="button" aria-label={`Quitar ${item}`} onClick={() => setIngredient('custom', rules.ingredients.custom.filter(other => other !== item))} className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"><X className="size-3.5" /></button></li>)}</ul>}
            {suggestions.length > 0 && <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">Añadir:{suggestions.map(item => <button key={item} type="button" onClick={() => addCustom(item)} className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-slate-600 hover:border-emerald-400 hover:text-emerald-700">+ {item}</button>)}</p>}
            <form onSubmit={addWord} className="flex gap-2"><Input value={word} maxLength={RULE_LIMITS.customWordLength} placeholder="p. ej. coliflor" onChange={event => setWord(event.target.value)} /><Button type="submit" variant="outline"><Plus />Añadir</Button></form>
            <p className="text-xs text-slate-500">"Marisco", "atún", "aceitunas" y "champiñones" ya incluyen todas sus variantes (gambas, mejillones, bonito…).</p>
          </div>
        </Section>
          </div>
        </div>
        {problems.length > 0 && <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={!dirty || problems.length > 0 || busy} className="bg-emerald-600 text-white hover:bg-emerald-700">{busy && <LoaderCircle className="animate-spin" />}Guardar reglas</Button>
          <Button variant="outline" onClick={() => edit(() => DEFAULT_FAMILY_RULES)} disabled={busy || same(rules, DEFAULT_FAMILY_RULES)}><RotateCcw />Usar reglas recomendadas</Button>
          <Button variant="outline" onClick={() => edit(() => EMPTY_FAMILY_RULES)} disabled={busy || same(rules, EMPTY_FAMILY_RULES)}><Eraser />Vaciar reglas</Button>
          {justSaved && !dirty && <span className="inline-flex items-center gap-1 text-sm text-emerald-700"><Check className="size-4" />Guardadas</span>}
        </div>
        <p className="text-xs text-slate-500">Una familia nueva empieza sin reglas. "Usar reglas recomendadas" carga un punto de partida equilibrado (sin marisco, pescado solo merluza y salmón…). Se aplican a las próximas generaciones y sustituciones; las semanas ya guardadas no cambian.</p>
      </>}
      {!rules && !loading && error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>}
  </div>
}
