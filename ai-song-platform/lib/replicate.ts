import Replicate from "replicate";

export const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export interface MusicRequest {
  prompt: string;
  genre: string;
  mood: string;
  duration?: number;
}

export async function generateMusic(req: MusicRequest): Promise<string> {
  const musicPrompt = `${req.genre} music, ${req.mood} mood, ${req.prompt}, instrumental, high quality`;

  const output = await replicate.run(
    "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
    {
      input: {
        prompt: musicPrompt,
        model_version: "stereo-large",
        output_format: "mp3",
        normalization_strategy: "peak",
        duration: req.duration ?? 30,
      },
    }
  );

  // Replicate returns a URL string for audio
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  throw new Error("Unexpected Replicate output format");
}
