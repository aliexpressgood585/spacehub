export interface Song {
  id: string;
  title: string;
  topic: string;
  mood: string;
  genre: string;
  language: string;
  lyrics: string;
  audio_url: string | null;
  created_at: string;
  user_id: string | null;
}

export interface CreateSongPayload {
  topic: string;
  mood: string;
  genre: string;
  language: string;
  style?: string;
}

export type GenerationStatus =
  | "idle"
  | "generating-lyrics"
  | "generating-music"
  | "done"
  | "error";

export const GENRES = [
  "Pop",
  "Rock",
  "Hip-Hop",
  "R&B",
  "Jazz",
  "Classical",
  "Electronic",
  "Country",
  "Folk",
  "Reggae",
  "Blues",
  "Metal",
] as const;

export const MOODS = [
  "Happy",
  "Sad",
  "Energetic",
  "Calm",
  "Romantic",
  "Angry",
  "Nostalgic",
  "Hopeful",
  "Melancholic",
  "Playful",
] as const;

export const LANGUAGES = [
  { value: "hebrew", label: "עברית" },
  { value: "english", label: "English" },
  { value: "spanish", label: "Español" },
  { value: "french", label: "Français" },
  { value: "arabic", label: "عربية" },
] as const;
