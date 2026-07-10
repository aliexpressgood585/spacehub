import { NextRequest, NextResponse } from "next/server";
import { generateMusic } from "@/lib/replicate";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, genre, mood, duration } = body;

    if (!prompt || !genre || !mood) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const audioUrl = await generateMusic({ prompt, genre, mood, duration });
    return NextResponse.json({ audioUrl });
  } catch (err) {
    console.error("Music generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate music" },
      { status: 500 }
    );
  }
}
