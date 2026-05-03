export async function generatePostContent(title: string, description: string = "") {
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Generation failed");
    }

    return response.json() as Promise<{ headline: string; caption: string; description: string }>;
  } catch (error) {
    console.error("Gemini generation error:", error);
    return {
      headline: title.slice(0, 50),
      caption: `${title}\n\nRead more at the link! #socialmedia #content`,
      description: description.slice(0, 200),
    };
  }
}

export async function enhanceImageWithAI(imageUrl: string, headline: string) {
  try {
    const response = await fetch("/api/enhance-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, headline }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Enhancement failed");
    }

    const { imageUrl: enhancedUrl } = await response.json();
    return enhancedUrl as string;
  } catch (error) {
    console.error("Image enhancement error:", error);
    throw error;
  }
}
