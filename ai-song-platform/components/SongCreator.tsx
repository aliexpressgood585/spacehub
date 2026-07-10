"use client";

import { useState } from "react";
import { GENRES, MOODS, LANGUAGES, type GenerationStatus } from "@/lib/types";
import LyricsDisplay from "./LyricsDisplay";
import MusicPlayer from "./MusicPlayer";
import clsx from "clsx";

const steps = ["מילות שיר", "מוזיקה"];

export default function SongCreator() {
  const [topic, setTopic] = useState("");
  const [mood, setMood] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("hebrew");
  const [style, setStyle] = useState("");

  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [lyrics, setLyrics] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [error, setError] = useState("");

  const canSubmit = topic.trim() && mood && genre && status === "idle";

  const generate = async () => {
    if (!canSubmit) return;
    setError("");
    setLyrics("");
    setAudioUrl("");

    // Step 1: Lyrics
    setStatus("generating-lyrics");
    const lyricsRes = await fetch("/api/generate-lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, mood, genre, language, style }),
    });
    if (!lyricsRes.ok) {
      setError("שגיאה ביצירת מילות שיר. נסה שוב.");
      setStatus("error");
      return;
    }
    const { lyrics: newLyrics } = await lyricsRes.json();
    setLyrics(newLyrics);

    // Step 2: Music
    setStatus("generating-music");
    const musicRes = await fetch("/api/generate-music", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: topic, genre, mood, duration: 30 }),
    });
    if (!musicRes.ok) {
      setError("שגיאה ביצירת מוזיקה. נסה שוב.");
      setStatus("error");
      return;
    }
    const { audioUrl: url } = await musicRes.json();
    setAudioUrl(url);
    setStatus("done");
  };

  const reset = () => {
    setStatus("idle");
    setLyrics("");
    setAudioUrl("");
    setError("");
  };

  const currentStep =
    status === "generating-lyrics" ? 0 : status === "generating-music" ? 1 : -1;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Form */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-5">
        <h2 className="text-xl font-bold text-white">צור שיר חדש</h2>

        {/* Topic */}
        <div className="space-y-1.5">
          <label className="text-sm text-white/60">נושא השיר</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="לדוגמה: אהבה ראשונה, החיים בתל אביב..."
            dir="auto"
            disabled={status !== "idle"}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
        </div>

        {/* Mood */}
        <div className="space-y-1.5">
          <label className="text-sm text-white/60">מצב רוח</label>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => setMood(m)}
                disabled={status !== "idle"}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors disabled:opacity-50",
                  mood === m
                    ? "bg-purple-600 border-purple-500 text-white"
                    : "border-white/10 text-white/60 hover:border-white/30"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Genre */}
        <div className="space-y-1.5">
          <label className="text-sm text-white/60">ז&apos;אנר מוזיקלי</label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                disabled={status !== "idle"}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors disabled:opacity-50",
                  genre === g
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-white/10 text-white/60 hover:border-white/30"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="space-y-1.5">
          <label className="text-sm text-white/60">שפה</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={status !== "idle"}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value} className="bg-gray-900">
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Style notes (optional) */}
        <div className="space-y-1.5">
          <label className="text-sm text-white/60">
            הערות סגנון{" "}
            <span className="text-white/30">(אופציונלי)</span>
          </label>
          <input
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder="לדוגמה: בסגנון שלמה ארצי, עם ריף גיטרה..."
            dir="auto"
            disabled={status !== "idle"}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
        </div>

        {/* Submit */}
        <button
          onClick={status === "done" || status === "error" ? reset : generate}
          disabled={status !== "idle" && status !== "done" && status !== "error"}
          className={clsx(
            "w-full py-3 rounded-xl font-semibold text-sm transition-all",
            status === "done" || status === "error"
              ? "bg-white/10 text-white hover:bg-white/20"
              : "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-90 disabled:opacity-50"
          )}
        >
          {status === "done"
            ? "✨ צור שיר חדש"
            : status === "error"
              ? "נסה שוב"
              : status !== "idle"
                ? "יוצר..."
                : "🎵 צור שיר"}
        </button>
      </div>

      {/* Progress */}
      {(status === "generating-lyrics" || status === "generating-music") && (
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center gap-3">
              <div
                className={clsx(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                  i < currentStep
                    ? "bg-green-500 text-white"
                    : i === currentStep
                      ? "bg-purple-600 text-white animate-pulse"
                      : "bg-white/10 text-white/30"
                )}
              >
                {i < currentStep ? "✓" : i + 1}
              </div>
              <span
                className={clsx(
                  "text-sm",
                  i === currentStep ? "text-white" : "text-white/40"
                )}
              >
                {i === currentStep ? `יוצר ${step}...` : step}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {lyrics && <LyricsDisplay lyrics={lyrics} />}
      {audioUrl && (
        <MusicPlayer audioUrl={audioUrl} title={`${genre} • ${topic}`} />
      )}
    </div>
  );
}
