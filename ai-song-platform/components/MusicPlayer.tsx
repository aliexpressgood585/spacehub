"use client";

import { useRef, useState, useEffect } from "react";

interface MusicPlayerProps {
  audioUrl: string;
  title: string;
}

export default function MusicPlayer({ audioUrl, title }: MusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onDuration = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Number(e.target.value);
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <p className="text-sm text-white/60 truncate">{title}</p>
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center transition-colors"
        >
          {playing ? (
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={progress}
          onChange={seek}
          className="flex-1 accent-purple-500"
        />
        <span className="text-xs text-white/50 w-16 text-right">
          {fmt(progress)} / {fmt(duration)}
        </span>
      </div>
      <a
        href={audioUrl}
        download
        className="block text-center text-xs text-purple-400 hover:text-purple-300 transition-colors"
      >
        ⬇ הורד MP3
      </a>
    </div>
  );
}
