import React, { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, LayoutDashboard, ListChecks, Send, Loader2, CheckCircle2, XCircle, TrendingUp, BookOpen, Flame, Clock } from "lucide-react";

/**
 * SkillsBuildApp
 * -----------------------------------------------------------------------
 * Single-file, 3-screen learning console: AI Tutor (SSE chat), Quiz, Dashboard.
 *
 * INTEGRATION NOTES (read before wiring to a real backend):
 * 1. /api/tutor is expected to be a POST endpoint that streams a response
 *    as Server-Sent-Event-style chunks: lines prefixed with "data: ".
 *    Standard `EventSource` cannot send a POST body, so this component
 *    streams via `fetch()` + a manual ReadableStream reader instead.
 *    Expected chunk format per line: `data: {"token":"..."}\n\n`
 *    A line `data: [DONE]` closes the stream.
 * 2. /api/dashboard is expected to return JSON:
 *    { progressScore: number, topicsCovered: number, streakDays: number,
 *      history: [{ id, topic, date, score, status }] }
 *    On fetch failure this component falls back to mock data so the UI
 *    is always demonstrable — remove FALLBACK_DASHBOARD once your
 *    backend is live if you'd rather show a hard error state.
 * -----------------------------------------------------------------------
 */

// ---------------------------------------------------------------------------
// Mock / fallback data
// ---------------------------------------------------------------------------

const FALLBACK_DASHBOARD = {
  progressScore: 74,
  topicsCovered: 12,
  streakDays: 6,
  history: [
    { id: 1, topic: "Neural Network Fundamentals", date: "2026-07-12", score: 88, status: "passed" },
    { id: 2, topic: "Supervised vs Unsupervised Learning", date: "2026-07-10", score: 65, status: "passed" },
    { id: 3, topic: "Gradient Descent", date: "2026-07-08", score: 42, status: "failed" },
    { id: 4, topic: "Intro to Python for AI", date: "2026-07-05", score: 91, status: "passed" },
  ],
};

const QUIZ_QUESTIONS = [
  {
    id: "q1",
    prompt: "In supervised learning, what does the model learn from?",
    options: [
      "Unlabeled data with no known outcomes",
      "Labeled data with known input-output pairs",
      "Random noise injected during training",
      "Only the model's own past predictions",
    ],
    correctIndex: 1,
  },
  {
    id: "q2",
    prompt: "What is the primary purpose of a loss function?",
    options: [
      "To visualize the dataset",
      "To measure how far predictions are from actual values",
      "To store the trained model on disk",
      "To split data into train/test sets",
    ],
    correctIndex: 1,
  },
  {
    id: "q3",
    prompt: "Which technique helps prevent a model from overfitting?",
    options: [
      "Increasing model complexity indefinitely",
      "Training on the test set directly",
      "Regularization",
      "Removing all validation data",
    ],
    correctIndex: 2,
  },
];

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function LiveDot({ className = "" }) {
  return (
    <span className={`relative flex h-2 w-2 ${className}`}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
    </span>
  );
}

function NavButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 sm:flex-none items-center justify-center sm:justify-start gap-2 rounded-lg px-3 py-2.5 sm:px-4 text-sm font-medium transition-colors ${
        active
          ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/40"
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Screen 1: AI Tutor chat (SSE-ready)
// ---------------------------------------------------------------------------

function TutorScreen() {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm your AI tutor. Ask me about any topic from your SkillsBuild track and I'll walk you through it.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isStreaming]);

  const streamTutorResponse = useCallback(async (userText) => {
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.replace(/^data:\s*/, "").trim();
          if (!trimmed) continue;
          if (trimmed === "[DONE]") continue;

          let token = trimmed;
          try {
            const parsed = JSON.parse(trimmed);
            token = parsed.token ?? "";
          } catch {
            // not JSON — treat the raw chunk as plain text
          }

          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + token } : m))
          );
        }
      }
    } catch (err) {
      // No backend wired up yet (or the stream failed) — simulate a
      // token-by-token reply so the UI is demonstrable end to end.
      const demoReply =
        "That's a solid question. Once /api/tutor is live, this response will stream in real time from the model instead of being simulated locally.";
      for (const word of demoReply.split(" ")) {
        await new Promise((r) => setTimeout(r, 35));
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: (m.content + " " + word).trim() } : m))
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", content: text }]);
    setInput("");
    streamTutorResponse(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-indigo-500 text-white rounded-br-sm"
                  : "bg-slate-800 text-slate-200 ring-1 ring-slate-700/60 rounded-bl-sm"
              }`}
            >
              {m.content || (
                <span className="flex items-center gap-1.5 text-slate-400">
                  <LiveDot />
                  <span className="text-xs">thinking…</span>
                </span>
              )}
            </div>
          </div>
        ))}
        {isStreaming && messages[messages.length - 1]?.content && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 px-2 text-xs text-slate-500">
              <LiveDot />
              streaming
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 bg-slate-950/60 p-3 sm:p-4">
        <div className="flex items-end gap-2 rounded-xl bg-slate-900 p-2 ring-1 ring-slate-800 focus-within:ring-indigo-500/60">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask your tutor anything…"
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
            aria-label="Send message"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 2: Quiz / Assessment
// ---------------------------------------------------------------------------

function QuizScreen() {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const question = QUIZ_QUESTIONS[index];
  const isLast = index === QUIZ_QUESTIONS.length - 1;

  const handleSelect = (optionIndex) => {
    if (selected !== null) return;
    setSelected(optionIndex);
    if (optionIndex === question.correctIndex) setScore((s) => s + 1);
  };

  const handleNext = () => {
    if (isLast) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
  };

  const handleRestart = () => {
    setIndex(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  };

  if (finished) {
    const pct = Math.round((score / QUIZ_QUESTIONS.length) * 100);
    return (
      <div className="flex h-full items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-8 text-center ring-1 ring-slate-800">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30">
            <span className="font-mono text-xl font-semibold text-cyan-300">{pct}%</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-100">Assessment complete</h3>
          <p className="mt-1 text-sm text-slate-400">
            You scored {score} out of {QUIZ_QUESTIONS.length}.
          </p>
          <button
            onClick={handleRestart}
            className="mt-6 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
          >
            Retake quiz
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs font-mono text-slate-500">
            <span>QUESTION {index + 1} / {QUIZ_QUESTIONS.length}</span>
            <span>SCORE {score}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-500"
              style={{ width: `${((index + (selected !== null ? 1 : 0)) / QUIZ_QUESTIONS.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900 p-5 sm:p-6 ring-1 ring-slate-800">
          <h3 className="mb-5 text-base sm:text-lg font-medium leading-snug text-slate-100">
            {question.prompt}
          </h3>

          <div className="space-y-2.5">
            {question.options.map((option, i) => {
              const isSelected = selected === i;
              const isCorrect = i === question.correctIndex;
              const showState = selected !== null;

              let stateClasses = "border-slate-700 hover:border-slate-600 hover:bg-slate-800/60";
              if (showState && isCorrect) {
                stateClasses = "border-emerald-500/60 bg-emerald-500/10";
              } else if (showState && isSelected && !isCorrect) {
                stateClasses = "border-rose-500/60 bg-rose-500/10";
              } else if (showState) {
                stateClasses = "border-slate-800 opacity-50";
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={showState}
                  className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm text-slate-200 transition-colors ${stateClasses}`}
                >
                  <span>{option}</span>
                  {showState && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                  {showState && isSelected && !isCorrect && <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
                </button>
              );
            })}
          </div>

          {selected !== null && (
            <button
              onClick={handleNext}
              className="mt-6 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            >
              {isLast ? "Finish assessment" : "Next question"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen 3: Dashboard
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-4 sm:p-5 ring-1 ring-slate-800">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function StatusPill({ status }) {
  const passed = status === "passed";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        passed ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
      }`}
    >
      {passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {passed ? "Passed" : "Needs review"}
    </span>
  );
}

function DashboardScreen() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/dashboard");
        if (!res.ok) throw new Error("bad response");
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setData(FALLBACK_DASHBOARD);
          setIsFallback(true);
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 px-4 py-6 sm:px-6 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-900 ring-1 ring-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-6">
      {isFallback && (
        <div className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/20">
          Showing sample data — /api/dashboard isn't reachable yet.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={TrendingUp}
          label="Progress score"
          value={`${data.progressScore}%`}
          accent="bg-indigo-500/15 text-indigo-300"
        />
        <StatCard
          icon={BookOpen}
          label="Topics covered"
          value={data.topicsCovered}
          accent="bg-cyan-500/15 text-cyan-300"
        />
        <StatCard
          icon={Flame}
          label="Day streak"
          value={data.streakDays}
          accent="bg-amber-500/15 text-amber-300"
        />
      </div>

      <div className="mt-6 rounded-2xl bg-slate-900 ring-1 ring-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-medium text-slate-200">Session history</h3>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" />
            Live
          </div>
        </div>

        {data.history.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">No sessions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="px-4 py-2.5 font-medium sm:px-5">Topic</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Score</th>
                  <th className="px-4 py-2.5 font-medium sm:px-5">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => (
                  <tr key={row.id} className="border-t border-slate-800/80">
                    <td className="px-4 py-3 text-slate-200 sm:px-5">{row.topic}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-400">{row.date}</td>
                    <td className="px-4 py-3 font-mono text-slate-300">{row.score}%</td>
                    <td className="px-4 py-3 sm:px-5">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root shell
// ---------------------------------------------------------------------------

const TABS = [
  { key: "tutor", label: "AI Tutor", icon: MessageSquare },
  { key: "quiz", label: "Quiz", icon: ListChecks },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export default function SkillsBuildApp() {
  const [tab, setTab] = useState("tutor");

  return (
    <div className="flex h-screen w-full flex-col bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500">
            <span className="font-mono text-xs font-bold text-white">SB</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-100">SkillsBuild Console</span>
        </div>
        <div className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
          <LiveDot />
          Connected
        </div>
      </header>

      <nav className="flex shrink-0 gap-1 border-b border-slate-800 bg-slate-950/80 px-2 py-2 sm:px-6">
        {TABS.map((t) => (
          <NavButton key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} icon={t.icon} label={t.label} />
        ))}
      </nav>

      <main className="min-h-0 flex-1">
        {tab === "tutor" && <TutorScreen />}
        {tab === "quiz" && <QuizScreen />}
        {tab === "dashboard" && <DashboardScreen />}
      </main>
    </div>
  );
}