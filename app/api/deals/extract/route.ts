import { NextResponse } from 'next/server';
import { extractWithAI } from '@/lib/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fileToText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    // Lazy require so it doesn't run at build/import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text;
  }
  return buffer.toString('utf-8');
}

const EXTRACTION_PROMPT = `You read a real-estate deal package and the user's note, and extract the deal TERMS as JSON.
Return ONLY raw JSON (no markdown, no prose) with exactly these fields:
{
  "title": "short deal name, e.g. 'Riverside Medical Plaza'",
  "acquisition_type": "residential" | "commercial" | "mixed_use" | "development",
  "intended_use": "short phrase, e.g. 'mixed-use medical office + retail'",
  "purchase_price": <number USD, no commas/symbols>,
  "financing_ltv": <number percent, e.g. 65>,
  "financing_rate": <number percent, e.g. 6.5>,
  "hold_period_years": <integer>
}
Rules:
- Infer from the documents/note. For missing numerics use defaults: purchase_price=10000000, financing_ltv=65, financing_rate=6.5, hold_period_years=7.
- acquisition_type must be one of the four allowed values; default "commercial".
- Return ONLY the JSON object.`;

/** Extract deal terms from a typed note and/or uploaded documents. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const message = (form.get('message') as string) ?? '';
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

    const parts: string[] = [];
    for (const file of files) {
      try {
        parts.push(`===== ${file.name} =====\n${await fileToText(file)}`);
      } catch {
        parts.push(`===== ${file.name} (could not parse) =====`);
      }
    }
    const documents = [message, ...parts].filter(Boolean).join('\n\n').trim();
    if (documents.length < 40) {
      return NextResponse.json({ error: 'Add more detail or attach the deal documents (title deed, contract, etc.).' }, { status: 400 });
    }

    const raw = await extractWithAI(documents, EXTRACTION_PROMPT);
    const cleaned = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
    let terms: Record<string, unknown>;
    try {
      terms = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
    } catch {
      return NextResponse.json({ error: 'Could not read the deal terms. Please add price, use, and financing.' }, { status: 422 });
    }

    // The raw text becomes the document package the Archivist agent reads.
    const dealData = { ...terms, documents };
    return NextResponse.json({ dealData });
  } catch (err) {
    console.error('[extract]', err);
    return NextResponse.json({ error: 'Extraction failed. Please try again.' }, { status: 500 });
  }
}
