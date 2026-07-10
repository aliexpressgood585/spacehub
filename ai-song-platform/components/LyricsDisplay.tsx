"use client";

interface LyricsDisplayProps {
  lyrics: string;
}

export default function LyricsDisplay({ lyrics }: LyricsDisplayProps) {
  const copy = () => navigator.clipboard.writeText(lyrics);

  const lines = lyrics.split("\n");

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">
          מילות שיר
        </h3>
        <button
          onClick={copy}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          העתק
        </button>
      </div>
      <div className="space-y-1 text-sm leading-relaxed" dir="auto">
        {lines.map((line, i) => {
          const isSection = line.startsWith("[") && line.endsWith("]");
          return (
            <p
              key={i}
              className={
                isSection
                  ? "text-purple-400 font-semibold mt-3 text-xs uppercase tracking-wider"
                  : line === ""
                    ? "h-2"
                    : "text-white/80"
              }
            >
              {line || " "}
            </p>
          );
        })}
      </div>
    </div>
  );
}
