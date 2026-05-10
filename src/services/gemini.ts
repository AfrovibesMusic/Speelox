
export async function generatePostContent(title: string, description: string = "") {
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      if (errorData.fallback) return errorData.fallback;
      throw new Error(errorData.error || 'Generation failed');
    }

    return await response.json();
  } catch (error) {
    console.error("Gemini generation error:", error);
    return {
      headline: title.slice(0, 50),
      caption: `${title}\n\nRead more at the link! #socialmedia #content`,
      description: description.slice(0, 200),
    };
  }
}

export async function enhanceImageWithAI(currentImageUrl: string, headline: string) {
  try {
     const response = await fetch('/api/enhance-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentImageUrl, headline })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Enhancement failed');
    }

    const { imageUrl } = await response.json();
    return imageUrl;
  } catch (error) {
    console.error("Image enhancement error:", error);
    throw error;
  }
}
