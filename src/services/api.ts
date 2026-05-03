import { ExtractionResult } from "../types";

export async function extractContent(url: string, type?: string): Promise<ExtractionResult> {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to extract content");
  }

  return response.json();
}
