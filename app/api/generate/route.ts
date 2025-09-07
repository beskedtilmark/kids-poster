// app/api/generate/route.ts

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { toFile } from "openai/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

// --- OpenAI client ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Supabase (server-side, service role key) ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucket = process.env.SUPABASE_BUCKET || "kids-posters";
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in .env.local" },
        { status: 500 }
      );
    }
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase env vars (URL or service role key)" },
        { status: 500 }
      );
    }

    // 1) Read multipart form
    const form = await req.formData();
    const file = form.get("image") as Blob | null;
    const style = (form.get("style") as string) || "Cut-out modern poster";
    const accent = (form.get("paletteAccent") as string) || "#E63946";

    if (!file) {
      return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
    }

    // 2) Convert Blob -> File for OpenAI
    const buffer = Buffer.from(await file.arrayBuffer());
    const imgFile = await toFile(buffer, "input.png", { type: "image/png" });

    // 3) OpenAI Images (use supported square size)
    const prompt = `
      Transform this original children's drawing into a modern, living-room poster.
      Keep the original shapes, composition, and linework faithful to the source.
      Use flat color blocks, clean negative space, balanced margins, and a ${style} aesthetic.
      Harmonize colors around accent ${accent}. No new characters or objects. No text.
    `;

    const result = await openai.images.edit({
      model: "gpt-image-1",
      image: imgFile,
      prompt,
      size: "1024x1024",
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      return NextResponse.json(
        { error: "OpenAI returned no image (b64_json missing)" },
        { status: 502 }
      );
    }

    const outBuffer = Buffer.from(b64, "base64");

    // 4) Upload to Supabase Storage
    const key = `posters/${randomUUID()}.png`;
    const { error: uploadError } = await supabase
      .storage
      .from(bucket)
      .upload(key, outBuffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      return NextResponse.json(
        { error: "Supabase upload failed: " + uploadError.message },
        { status: 500 }
      );
    }

    // 5) Public URL
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
    const posterUrl = pub?.publicUrl;
    if (!posterUrl) {
      return NextResponse.json(
        { error: "Could not get public URL from Supabase" },
        { status: 500 }
      );
    }

    return NextResponse.json({ posterUrl });
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ||
      (err instanceof Error ? err.message : String(err));
    console.error("API /api/generate error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
