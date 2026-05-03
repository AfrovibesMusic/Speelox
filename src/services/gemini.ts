import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generatePostContent(title: string, description: string = "") {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Create short, punchy social media post ideas based on this content:
      Title: ${title}
      Description: ${description}
      
      I need 3 things:
      1. A "headline" for the first image (max 10 words).
      2. A "caption" for the post body/comment section.
      3. A "description" for a SECOND slide. This should be a concise summary or a list of key points from the original content (max 50 words).
      
      The headline should be max 10 words.
      The caption should be engaging and include relevant hashtags.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING, description: "Short headline for the image" },
            caption: { type: Type.STRING, description: "Engaging caption for the post" },
            description: { type: Type.STRING, description: "Concise summary for the second slide" },
          },
          required: ["headline", "caption", "description"],
        },
      },
    });

    const result = JSON.parse(response.text);
    return result as { headline: string; caption: string; description: string };
  } catch (error) {
    console.error("Gemini generation error:", error);
    return {
      headline: title.slice(0, 50),
      caption: `${title}\n\nRead more at the link! #socialmedia #content`,
      description: description.slice(0, 200),
    };
  }
}

/**
 * Recreates an image using AI to get better quality and professional styling.
 * It first analyzes the existing image and then generates a new one based on that analysis.
 */
export async function enhanceImageWithAI(currentImageUrl: string, headline: string) {
  try {
    // 1. Analyze the current image to create a high-fidelity generation prompt
    // We use a stronger model for analysis if possible, but 3-flash is good for vision
    let analysisPrompt = `Analyze this image and the headline "${headline}". 
    Create a highly detailed, professional prompt for an AI image generator to REPLICATE this scene with significantly higher fidelity, clarity and professional production quality.
    The goal is "Maximum Visual Fidelity": 
    - Describe the subject's posture, expression, and features with surgical precision.
    - Specify professional studio lighting or cinematic natural lighting.
    - Include tactile texture details (e.g., sharp fabric weave, realistic skin texture, crisp metallic reflections).
    - Define precise photographic specs (e.g., shot on 85mm lens, f/1.8, razor-sharp focus, shallow depth of field).
    - Mention high dynamic range and professional color grading.
    Ensure the new image will be an UPGRADED version of this one, not a different concept.
    Return ONLY the prompt string, no other text.`;

    // Fetch the image and convert to base64 for vision analysis
    const imageResponse = await fetch(`https://images.weserv.nl/?url=${encodeURIComponent(currentImageUrl)}&output=webp`);
    const blob = await imageResponse.blob();
    const base64Data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });

    const analysisResult = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/webp"
          }
        },
        { text: analysisPrompt }
      ],
    });

    const enhancedPrompt = analysisResult.text?.trim() || `Ultra-high resolution professional photography of ${headline}, cinematic lighting, 8k, realistic textures, sharp focus`;

    // 2. Generate the new image using the high-quality model
    const generationResult = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [
        { text: enhancedPrompt }
      ],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "2K", // Requesting higher resolution for "better pixels"
        }
      }
    });

    // Find the image part in the response
    for (const part of generationResult.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data returned from Gemini");
  } catch (error) {
    console.error("Image enhancement error:", error);
    throw error;
  }
}
