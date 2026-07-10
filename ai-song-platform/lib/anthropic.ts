import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface LyricsRequest {
  topic: string;
  mood: string;
  genre: string;
  language: string;
  style?: string;
}

export async function generateLyrics(req: LyricsRequest): Promise<string> {
  const langInstruction =
    req.language === "hebrew"
      ? "כתוב את השיר בעברית."
      : req.language === "english"
        ? "Write the song in English."
        : `Write the song in ${req.language}.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are a professional songwriter. Create song lyrics with the following details:

Topic: ${req.topic}
Mood: ${req.mood}
Genre: ${req.genre}
${req.style ? `Style notes: ${req.style}` : ""}

${langInstruction}

Structure the song with:
- [Verse 1]
- [Chorus]
- [Verse 2]
- [Chorus]
- [Bridge]
- [Chorus]

Write only the lyrics with section labels. No explanations or commentary.`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return content.text;
}
