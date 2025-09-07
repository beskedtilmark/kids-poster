"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, Download, Sparkles, Paintbrush, Loader2 } from "lucide-react";

type StyleOption = "Matisse-esque" | "Bauhaus" | "Mid-century" | "Minimalist";
type GenerateResponse = { posterUrl?: string; error?: string };

// Downscale an image file in-browser to speed uploads & generation.
async function downscaleImage(file: File, maxSide = 1024, quality = 0.8): Promise<File> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = url;
    });

    const { width, height } = img;
    const scale = Math.min(1, maxSide / Math.max(width, height));
    if (scale >= 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;

    return new File([blob], (file.name || "upload").replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Draw a clean title locally (crisper and more reliable than AI-rendered text)
async function overlayTitle(posterUrl: string, title: string): Promise<string> {
  if (!title.trim()) return posterUrl;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = posterUrl;
  await img.decode();

  const padding = 48;
  const titleBox = 140; // space for title bar
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height + titleBox;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, img.width, img.height);

  ctx.fillStyle = "#111827";
  const fontSize = Math.max(20, Math.round(canvas.width * 0.035));
  ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title.trim(), canvas.width / 2, img.height + titleBox / 2);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) return posterUrl;
  return URL.createObjectURL(blob);
}

export default function KidsPosterMVP() {
  const [origFile, setOrigFile] = useState<File | null>(null);
  const [sendFile, setSendFile] = useState<File | null>(null);
  const [posterUrl, setPosterUrl] = useState<string>("");

  const [style, setStyle] = useState<StyleOption>("Matisse-esque");
  const [accent, setAccent] = useState<string>("#E63946");
  const [allowShapes, setAllowShapes] = useState<boolean>(true);

  const [titleText, setTitleText] = useState<string>("");
  const [aiText, setAiText] = useState<boolean>(false);
  const [overlayCleanText, setOverlayCleanText] = useState<boolean>(true);

  // Detect if running on Vercel; default to fast mode there only
  const isVercelHost =
    typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app");
  const [fastMode, setFastMode] = useState<boolean>(isVercelHost);

  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");

  // Fun rotating statuses during generation
  const funSteps = useMemo(
    () => [
      "Warming up crayons…",
      "Adding colors…",
      "Consulting fairies…",
      "Balancing shapes…",
      "Smoothing paper texture…",
      "Respecting original lines…",
      "Tuning palette harmony…",
    ],
    []
  );
  const [stepIndex, setStepIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (loading) {
      setStepIndex(0);
      intervalRef.current = window.setInterval(() => {
        setStepIndex((i) => (i + 1) % funSteps.length);
      }, 1200);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [loading, funSteps.length]);

  const pickFile = useCallback(async (f?: File | null) => {
    if (!f) return;
    if (!f.type?.startsWith("image/")) {
      setMessage("Please choose a PNG or JPG image.");
      return;
    }
    setPosterUrl("");
    setMessage("Preparing image…");
    setOrigFile(f);
    try {
      const downsized = await downscaleImage(f, 1024, 0.8);
      setSendFile(downsized);
      setMessage(
        `Selected: ${f.name} → sending ${Math.round((downsized.size || 0) / 1024)} KB`
      );
    } catch {
      setSendFile(f);
      setMessage(`Selected: ${f.name}`);
    }
  }, []);

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] ?? null;
    void pickFile(f);
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
    if (!sendFile) {
      setMessage("Select an image first.");
      return;
    }
    setLoading(true);
    setPosterUrl("");
    setMessage("Generating…");

    try {
      const body = new FormData();
      body.append("image", sendFile);
      body.append("style", style);
      body.append("paletteAccent", accent);
      body.append("allowShapes", String(allowShapes));
      body.append("aiText", String(aiText));
      body.append("titleText", titleText);

      const url = fastMode ? "/api/generate?fast=1" : "/api/generate";
      const res = await fetch(url, { method: "POST", body });

      let data: unknown = {};
      try { data = await res.json(); } catch {}
      const parsed = data as GenerateResponse;

      if (!res.ok) throw new Error(parsed?.error || `Server error ${res.status}`);
      if (!parsed?.posterUrl) throw new Error("No posterUrl in response");

      let finalUrl = parsed.posterUrl;

      // Overlay crisp title locally if requested
      if (overlayCleanText && titleText.trim()) {
        finalUrl = await overlayTitle(finalUrl, titleText.trim());
      }

      setPosterUrl(finalUrl);
      setMessage("Done! Poster generated.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage("Generation failed: " + msg);
      console.error("Generate error:", msg);
    } finally {
      setLoading(false);
    }
  }

  // Simple progress bar width based on step
  const progress = ((stepIndex + 1) / funSteps.length) * 100;

  return (
    <div style={{ padding: 24, maxWidth: 1080, margin: "0 auto", fontFamily: "ui-sans-serif, system-ui" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Sparkles />
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Kids Art → Living-Room Poster</h1>
      </div>

      {/* Status / Messages */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ marginBottom: 12, color: "#334155", display: "flex", alignItems: "center", gap: 8 }}
          >
            <Loader2 className="spin" />
            <motion.span
              key={stepIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {funSteps[stepIndex]}
            </motion.span>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ marginBottom: 12, color: message.startsWith("Generation failed") ? "#b91c1c" : "#334155" }}
          >
            {message || "Choose a PNG/JPG. You should see a filename and preview below."}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploader */}
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          border: "2px dashed #cbd5e1",
          borderRadius: 16,
          padding: 18,
          marginBottom: 18,
          textAlign: "center",
          background: "#f8fafc",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Paintbrush />
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
              onChange={(e) => void pickFile(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />
            Vælg fil
          </label>
          <span style={{ color: "#64748b" }}>or drag & drop an image here</span>
        </div>

        {/* Progress bar during loading */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                height: 8,
                background: "#e2e8f0",
                borderRadius: 999,
                overflow: "hidden",
                maxWidth: 560,
                margin: "8px auto 0",
              }}
            >
              <motion.div
                style={{ height: "100%", background: "#0f172a" }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "linear", duration: 0.9, repeat: Infinity, repeatType: "reverse" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <label>
          Style{" "}
          <select value={style} onChange={(e) => setStyle(e.target.value as StyleOption)}>
            <option value="Matisse-esque">Matisse-esque</option>
            <option value="Bauhaus">Bauhaus</option>
            <option value="Mid-century">Mid-century</option>
            <option value="Minimalist">Minimalist</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Accent <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
          <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{accent}</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={allowShapes} onChange={(e) => setAllowShapes(e.target.checked)} />
          Allow simple shapes
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={aiText} onChange={(e) => setAiText(e.target.checked)} />
          Let AI render title
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={overlayCleanText}
            onChange={(e) => setOverlayCleanText(e.target.checked)}
          />
          Overlay clean title (recommended)
        </label>

        <input
          type="text"
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          placeholder="Poster title (optional)"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            minWidth: 240,
          }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={fastMode} onChange={(e) => setFastMode(e.target.checked)} />
          Fast mode (Vercel)
        </label>

        <button
          onClick={handleGenerate}
          disabled={!sendFile || loading}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "#0f172a",
            color: "white",
            border: "1px solid #0f172a",
            cursor: loading || !sendFile ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {loading ? <Loader2 className="spin" /> : <Wand2 />}
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
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Download /> Download PNG
        </button>
      </div>

      {/* Previews */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ color: "#475569", marginBottom: 8 }}>Original</div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              height: 520,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              background: "white",
            }}
          >
            {origFile ? (
              <img
                src={URL.createObjectURL(origFile)}
                alt="original"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <span style={{ color: "#94a3b8" }}>No image yet</span>
            )}
          </motion.div>
        </div>
        <div>
          <div style={{ color: "#475569", marginBottom: 8 }}>Poster</div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              height: 520,
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
          </motion.div>
        </div>
      </div>

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin {from{transform:rotate(0)} to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
