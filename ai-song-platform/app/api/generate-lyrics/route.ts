import { NextRequest, NextResponse } from "next/server";
import { generateLyrics } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { topic, mood, genre, language, style } = body;

    if (!topic || !mood || !genre || !language) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const lyrics = await generateLyrics({ topic, mood, genre, language, style });
    return NextResponse.json({ lyrics });
  } catch (err) {
    console.error("Lyrics generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate lyrics" },
      { status: 500 }
    );
  }
}
