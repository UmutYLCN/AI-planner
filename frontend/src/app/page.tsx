"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  BookOpen, Zap, Target, Clock, CheckCircle, Star,
  ArrowRight, Play, BarChart2, Users, FileText
} from "lucide-react";

const STATS = [
  { value: "10K+", label: "Roadmaps Created" },
  { value: "95%", label: "Completion Rate" },
  { value: "4.9★", label: "User Rating" },
];

const FEATURES = [
  {
    icon: <FileText className="w-7 h-7" />,
    title: "Drop in your PDFs",
    desc: "Upload any study material — textbooks, notes, research papers — and let AI structure it.",
    color: "clay-card-blue",
    accent: "#60a5fa",
  },
  {
    icon: <Play className="w-7 h-7" />,
    title: "Link YouTube content",
    desc: "Add a playlist or individual videos. AI reads durations and plans your learning time.",
    color: "clay-card-pink",
    accent: "#f472b6",
  },
  {
    icon: <Target className="w-7 h-7" />,
    title: "Set your goal",
    desc: "Tell us how many hours a day or pick a deadline — we'll fit everything perfectly.",
    color: "clay-card-yellow",
    accent: "#facc15",
  },
  {
    icon: <BarChart2 className="w-7 h-7" />,
    title: "Track progress",
    desc: "Check off every topic as you go. See your roadmap come to life day by day.",
    color: "clay-card-green",
    accent: "#22c55e",
  },
];

const TESTIMONIALS = [
  {
    name: "Zeynep A.",
    role: "Medical Student",
    text: "I uploaded 3 anatomy PDFs and got a perfect 6-week schedule. Passed my exam with flying colors! 🎉",
    color: "clay-card-purple",
    stars: 5,
  },
  {
    name: "Marcus T.",
    role: "Self-taught Developer",
    text: "Linked a 60-video YouTube playlist and AI broke it into 2-hour daily sessions. Life changing.",
    color: "clay-card-orange",
    stars: 5,
  },
  {
    name: "Sofia R.",
    role: "Language Learner",
    text: "Set a target date for my IELTS — the planner calculated exactly 1.5h/day. Super accurate!",
    color: "clay-card-blue",
    stars: 5,
  },
];

const fade = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } };

