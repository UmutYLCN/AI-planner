"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UploadCloud, PlaySquare, Plus, Link as LinkIcon, Clock, CalendarDays, Loader2, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

type Step = 1 | 2 | 3;

export default function CreateWizard({ onClose, onCreated }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [inputType, setInputType] = useState<"pdf" | "youtube">("pdf");
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([""]);
  const [mode, setMode] = useState<"daily_hours" | "target_date">("daily_hours");
  const [dailyHours, setDailyHours] = useState("2");
  const [targetDate, setTargetDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Analyzing your materials...");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handlers ─────────────────────────────────────────────────────────
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).filter(
      (f) => !pdfFiles.some((ex) => ex.name === f.name)
    );
    setPdfFiles((p) => [...p, ...newFiles]);
    e.target.value = "";
  };

  const updateUrl = (i: number, val: string) =>
    setYoutubeUrls((u) => u.map((v, j) => (j === i ? val : v)));

  // ── Step validation ───────────────────────────────────────────────────────
  const canProceed = () => {
    if (step === 1) {
      if (inputType === "pdf") return pdfFiles.length > 0;
      return youtubeUrls.some((u) => u.trim() !== "");
    }
    if (step === 2) {
      if (mode === "daily_hours") return !!dailyHours;
      return !!targetDate;
    }
    return true;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setStep(3);
    setIsLoading(true);

    const msgs = [
      "Analyzing your materials...",
      "Structuring topics...",
      "Calculating your schedule...",
      "Building your roadmap...",
    ];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % msgs.length;
      setLoadingMsg(msgs[idx]);
    }, 1800);

    try {
      const formData = new FormData();
      const validUrls = youtubeUrls.filter((u) => u.trim());

      if (inputType === "pdf") {
        pdfFiles.forEach((f) => formData.append("files", f));
        formData.append("youtube_urls", "[]");
      } else {
        formData.append("youtube_urls", JSON.stringify(validUrls));
      }

      formData.append("mode", mode);
      if (mode === "daily_hours") formData.append("daily_hours", dailyHours);
      else formData.append("target_date", targetDate);

      const res = await fetch("http://localhost:8000/api/plan", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "API error");

      const materialNames =
        inputType === "pdf"
          ? pdfFiles.map((f) => f.name)
          : validUrls;

      const id = await db.roadmaps.add({
        title: data.roadmap.title,
        sourceType: inputType,
        materialNames,
        constraints: {
          mode,
          daily_hours: mode === "daily_hours" ? parseFloat(dailyHours) : undefined,
          target_date: mode === "target_date" ? targetDate : undefined,
        },
        roadmap: data.roadmap,
        progress: {},
        createdAt: new Date(),
      });

      clearInterval(interval);
      onCreated();
      router.push(`/roadmap/${id}`);
    } catch (err: any) {
      clearInterval(interval);
      alert("Error: " + err.message);
      setStep(2);
      setIsLoading(false);
    }
  };

  const STEP_LABELS = ["Add Materials", "Set Schedule", "Generating..."];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(14,26,43,0.55)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        className="clay-card"
        style={{ width: "100%", maxWidth: 580, borderRadius: 28, overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
              {step === 3 ? "✨ Creating your roadmap" : "New Roadmap"}
            </h2>
            {/* Step indicator */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  style={{
                    height: 6, width: step >= s ? 28 : 16,
                    borderRadius: 100,
                    background: step > s ? "var(--green)" : step === s ? "var(--navy)" : "#e2e8f0",
                    transition: "all 0.3s ease",
                  }}
                />
              ))}
              <span style={{ fontSize: 13, color: "#64748b", marginLeft: 4 }}>{STEP_LABELS[step - 1]}</span>
            </div>
          </div>
          {step < 3 && (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 28 }}>
          <AnimatePresence mode="wait">

            {/* ── STEP 1: Materials ── */}
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "var(--cream)", borderRadius: 100, padding: 4, border: "2px solid var(--border-clay)" }}>
                  {[["pdf", "PDF Files", <UploadCloud className="w-4 h-4" />], ["youtube", "YouTube Links", <PlaySquare className="w-4 h-4" />]].map(([t, label, icon]) => (
                    <button
                      key={t as string}
                      onClick={() => setInputType(t as "pdf" | "youtube")}
                      className={`btn-clay ${inputType === t ? "btn-navy" : ""}`}
                      style={{
                        flex: 1, padding: "10px 0", fontSize: 14, borderRadius: 100,
                        background: inputType === t ? "var(--navy)" : "transparent",
                        color: inputType === t ? "white" : "var(--navy)",
                        border: "none", boxShadow: "none",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                      }}
                    >
                      {icon as React.ReactNode} {label as string}
                    </button>
                  ))}
                </div>

                {inputType === "pdf" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input type="file" accept="application/pdf" multiple ref={fileInputRef} onChange={handleFiles} style={{ display: "none" }} />
                    {pdfFiles.map((f, i) => (
                      <div key={i} className="clay-card clay-card-blue" style={{ padding: "12px 16px", borderRadius: 14, display: "flex", alignItems: "center", gap: 10 }}>
                        <FileText className="w-4 h-4" style={{ color: "#3b82f6", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <button onClick={() => setPdfFiles(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", flexShrink: 0 }}>
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        border: "2.5px dashed #94a3b8", borderRadius: 18, padding: "28px 16px",
                        background: "white", cursor: "pointer", display: "flex", flexDirection: "column",
                        alignItems: "center", gap: 8, color: "#64748b", transition: "border-color 0.2s",
                        width: "100%"
                      }}
                    >
                      <UploadCloud className="w-8 h-8" />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{pdfFiles.length === 0 ? "Click to add PDF(s)" : "Add more PDFs"}</span>
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {youtubeUrls.map((url, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div
                          className="clay-card"
                          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 14 }}
                        >
                          <LinkIcon className="w-4 h-4" style={{ color: "#94a3b8", flexShrink: 0 }} />
                          <input
                            value={url}
                            onChange={(e) => updateUrl(i, e.target.value)}
                            placeholder="https://youtube.com/watch?v=... or playlist"
                            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13 }}
                          />
                        </div>
                        {youtubeUrls.length > 1 && (
                          <button onClick={() => setYoutubeUrls(u => u.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => setYoutubeUrls(u => [...u, ""])}
                      style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--green-dark)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
                    >
                      <Plus className="w-4 h-4" /> Add another URL
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── STEP 2: Schedule ── */}
            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "var(--cream)", borderRadius: 100, padding: 4, border: "2px solid var(--border-clay)" }}>
                  {[["daily_hours", "Daily Hours", <Clock className="w-4 h-4" />], ["target_date", "Target Date", <CalendarDays className="w-4 h-4" />]].map(([m, label, icon]) => (
                    <button
                      key={m as string}
                      onClick={() => setMode(m as "daily_hours" | "target_date")}
                      style={{
                        flex: 1, padding: "10px 0", fontWeight: 700, fontSize: 14, borderRadius: 100, cursor: "pointer",
                        background: mode === m ? "var(--navy)" : "transparent",
                        color: mode === m ? "white" : "var(--navy)",
                        border: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                      }}
                    >
                      {icon as React.ReactNode} {label as string}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {mode === "daily_hours" ? (
                    <motion.div key="hours" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="clay-card clay-card-yellow"
                      style={{ padding: 28, borderRadius: 20 }}
                    >
                      <p style={{ fontWeight: 600, marginBottom: 16 }}>How many hours can you study per day?</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <input
                          type="number" min="0.5" max="12" step="0.5" value={dailyHours}
                          onChange={(e) => setDailyHours(e.target.value)}
                          className="clay-card"
                          style={{ width: 80, padding: "10px 0", textAlign: "center", fontSize: 26, fontWeight: 800, border: "2.5px solid var(--border-clay)", borderRadius: 14, background: "white" }}
                        />
                        <div>
                          <div style={{ fontWeight: 700 }}>hours / day</div>
                          <div style={{ fontSize: 13, color: "#64748b" }}>AI will calculate when you'll finish</div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="date" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      className="clay-card clay-card-green"
                      style={{ padding: 28, borderRadius: 20 }}
                    >
                      <p style={{ fontWeight: 600, marginBottom: 16 }}>When do you need to finish everything?</p>
                      <input
                        type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)}
                        className="clay-card"
                        style={{ width: "100%", padding: "12px 16px", fontSize: 15, border: "2.5px solid var(--border-clay)", borderRadius: 14, background: "white" }}
                      />
                      <p style={{ fontSize: 13, color: "#166534", marginTop: 10 }}>
                        AI will calculate the daily hours you need.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* ── STEP 3: Loading ── */}
            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ textAlign: "center", padding: "40px 0" }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                  style={{ display: "inline-block", marginBottom: 28 }}
                >
                  <Loader2 className="w-14 h-14" style={{ color: "var(--green)" }} />
                </motion.div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{loadingMsg}</div>
                <p style={{ color: "#64748b", fontSize: 14 }}>This usually takes 15–30 seconds...</p>

                {[30, 60, 80].map((w, i) => (
                  <motion.div
                    key={i}
                    initial={{ width: 0 }}
                    animate={{ width: `${w}%` }}
                    transition={{ delay: i * 0.8 + 0.4, duration: 1.2, ease: "easeInOut" }}
                    style={{
                      height: 8, background: i % 2 === 0 ? "var(--green-light)" : "#dbeafe",
                      borderRadius: 100, margin: "8px auto",
                      border: "1.5px solid var(--border-clay)"
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer buttons */}
        {step < 3 && (
          <div style={{ padding: "0 28px 28px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {step > 1 && (
              <button className="btn-clay btn-ghost" onClick={() => setStep((s) => (s - 1) as Step)}>
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            )}
            {step < 2 ? (
              <button
                className="btn-clay btn-green"
                disabled={!canProceed()}
                onClick={() => setStep(2)}
                style={{ opacity: canProceed() ? 1 : 0.5 }}
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                className="btn-clay btn-green"
                disabled={!canProceed()}
                onClick={handleSubmit}
                style={{ opacity: canProceed() ? 1 : 0.5 }}
              >
                Generate Roadmap ✨
              </button>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
