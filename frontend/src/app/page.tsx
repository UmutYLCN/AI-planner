"use client";

import React, { useState, useRef } from "react";
import {
  UploadCloud,
  PlaySquare,
  Clock,
  CalendarDays,
  ArrowRight,
  Sparkles,
  Loader2,
  Plus,
  X,
  FileText,
  Link,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [inputType, setInputType] = useState<"pdf" | "youtube">("pdf");

  // Multiple item state
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([""]);

  // Constraint state
  const [mode, setMode] = useState<"daily_hours" | "target_date">("daily_hours");
  const [dailyHours, setDailyHours] = useState("2");
  const [targetDate, setTargetDate] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [roadmap, setRoadmap] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── PDF handlers ──────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).filter(
      (f) => !pdfFiles.some((existing) => existing.name === f.name)
    );
    setPdfFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removePdf = (idx: number) => {
    setPdfFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── YouTube handlers ───────────────────────────────────────────────────────
  const updateUrl = (idx: number, val: string) => {
    setYoutubeUrls((prev) => prev.map((u, i) => (i === idx ? val : u)));
  };
  const addUrl = () => setYoutubeUrls((prev) => [...prev, ""]);
  const removeUrl = (idx: number) => {
    setYoutubeUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (inputType === "pdf" && pdfFiles.length === 0) {
      alert("Please upload at least one PDF.");
      return;
    }
    const validUrls = youtubeUrls.filter((u) => u.trim() !== "");
    if (inputType === "youtube" && validUrls.length === 0) {
      alert("Please enter at least one YouTube URL.");
      return;
    }
    if (mode === "daily_hours" && !dailyHours) {
      alert("Please enter your daily study hours.");
      return;
    }
    if (mode === "target_date" && !targetDate) {
      alert("Please select a target completion date.");
      return;
    }

    setIsLoading(true);
    setRoadmap(null);

    try {
      const formData = new FormData();

      if (inputType === "pdf") {
        pdfFiles.forEach((f) => formData.append("files", f));
        formData.append("youtube_urls", "[]");
      } else {
        formData.append("youtube_urls", JSON.stringify(validUrls));
      }

      formData.append("mode", mode);
      if (mode === "daily_hours") formData.append("daily_hours", dailyHours);
      if (mode === "target_date") formData.append("target_date", targetDate);

      const res = await fetch("http://localhost:8000/api/plan", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Something went wrong.");

      setRoadmap(data.roadmap);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{
        backgroundImage:
          "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')",
      }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-3xl z-0" />

      <main className="relative z-10 container mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-screen">
        <AnimatePresence mode="wait">
          {!roadmap ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl"
            >
              {/* Hero */}
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel text-sm mb-6">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  <span>AI-Powered Study Planner</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight text-white">
                  Master your materials.{" "}
                  <br className="hidden md:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                    Own your time.
                  </span>
                </h1>
                <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                  Upload PDFs or add YouTube links. Tell us your schedule and let AI build the perfect roadmap.
                </p>
              </div>

              <div className="glass-panel rounded-3xl p-8 shadow-2xl border border-white/10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-y md:divide-y-0 md:divide-x divide-white/10">

                  {/* ── LEFT: Source ── */}
                  <div className="flex flex-col gap-5 pr-0 md:pr-8">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">1</span>
                      Source Material
                    </h2>

                    {/* Tab toggle */}
                    <div className="flex p-1 glass rounded-lg">
                      <button
                        onClick={() => setInputType("pdf")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-all ${inputType === "pdf" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}
                      >
                        <UploadCloud className="w-4 h-4" /> PDF
                      </button>
                      <button
                        onClick={() => setInputType("youtube")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-all ${inputType === "youtube" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}
                      >
                        <PlaySquare className="w-4 h-4 text-red-400" /> YouTube
                      </button>
                    </div>

                    {/* PDF upload area */}
                    {inputType === "pdf" ? (
                      <div className="flex flex-col gap-3">
                        <input
                          type="file"
                          accept="application/pdf"
                          multiple
                          className="hidden"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                        />
                        {/* File list */}
                        {pdfFiles.length > 0 && (
                          <ul className="space-y-2">
                            {pdfFiles.map((f, i) => (
                              <li
                                key={i}
                                className="flex items-center gap-3 bg-black/20 rounded-xl px-4 py-3 border border-white/5"
                              >
                                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                <span className="text-sm text-white truncate flex-1">{f.name}</span>
                                <button onClick={() => removePdf(i)} className="text-muted-foreground hover:text-red-400 transition-colors">
                                  <X className="w-4 h-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-white/20 hover:border-blue-400/50 transition-colors rounded-2xl py-8 flex flex-col items-center gap-3 bg-black/20 cursor-pointer group"
                        >
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                            <Plus className="w-6 h-6 text-muted-foreground group-hover:text-blue-400 transition-colors" />
                          </div>
                          <span className="text-sm text-muted-foreground group-hover:text-white transition-colors">
                            {pdfFiles.length === 0 ? "Click to add PDF(s)" : "Add more PDFs"}
                          </span>
                        </button>
                      </div>
                    ) : (
                      /* YouTube URL inputs */
                      <div className="flex flex-col gap-3">
                        {youtubeUrls.map((url, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <div className="flex-1 flex items-center gap-2 bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus-within:border-blue-500/50 transition-colors">
                              <Link className="w-4 h-4 text-muted-foreground shrink-0" />
                              <input
                                type="text"
                                value={url}
                                onChange={(e) => updateUrl(idx, e.target.value)}
                                placeholder="https://youtube.com/watch?v=... or playlist"
                                className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                              />
                            </div>
                            {youtubeUrls.length > 1 && (
                              <button onClick={() => removeUrl(idx)} className="text-muted-foreground hover:text-red-400 transition-colors p-1">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={addUrl}
                          className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors py-1"
                        >
                          <Plus className="w-4 h-4" /> Add another URL
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── RIGHT: Parameters ── */}
                  <div className="flex flex-col gap-5 pt-8 md:pt-0 pl-0 md:pl-8">
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold">2</span>
                      Study Parameters
                    </h2>

                    {/* Mode selector */}
                    <div className="flex p-1 glass rounded-lg">
                      <button
                        onClick={() => setMode("daily_hours")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-all ${mode === "daily_hours" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}
                      >
                        <Clock className="w-4 h-4 text-amber-400" /> Daily Hours
                      </button>
                      <button
                        onClick={() => setMode("target_date")}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-all ${mode === "target_date" ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"}`}
                      >
                        <CalendarDays className="w-4 h-4 text-green-400" /> Target Date
                      </button>
                    </div>

                    <AnimatePresence mode="wait">
                      {mode === "daily_hours" ? (
                        <motion.div
                          key="hours"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="bg-black/20 p-5 rounded-2xl border border-white/5"
                        >
                          <p className="text-sm text-muted-foreground mb-3">
                            How many hours can you study per day?
                          </p>
                          <div className="flex items-center gap-4">
                            <input
                              type="number"
                              min="0.5"
                              max="12"
                              step="0.5"
                              value={dailyHours}
                              onChange={(e) => setDailyHours(e.target.value)}
                              className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                            />
                            <span className="text-muted-foreground">hours / day</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-3">
                            AI will calculate when you'll finish and plan accordingly.
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="date"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          className="bg-black/20 p-5 rounded-2xl border border-white/5"
                        >
                          <p className="text-sm text-muted-foreground mb-3">
                            When do you need to finish everything?
                          </p>
                          <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50"
                          />
                          <p className="text-xs text-muted-foreground mt-3">
                            AI will calculate the required daily hours for you.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="mt-auto pt-2">
                      <button
                        onClick={handleGenerate}
                        disabled={isLoading}
                        className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-4 transition-all shadow-[0_0_40px_rgba(37,99,235,0.3)] hover:shadow-[0_0_60px_rgba(37,99,235,0.5)] flex items-center justify-center gap-2 group"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" /> Generating Roadmap...
                          </>
                        ) : (
                          <>
                            Generate Roadmap{" "}
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── Roadmap Results ── */
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl"
            >
              {/* Header card */}
              <div className="glass-panel p-7 rounded-3xl mb-6 border border-white/10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400 mb-2">
                      {roadmap.title || "Your Custom Study Roadmap"}
                    </h2>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-amber-400" />
                        {roadmap.total_estimated_hours}h total
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        {roadmap.recommended_daily_hours}h / day recommended
                      </span>
                      {roadmap.estimated_finish_date && (
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="w-4 h-4 text-green-400" />
                          Finish by {roadmap.estimated_finish_date}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setRoadmap(null)}
                    className="shrink-0 px-5 py-2 bg-white/5 hover:bg-white/10 rounded-full text-sm font-medium transition-colors border border-white/10"
                  >
                    ← New Plan
                  </button>
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-4">
                {roadmap.modules?.map((block: any, idx: number) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    className="bg-black/20 p-6 rounded-2xl border border-white/5 relative overflow-hidden group"
                  >
                    <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-blue-500 to-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-3 pl-4">
                      <h3 className="text-lg font-semibold">
                        <span className="text-blue-400/70 mr-2 text-sm">Stage {idx + 1}</span>
                        {block.module_name}
                      </h3>
                      <div className="flex gap-2 shrink-0">
                        <span className="bg-blue-500/20 text-blue-400 text-xs px-3 py-1 rounded-full font-medium">
                          {block.estimated_hours}h
                        </span>
                        <span className="bg-white/5 text-muted-foreground text-xs px-3 py-1 rounded-full">
                          {block.suggested_schedule}
                        </span>
                      </div>
                    </div>

                    <ul className="pl-8 space-y-1.5">
                      {block.topics?.map((topic: string, i: number) => (
                        <li key={i} className="text-white/75 flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/60 mt-2 shrink-0" />
                          {topic}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
