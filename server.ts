import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: "10mb" }));

  // API Routes
  app.post("/api/analyze-script", async (req, res) => {
    try {
      const { script } = req.body;
      if (!script) {
        return res.status(400).json({ error: "Script is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Gemini API key is not configured serverside." });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
Analyze the following story script. 
1. Identify the 'Narrator' text.
2. Identify all other characters.
3. Separate the script into dialogues sequentially.
4. Output strict JSON with:
{
  "characters": [{ "name": "...", "description": "..." }],
  "dialogues": [{ "characterName": "...", "text": "...", "emotion": "one of [Happy, Sad, Angry, Fear, Calm, Excited, Neutral]" }]
}

Script:
"""
${script}
"""
Wait, wrap the response in a JSON code block.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        }
      });

      const text = response.text;
      if (!text) {
        return res.status(500).json({ error: "Failed to generate AI response" });
      }
      res.json(JSON.parse(text));
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "An error occurred during script analysis." });
    }
  });

  app.post("/api/generate-voice", async (req, res) => {
    try {
      const { text, voiceId, emotion } = req.body;
      if (!text || !voiceId) {
        return res.status(400).json({ error: "text and voiceId are required" });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "ElevenLabs API Key not configured" });
      }

      // We'll call the actual ElevenLabs API in this endpoint
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs API error: ${errText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      res.set("Content-Type", "audio/mpeg");
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      console.error("Audio Gen Error:", error);
      res.status(500).json({ error: "An error occurred during voice generation." });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
