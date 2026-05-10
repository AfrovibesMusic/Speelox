
export async function findImageForPost(title: string): Promise<string | null> {
  try {
    const response = await fetch('/api/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    
    if (!response.ok) {
      throw new Error('Image search failed');
    }

    const { imageUrl } = await response.json();
    return imageUrl;
  } catch (error) {
    console.error("Gemini image search error:", error);
    return null;
  }
}
