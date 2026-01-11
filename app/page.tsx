"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  FileImage,
  Scan,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

type Status = "idle" | "preview" | "analyzing" | "result";

type AnalysisResult = {
  diagnosis: "Normal" | "Pneumonia";
  confidence: number;
  is_critical: boolean;
};

type CustomVisionResponse = {
  predictions?: Array<{
    tagName?: string;
    probability?: number;
  }>;
};

export default function Page() {
  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [penColor, setPenColor] = useState("#2563eb");
  const [penSize, setPenSize] = useState(3);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const confidencePercent = useMemo(() => {
    if (!result) return 0;
    return Math.round(result.confidence * 100);
  }, [result]);

  const handleFile = (nextFile: File) => {
    setFile(nextFile);
    setResult(null);
    setStatus("preview");
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) handleFile(droppedFile);
  };

  const analyzeImage = async () => {
    if (!file) return;
    setStatus("analyzing");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Analysis failed. Please try again.");
      }

      const data = (await response.json()) as CustomVisionResponse;
      const topPrediction = [...(data.predictions ?? [])].sort(
        (a, b) => (b.probability ?? 0) - (a.probability ?? 0),
      )[0];
      const tagName = (topPrediction?.tagName ?? "Normal").toLowerCase();
      const diagnosis = tagName.includes("pneumonia") ? "Pneumonia" : "Normal";
      const confidence = Math.max(
        0,
        Math.min(1, topPrediction?.probability ?? 0),
      );

      setResult({
        diagnosis,
        confidence,
        is_critical: diagnosis === "Pneumonia",
      });
      setStatus("result");
    } catch (error) {
      console.error(error);
      setStatus("preview");
    }
  };

  const syncCanvasSize = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const { width, height } = img.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.lineWidth = penSize;
    }
  };

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = getCanvasPoint(event);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const nextPoint = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;
    if (!lastPoint) {
      lastPointRef.current = nextPoint;
      return;
    }
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(nextPoint.x, nextPoint.y);
    ctx.stroke();
    lastPointRef.current = nextPoint;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
    lastPointRef.current = null;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
      historyRef.current.push(snapshot);
      redoRef.current = [];
      setCanUndo(historyRef.current.length > 0);
      setCanRedo(false);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      historyRef.current = [];
      redoRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
    }
  };

  const undoStroke = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || historyRef.current.length === 0) return;
    const last = historyRef.current.pop();
    if (last) redoRef.current.push(last);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const previous = historyRef.current.at(-1);
    if (previous) ctx.putImageData(previous, 0, 0);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  };

  const redoStroke = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || redoRef.current.length === 0) return;
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push(next);
    ctx.putImageData(next, 0, 0);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  };

  useEffect(() => {
    if (!isPreviewOpen) return;
    syncCanvasSize();
    historyRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    const handleResize = () => syncCanvasSize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isPreviewOpen, previewUrl]);

  const resetFlow = () => {
    setFile(null);
    setResult(null);
    setStatus("idle");
  };

  const theme =
    result?.is_critical === true
      ? {
          accent: "text-red-300",
          soft: "bg-red-500/10",
          border: "border-red-400/30",
          pill: "bg-red-500/15 text-red-200 border-red-500/40",
          glow: "shadow-[0_0_40px_rgba(239,68,68,0.25)]",
        }
      : {
          accent: "text-emerald-300",
          soft: "bg-emerald-500/10",
          border: "border-emerald-400/30",
          pill: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
          glow: "shadow-[0_0_40px_rgba(16,185,129,0.25)]",
        };

  return (
    <main
      className="min-h-screen bg-slate-50 text-slate-900"
      style={{
        fontFamily:
          '"Space Grotesk", "IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div className="flex min-h-screen">
        <aside className="flex w-64 shrink-0 flex-col gap-8 border-r border-slate-200 bg-white px-6 py-10">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
              Project Retina
            </p>
            <h2 className="mt-3 text-lg font-semibold text-slate-900">
              Diagnostic Console
            </h2>
          </div>
          <nav className="flex flex-col gap-3 text-sm">
            {[
              { label: "Analyze", active: true },
              { label: "Results", active: false },
              { label: "History", active: false },
              { label: "Settings", active: false },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-xl px-4 py-2 font-medium ${
                  item.active
                    ? "bg-slate-900 text-white"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </div>
            ))}
          </nav>
        </aside>

        <section className="flex w-full flex-1 flex-col gap-6 px-6 py-10 sm:px-10">
          <header className="space-y-2">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
              Medical AI
            </p>
            <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
              AI-Powered Diagnostic Imaging
            </h1>
            <p className="text-sm text-slate-500">
              Upload a chest X-ray, review the preview, and run analysis.
            </p>
          </header>

          <div className="grid gap-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Analyze</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {status}
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div
                  className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-6 text-center transition ${
                    isDragging
                      ? "border-cyan-400 bg-cyan-50"
                      : "border-slate-300 bg-slate-50 hover:border-cyan-300"
                  }`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-cyan-600 shadow-sm">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-medium text-slate-900">
                      Upload chest X-ray
                    </p>
                    <p className="text-xs text-slate-500">
                      Drag and drop or click to browse
                    </p>
                  </div>
                  <div className="text-xs text-slate-400">
                    PNG, JPG, or DICOM
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0];
                      if (nextFile) handleFile(nextFile);
                    }}
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {previewUrl ? (
                    <button
                      type="button"
                      onClick={() => setIsPreviewOpen(true)}
                      className="group relative h-40 w-full overflow-hidden rounded-xl"
                    >
                      <img
                        src={previewUrl}
                        alt="X-ray preview"
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-xs font-semibold uppercase tracking-[0.2em] text-white opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100">
                        Click to expand
                      </span>
                    </button>
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">
                      Preview
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={analyzeImage}
                disabled={!file || status === "analyzing"}
                className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {status === "analyzing" ? "Analyzing..." : "Analyze"}
              </button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">Results</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {status}
                </span>
              </div>

              {status === "idle" && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  Upload an image to view diagnostic results.
                </div>
              )}

              {status === "preview" && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                  Preview ready. Click Analyze to run the model.
                </div>
              )}

              {status === "analyzing" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-cyan-500" />
                    Analyzing image with Retina model...
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-500" />
                  </div>
                </div>
              )}

              {status === "result" && result && (
                <div
                  className={`space-y-4 rounded-2xl border p-5 ${theme.soft} ${theme.border}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Diagnosis
                      </p>
                      <p className={`text-2xl font-semibold ${theme.accent}`}>
                        {result.diagnosis}
                      </p>
                    </div>
                    <div
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${theme.pill}`}
                    >
                      {result.is_critical ? (
                        <>
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Warning
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Safe
                        </>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center justify-between">
                      <span>Confidence</span>
                      <span className="font-semibold text-slate-900">
                        {confidencePercent}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${
                          result.is_critical ? "bg-red-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${confidencePercent}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={resetFlow}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                  >
                    Analyze another image
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
      <style jsx global>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        main section > * {
          animation: fadeUp 0.5s ease-out both;
        }
      `}</style>

      {isPreviewOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsPreviewOpen(false)}
        >
          <button
            type="button"
            className="absolute right-6 top-6 rounded-full bg-white/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700"
            onClick={() => setIsPreviewOpen(false)}
          >
            Close
          </button>
          <div
            className="max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Annotate</span>
                <span>Pen size: {penSize}px</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { color: "#2563eb", label: "Blue" },
                  { color: "#16a34a", label: "Green" },
                  { color: "#f97316", label: "Orange" },
                  { color: "#dc2626", label: "Red" },
                  { color: "#0f172a", label: "Black" },
                ].map((swatch) => (
                  <button
                    key={swatch.color}
                    type="button"
                    aria-label={`Select ${swatch.label}`}
                    onClick={() => setPenColor(swatch.color)}
                    className={`h-6 w-6 rounded-full border ${
                      penColor === swatch.color
                        ? "border-slate-900 ring-2 ring-slate-300"
                        : "border-slate-200"
                    }`}
                    style={{ backgroundColor: swatch.color }}
                  />
                ))}
                <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1">
                  <span className="text-xs font-semibold text-slate-600">
                    Size
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    value={penSize}
                    onChange={(event) =>
                      setPenSize(Number(event.target.value))
                    }
                    className="h-1 w-20 cursor-pointer"
                  />
                </div>
                <button
                  type="button"
                  onClick={undoStroke}
                  disabled={!canUndo}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redoStroke}
                  disabled={!canRedo}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-300"
                >
                  Redo
                </button>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="relative inline-block">
                <img
                  ref={imgRef}
                  src={previewUrl}
                  alt="X-ray expanded preview"
                  className="max-h-[70vh] max-w-[90vw] rounded-xl object-contain"
                  onLoad={syncCanvasSize}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 h-full w-full rounded-xl"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
