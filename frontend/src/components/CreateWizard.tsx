"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, UploadCloud, PlaySquare, Plus, Loader2,
  FileText, ArrowRight, BookOpen, CalendarDays,
  Settings, Layers, ListChecks
} from "lucide-react";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateWizard({ onClose, onCreated }: Props) {
  const router = useRouter();
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([""]);
  const [targetDate, setTargetDate] = useState("");
  const [strictMode, setStrictMode] = useState(true);
  const [granularity, setGranularity] = useState("macro");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Analyzing your materials...");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasMaterials = pdfFiles.length > 0 || youtubeUrls.some(u => u.trim());

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).filter(
      f => !pdfFiles.some(ex => ex.name === f.name)
    );
    setPdfFiles(p => [...p, ...newFiles]);
    e.target.value = "";
  };

  const updateUrl = (i: number, val: string) =>
    setYoutubeUrls(u => u.map((v, j) => (j === i ? val : v)));

  const handleSubmit = async () => {
    setIsLoading(true);
    const msgs = [
      "Analyzing your materials...",
      "Fetching video transcripts...",
      "Finding semantic connections...",
      "Building your roadmap...",
    ];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % msgs.length;
      setLoadingMsg(msgs[idx]);
    }, 2000);

    try {
      const formData = new FormData();
      const validUrls = youtubeUrls.filter(u => u.trim());

      pdfFiles.forEach(f => formData.append("files", f));
      formData.append("youtube_urls", JSON.stringify(validUrls));
      if (targetDate) formData.append("target_date", targetDate);
      formData.append("strict_mode", strictMode.toString());
      formData.append("granularity", granularity);

      const res = await fetch("http://localhost:8000/api/plan", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "API error");

      const id = await db.roadmaps.add({
        title: data.roadmap.title,
        sourceType: pdfFiles.length > 0 && validUrls.length > 0 ? "mixed"
          : pdfFiles.length > 0 ? "pdf" : "youtube",
        materialNames: [...pdfFiles.map(f => f.name), ...validUrls],
        target_date: targetDate || undefined,
        roadmap: data.roadmap,
        progress: {},
        attachedFiles: pdfFiles.map(f => ({ name: f.name, data: f })),
        createdAt: new Date(),
      });

      clearInterval(interval);
      onCreated();
      router.push(`/roadmap/${id}`);
    } catch (err: any) {
      clearInterval(interval);
      alert("Error: " + err.message);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(14,26,43,0.55)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="clay-card"
          style={{ width: "100%", maxWidth: 440, borderRadius: 28, padding: "48px 32px", textAlign: "center" }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
            style={{ display: "inline-block", marginBottom: 28 }}
          >
            <Loader2 className="w-14 h-14" style={{ color: "var(--green)" }} />
          </motion.div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{loadingMsg}</div>
          <p style={{ color: "#64748b", fontSize: 14 }}>This usually takes 15–40 seconds...</p>
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
            {[60, 40, 75].map((w, i) => (
              <motion.div
                key={i}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: `${w}%`, opacity: 1 }}
                transition={{ delay: i * 0.5 + 0.3, duration: 1.0, ease: "easeInOut" }}
                style={{
                  height: 8, background: i % 2 === 0 ? "var(--green-light)" : "#dbeafe",
                  borderRadius: 100, margin: "0 auto",
                  border: "1.5px solid var(--border-clay)"
                }}
              />
            ))}
          </div>
        </motion.div>
      </motion.div>
    );
  }

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
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 20 }}
        className="clay-card"
        style={{ width: "100%", maxWidth: 580, borderRadius: 28, overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
      >
        {/* Header */}
        <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 4 }}>New Roadmap</h2>
            <p style={{ fontSize: 13, color: "#64748b" }}>Add your study materials and we'll build a smart roadmap.</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4 }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: 28, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>

          {/* ── PDF Section ── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <FileText className="w-3.5 h-3.5" /> PDF Documents
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="file" accept="application/pdf" multiple ref={fileInputRef} onChange={handleFiles} style={{ display: "none" }} />
              {pdfFiles.map((f, i) => (
                <div key={i} className="clay-card clay-card-blue" style={{ padding: "10px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10 }}>
                  <FileText className="w-4 h-4" style={{ color: "#3b82f6", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <button
                    onClick={() => setPdfFiles(p => p.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", flexShrink: 0 }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "2.5px dashed var(--border-clay)", borderRadius: 16, padding: "14px",
                  background: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex",
                  alignItems: "center", justifyContent: "center", gap: 8,
                  color: "var(--navy-mid)", width: "100%",
                }}
                onMouseOver={e => (e.currentTarget.style.borderColor = "var(--navy)")}
                onMouseOut={e => (e.currentTarget.style.borderColor = "var(--border-clay)")}
              >
                <UploadCloud className="w-5 h-5" />
                <span style={{ fontWeight: 700, fontSize: 13 }}>
                  {pdfFiles.length === 0 ? "Upload PDFs" : "Add more PDFs"}
                </span>
              </button>
            </div>
          </div>

          {/* ── YouTube Section ── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <PlaySquare className="w-3.5 h-3.5" /> YouTube Videos / Playlists
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {youtubeUrls.map((url, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="clay-card" style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, background: "white" }}>
                    <PlaySquare className="w-4 h-4" style={{ color: "#ef4444", flexShrink: 0 }} />
                    <input
                      value={url}
                      onChange={e => updateUrl(i, e.target.value)}
                      placeholder="Paste YouTube link here..."
                      style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13 }}
                    />
                  </div>
                  {youtubeUrls.length > 1 && (
                    <button
                      onClick={() => setYoutubeUrls(u => u.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setYoutubeUrls(u => [...u, ""])}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--green-dark)", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}
              >
                <Plus className="w-4 h-4" /> Add another link
              </button>
            </div>
          </div>

          {/* ── Plan Settings ── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Settings className="w-3.5 h-3.5" /> Plan Settings
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="clay-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: "white" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", display: "flex", alignItems: "center", gap: 6 }}>
                    <ListChecks className="w-4 h-4" style={{ color: "#3b82f6" }} /> 
                    Include All Content
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Force AI to include every video without skipping</div>
                </div>
                <button 
                  onClick={() => setStrictMode(!strictMode)}
                  style={{
                    background: strictMode ? "var(--green)" : "#e2e8f0",
                    border: "none", cursor: "pointer", width: 44, height: 24, borderRadius: 12,
                    display: "flex", alignItems: "center", padding: 2,
                    justifyContent: strictMode ? "flex-end" : "flex-start",
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ width: 20, height: 20, background: "white", borderRadius: "50%", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }} />
                </button>
              </div>

              <div className="clay-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 12, background: "white" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Layers className="w-4 h-4" style={{ color: "#8b5cf6" }} /> 
                    Generate Sub-Tasks
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Break down materials into smaller, actionable steps</div>
                </div>
                <button 
                  onClick={() => setGranularity(g => g === "macro" ? "micro" : "macro")}
                  style={{
                    background: granularity === "micro" ? "var(--green)" : "#e2e8f0",
                    border: "none", cursor: "pointer", width: 44, height: 24, borderRadius: 12,
                    display: "flex", alignItems: "center", padding: 2,
                    justifyContent: granularity === "micro" ? "flex-end" : "flex-start",
                    transition: "all 0.2s"
                  }}
                >
                  <div style={{ width: 20, height: 20, background: "white", borderRadius: "50%", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Target Date (optional) ── */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <CalendarDays className="w-3.5 h-3.5" /> Target Finish Date
              <span style={{ fontSize: 10, fontWeight: 500, color: "#b0b8c8", marginLeft: 4 }}>(optional)</span>
            </div>
            <div className="clay-card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "white" }}>
              <CalendarDays className="w-4 h-4" style={{ color: "#10b981", flexShrink: 0 }} />
              <input
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13, color: "var(--navy)" }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "0 28px 28px", flexShrink: 0 }}>
          <button
            className="btn-clay btn-green"
            disabled={!hasMaterials}
            onClick={handleSubmit}
            style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "14px", borderRadius: 16, opacity: hasMaterials ? 1 : 0.5 }}
          >
            <BookOpen className="w-5 h-5" /> Generate Roadmap <ArrowRight className="w-4 h-4" />
          </button>
          {!hasMaterials && (
            <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
              Add at least one PDF or YouTube link to continue
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
