"use client";

import React, { useCallback, useState } from "react";

type StyleOption = "Matisse-esque" | "Bauhaus" | "Mid-century" | "Minimalist";

type GenerateResponse = {
  posterUrl?: string;
  error?: string;
};

export default function KidsPosterMVP() {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<StyleOption>("Matisse-esque");
  const [accent, setAccent] = useState<string>("#E63946");

  const [posterUrl, setPosterUrl] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  const pickFile = useCallback((f?: File | null) => {
    if (!f) return;
    if (!f.type?.startsWith("image/")) {
      setMessage("Please choose a PNG or JPG image.");
      return;
    }
    setPosterUrl("");
    setMessage(`Selected: ${f.name} (${Math.round((f.size || 0) / 1024)} KB)`);
    setFile(f);
  }, []);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] ?? null;
    pickFile(f);
  }

  function downloadPoster() {
    if (!posterUrl) return;
    const a = document.createElement("a");
    a.href = posterUrl;
    a.download = "kids-poster.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleGenerate() {
    if (!file) {
      setMessage("Select an image first.");
      return;
    }
    setLoading(true);
    setMessage("Uploading to /api/generate …");
    setPosterUrl("");

    try {
      const body = new FormData();
      body.append("image", file);
      body.append("style", style);
      body.append("paletteAccent", accent);

      const res = await fetch("/api/generate", { method: "POST", body });

      let data: unknown = {};
      try {
        data = await res.json();
      } catch {
        // ignore JSON parse errors
      }
      const parsed = data as GenerateResponse;

      if (!res.ok) {
        throw new Error(parsed?.error || `Server error ${res.status}`);
      }
      if (!parsed?.posterUrl) {
        throw new Error("No posterUrl in response");
      }

      setPosterUrl(parsed.posterUrl);
      setMessage("Done! Poster generated.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage("Generation failed: " + msg);
      console.error("Generate error:", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: 24,
        maxWidth: 980,
        margin: "0 auto",
        fontFamily: "ui-sans-serif, system-ui",
        color: "#0f172a",
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        Kids Art → Living-Room Poster (Debug)
      </h1>

      <div
        style={{
          marginBottom: 14,
          color: message.startsWith("Generation failed") ? "#b91c1c" : "#334155",
        }}
      >
        {message || "Choose a PNG/JPG. You should see a filename and preview below."}
      </div>

      {/* Uploader */}
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          border: "2px dashed #cbd5e1",
          borderRadius: 12,
          padding: 18,
          marginBottom: 18,
          textAlign: "center",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "inline-block", marginBottom: 10 }}>
          <label
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "white",
              cursor: "pointer",
            }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={(e) => pickFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
            Vælg fil
          </label>
          <span style={{ marginLeft: 10, color: "#64748b" }}>
            Or drag & drop an image here
          </span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <label>
          Style{" "}
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as StyleOption)}
          >
            <option value="Matisse-esque">Matisse-esque</option>
            <option value="Bauhaus">Bauhaus</option>
            <option value="Mid-century">Mid-century</option>
            <option value="Minimalist">Minimalist</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Accent{" "}
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
          />
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {accent}
          </span>
        </label>

        <button
          onClick={handleGenerate}
          disabled={!file || loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#0f172a",
            color: "white",
            border: "1px solid #0f172a",
            cursor: loading || !file ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Generating…" : "Generate Poster"}
        </button>

        <button
          onClick={downloadPoster}
          disabled={!posterUrl}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "white",
            color: "#0f172a",
            border: "1px solid #0f172a",
            cursor: posterUrl ? "pointer" : "not-allowed",
          }}
        >
          Download PNG
        </button>
      </div>

      {/* Previews */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Original */}
        <div>
          <div style={{ color: "#475569", marginBottom: 8 }}>Original</div>
          <div
            style={{
              height: 460,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "white",
            }}
          >
            {file ? (
              // <Image /> is recommended, but <img> is fine for MVP
              <img
                src={URL.createObjectURL(file)}
                alt="original"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <span style={{ color: "#94a3b8" }}>No image yet</span>
            )}
          </div>
        </div>

        {/* Poster */}
        <div>
          <div style={{ color: "#475569", marginBottom: 8 }}>Poster</div>
          <div
            style={{
              height: 460,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "white",
            }}
          >
            {posterUrl ? (
              <img
                src={posterUrl}
                alt="poster"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <span style={{ color: "#94a3b8" }}>Generate to see result</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
