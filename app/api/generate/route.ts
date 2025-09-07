// app/api/generate/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const bucket = process.env.SUPABASE_BUCKET || "kids-posters";
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = Buffer.from(b64, "base64");
  return new Uint8Array(bin);
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY in .env" }, { status: 500 });
    }
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    const url = new URL(req.url);
    const fast = url.searchParams.get("fast") === "1";
    const isVercel = !!process.env.VERCEL;

    // Use fast profile on Vercel or when requested;
    // use portrait and longer timeout locally.
    const size = fast || isVercel ? "1024x1024" : "1024x1536";
    const timeoutMs = fast || isVercel ? 9000 : 45000;

    const form = await req.formData();
    const file = form.get("image") as Blob | null;
    const style = (form.get("style") as string) || "Cut-out modern poster";
    const accent = (form.get("paletteAccent") as string) || "#E63946";
    const allowShapes = (form.get("allowShapes") as string) === "true";
    const aiText = (form.get("aiText") as string) === "true";
    const titleText = (form.get("titleText") as string) || "";

    if (!file) return NextResponse.json({ error: "No image uploaded" }, { status: 400 });

    const guidance: string[] = [
      "Preserve ALL original shapes, proportions, and line strokes exactly.",
      "Do NOT change faces, figures, or geometry. No new characters or objects.",
      "Recolor using flat, paper-like blocks; clean negative space; wide margins.",
      `Use a ${style} aesthetic with harmonious palette around accent ${accent}.`,
    ];
    if (allowShapes) {
      guidance.push("You MAY add a few simple abstract shapes (cut-out style) in background or margins, subtle and secondary.");
    } else {
      guidance.push("Do NOT add new shapes; only recolor and tidy.");
    }
    if (aiText && titleText.trim()) {
      guidance.push(`If adding text, use this title: "${titleText.trim()}" in a clean, minimal layout; keep it unobtrusive.`);
    } else {
      guidance.push("Do NOT add any text.");
    }

    const prompt = `
      Transform the input into a modern living-room poster while following these rules:
      ${guidance.map((g, i) => `${i + 1}. ${g}`).join("\n")}
    `;

    const controller = new AbortController();
    const kill = setTimeout(() => controller.abort(), timeoutMs);

    const openaiResp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: (() => {
        const fd = new FormData();
        fd.append("image", file, "input.jpg");
        fd.append("model", "gpt-image-1");
        fd.append("prompt", prompt);
        fd.append("size", size);
        return fd;
      })(),
      signal: controller.signal,
    }).finally(() => clearTimeout(kill));

    if (!openaiResp.ok) {
      const txt = await openaiResp.text();
      return NextResponse.json({ error: `OpenAI error ${openaiResp.status}: ${txt}` }, { status: 502 });
    }

    const json = (await openaiResp.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) return NextResponse.json({ error: "OpenAI returned no image" }, { status: 502 });

    const bytes = base64ToUint8Array(b64);

    const key = `posters/${randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(key, bytes, {
      contentType: "image/png",
      upsert: true,
    });
    if (uploadError) {
      return NextResponse.json({ error: `Supabase upload failed: ${uploadError.message}` }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
    const posterUrl = pub?.publicUrl;
    if (!posterUrl) return NextResponse.json({ error: "Could not get public URL from Supabase" }, { status: 500 });

    return NextResponse.json({ posterUrl });
  } catch (err: unknown) {
    const msg =
      (err as { name?: string })?.name === "AbortError"
        ? "Timed out. Try again (image was likely too large/slow)."
        : err instanceof Error
        ? err.message
        : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
