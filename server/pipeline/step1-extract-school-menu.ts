import { generateStructured, inlineFilePart, textPart } from '../clients/gemini'
import { GEMINI_MODEL_FLASH } from '../env'
import { buildSchoolExtractionSystemInstruction, buildSchoolExtractionUserPrompt } from '../prompts/schoolExtraction'
import { ChildSchoolMenuSchema, SchoolMenuExtractionSchema, type SchoolMenuExtraction } from '../types'

export type SchoolMenuFile = {
  data: Buffer
  mimeType: string
}

export type SchoolMenuUpload = {
  child: string
  files: SchoolMenuFile[]
}

// Paso 1 del pipeline: OCR + estructuración. Una llamada a Gemini por niña (no una sola llamada
// con todos los documentos mezclados) — el cliente ya nos dice de forma fiable a quién pertenece
// cada archivo, así que no hace falta pedirle a Gemini que además adivine esa atribución; así se
// evita que confunda el menú de una niña con el de la otra.
// `weekStart`: la semana que se planifica, ver buildSchoolExtractionUserPrompt.
export async function extractSchoolMenu(uploads: SchoolMenuUpload[], weekStart?: string): Promise<SchoolMenuExtraction> {
  const children = await Promise.all(
    uploads.map(async upload => {
      const result = await generateStructured({
        model: GEMINI_MODEL_FLASH,
        schema: ChildSchoolMenuSchema,
        systemInstruction: buildSchoolExtractionSystemInstruction(),
        contents: [
          {
            role: 'user',
            parts: [
              textPart(buildSchoolExtractionUserPrompt(upload.child, upload.files.length, weekStart)),
              ...upload.files.map(file => inlineFilePart(file.data.toString('base64'), file.mimeType)),
            ],
          },
        ],
      })
      // Nos fiamos del nombre que nos ha dado el cliente, no del que Gemini haya podido escribir en
      // el JSON (por si lo normaliza o se equivoca) — es información que ya conocíamos con certeza.
      // Fechas mal formadas (Gemini a veces devuelve "5 d'octubre" pese al formato pedido) se
      // descartan: mejor "no se pudo comprobar" que un aviso basado en una fecha mal leída.
      const isoDate = (value?: string) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
      return { ...result, child: upload.child, menuStartDate: isoDate(result.menuStartDate), menuEndDate: isoDate(result.menuEndDate) }
    }),
  )

  return SchoolMenuExtractionSchema.parse({ children })
}
