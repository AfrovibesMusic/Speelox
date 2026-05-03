import { GoogleGenAI } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = (process as any).env?.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function findImageForPost(title: string): Promise<string | null> {
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Find a high-quality, direct featured image URL for the following article title: "${title}". 
      Return ONLY the absolute URL of a relevant image from a reliable source like Unsplash, Pexels, or a major news site. 
      If you cannot find a specific one, provide a high-quality Unsplash source URL that represents the topic best.
      Example: https://images.unsplash.com/photo-12345678..`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text?.trim();
    if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
      // Basic validation to extract just the URL if there's extra text
      const match = text.match(/https?:\/\/[^\s]+/);
      return match ? match[0] : null;
    }
    return null;
  } catch (error) {
    console.error("Gemini image search error:", error);
    return null;
  }
}