export default function LandingPage() {
  return (
    <div style={{ background: "var(--cream)", minHeight: "100vh" }}>
      {/* ── NAV ── */}
      <nav
        className="clay-card"
        style={{
          margin: "16px",
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderRadius: "18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            className="clay-card clay-card-green"
            style={{ padding: "8px 10px", borderRadius: 12, boxShadow: "2px 2px 0 var(--border-clay)", display: "flex" }}
          >
            <BookOpen className="w-5 h-5" style={{ color: "var(--green-dark)" }} />
          </div>
          <span style={{ fontWeight: 800, fontSize: 20, color: "var(--navy)" }}>AI Planner</span>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          {["Features", "How it works", "Testimonials"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/ /g, "-")}`}
              style={{ fontWeight: 600, fontSize: 14, color: "var(--navy)", textDecoration: "none", opacity: 0.7 }}
            >
              {item}
            </a>
          ))}
        </div>

        <Link href="/dashboard" className="btn-clay btn-navy btn-sm">
          Go to Dashboard →
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 24px 60px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
        <motion.div initial="hidden" animate="show" variants={fade} transition={{ duration: 0.5 }}>
          <div className="pill pill-green" style={{ marginBottom: 24, width: "fit-content" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
            New: AI-Powered Study Planning
          </div>
          <h1 style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: "var(--navy)" }}>
            Study smarter,{" "}
            <span style={{ color: "var(--green)" }}>not harder.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "#475569", marginBottom: 36, maxWidth: 440 }}>
            Upload your PDFs or YouTube playlists. Set a schedule. Let AI craft the
            perfect step-by-step learning roadmap — just for you.
          </p>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 48 }}>
            <Link href="/dashboard" className="btn-clay btn-green" style={{ fontSize: 16 }}>
              Start Planning Free →
            </Link>
            <a href="#how-it-works" className="btn-clay btn-ghost" style={{ fontSize: 16 }}>
              See how it works
            </a>
          </div>

          <div style={{ display: "flex", gap: 36 }}>
            {STATS.map((s) => (
              <div key={s.value}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "var(--navy)" }}>{s.value}</div>
                <div style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Hero card mock */}
        <motion.div
          initial={{ opacity: 0, x: 30, rotate: 1 }}
          animate={{ opacity: 1, x: 0, rotate: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ position: "relative" }}
        >
          <div className="clay-card" style={{ padding: 28, borderRadius: 24 }}>
            {/* Mini nav */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>📚 React Mastery Roadmap</span>
              <span className="pill pill-green" style={{ fontSize: 12 }}>Active</span>
            </div>

            {/* Modules progress */}
            {[
              { name: "JavaScript Foundations", pct: 100, color: "#22c55e" },
              { name: "React Core Concepts", pct: 65, color: "#60a5fa" },
              { name: "State Management", pct: 20, color: "#a78bfa" },
              { name: "Testing & Deployment", pct: 0, color: "#e5e7eb" },
            ].map((m) => (
              <div key={m.name} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: m.pct === 100 ? "var(--green-dark)" : "var(--navy)" }}>
                    {m.pct === 100 && "✅ "}
                    {m.name}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: m.pct > 0 ? "var(--navy)" : "#94a3b8" }}>
                    {m.pct}%
                  </span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}

            <div className="btn-clay btn-green" style={{ width: "100%", marginTop: 20, justifyContent: "center" }}>
              Continue Learning <ArrowRight className="w-4 h-4" />
            </div>
          </div>

          {/* Floating badge */}
          <motion.div
            animate={{ y: [-4, 4, -4] }}
            transition={{ repeat: Infinity, duration: 3 }}
            className="clay-card clay-card-yellow"
            style={{ position: "absolute", top: -20, right: -20, padding: "10px 16px", borderRadius: 16, fontWeight: 700, fontSize: 13 }}
          >
            🎯 65% complete!
          </motion.div>

          <motion.div
            animate={{ y: [4, -4, 4] }}
            transition={{ repeat: Infinity, duration: 3.5 }}
            className="clay-card clay-card-green"
            style={{ position: "absolute", bottom: -16, left: -20, padding: "10px 16px", borderRadius: 16, fontWeight: 700, fontSize: 13 }}
          >
            ✨ AI-Generated
          </motion.div>
        </motion.div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px" }}>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={fade}
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <h2 style={{ fontSize: 44, fontWeight: 800, marginBottom: 12 }}>Everything you need.</h2>
          <p style={{ fontSize: 18, color: "#64748b", maxWidth: 480, margin: "0 auto" }}>
            From raw materials to a beautiful, actionable study plan — in seconds.
          </p>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fade}
              transition={{ delay: i * 0.08 }}
              className={`clay-card ${f.color}`}
              style={{ padding: "28px 32px", borderRadius: 22 }}
            >
              <div
                style={{
                  width: 52, height: 52, borderRadius: 14, background: "white",
                  border: "2px solid var(--border-clay)", display: "flex", alignItems: "center",
                  justifyContent: "center", marginBottom: 16, color: f.accent, boxShadow: "2px 2px 0 var(--border-clay)"
                }}
              >
                {f.icon}
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569" }}>{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px" }}>
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={fade}
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <h2 style={{ fontSize: 44, fontWeight: 800, marginBottom: 12 }}>Ready in 3 steps.</h2>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {[
            { step: "01", title: "Add your materials", desc: "Upload PDFs or paste YouTube links. Mix and match as many as you want.", emoji: "📎", color: "clay-card-blue" },
            { step: "02", title: "Set your schedule", desc: "Choose daily hours or a deadline — we'll handle the math perfectly.", emoji: "⏱️", color: "clay-card-orange" },
            { step: "03", title: "Follow your roadmap", desc: "Get a day-by-day plan. Check off topics as you learn. Track your streak!", emoji: "🗺️", color: "clay-card-green" },
          ].map((s, i) => (
            <motion.div
              key={s.step}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              variants={fade}
              transition={{ delay: i * 0.1 }}
              className={`clay-card ${s.color}`}
              style={{ padding: 28, borderRadius: 22, textAlign: "center" }}
            >
              <div style={{ fontSize: 40, marginBottom: 12 }}>{s.emoji}</div>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#94a3b8", marginBottom: 6, letterSpacing: 2 }}>STEP {s.step}</div>
              <h3 style={{ fontWeight: 700, fontSize: 19, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "#475569" }}>{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px" }}>
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fade} style={{ textAlign: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: 44, fontWeight: 800, marginBottom: 12 }}>Learners love it. ❤️</h2>
        </motion.div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial="hidden" whileInView="show" viewport={{ once: true }} variants={fade} transition={{ delay: i * 0.1 }}
              className={`clay-card ${t.color}`}
              style={{ padding: 28, borderRadius: 22 }}
            >
              <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="w-4 h-4" style={{ fill: "#facc15", stroke: "none" }} />
                ))}
              </div>
              <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 18 }}>"{t.text}"</p>
              <div style={{ fontWeight: 700 }}>{t.name}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{t.role}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto 80px", padding: "0 24px" }}>
        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true }} variants={fade}
          className="clay-card clay-card-green"
          style={{ padding: "60px 48px", borderRadius: 28, textAlign: "center" }}
        >
          <h2 style={{ fontSize: 46, fontWeight: 800, marginBottom: 16 }}>Ready to own your learning?</h2>
          <p style={{ fontSize: 18, color: "#166534", marginBottom: 32 }}>
            Create your first free roadmap in under 2 minutes.
          </p>
          <Link href="/dashboard" className="btn-clay btn-navy" style={{ fontSize: 17, padding: "16px 40px" }}>
            Start for Free →
          </Link>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "2px solid #e2e8f0", padding: "28px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
        © 2025 AI Planner · Built with ❤️ and a lot of GPT-4o-mini
      </footer>
    </div>
  );
}
