import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { GoogleGenAI, Type } from "@google/genai";
import { fileURLToPath } from "url";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: true }],
      ['media:thumbnail', 'media:thumbnail'],
      ['media:group', 'media:group'],
    ],
  }
});

function extractImageFromRSS(item: any, sourceUrl: string) {
  // 1. Try enclosure (Standard RSS 2.0)
  if (item.enclosure && item.enclosure.url && item.enclosure.type?.startsWith('image/')) {
    return item.enclosure.url;
  }

  // 2. Try Media Namespace (media:content, media:thumbnail)
  const extractFromMedia = (media: any) => {
    if (!media) return null;
    if (Array.isArray(media)) {
      const found = media.find((m: any) => m.$?.type?.startsWith('image/') || m.$?.medium === 'image' || !m.$?.type);
      return found ? found.$?.url : null;
    }
    return media.$?.url || null;
  };

  let image = extractFromMedia(item['media:content']) || extractFromMedia(item['media:thumbnail']);
  if (image) return image;

  // 3. Try media:group
  if (item['media:group']) {
    image = extractFromMedia(item['media:group']['media:content']) || extractFromMedia(item['media:group']['media:thumbnail']);
    if (image) return image;
  }

  // 4. Try iTunes Image (Podcasts)
  if (item.itunes && item.itunes.image) {
    return item.itunes.image;
  }

  // 5. Try parsing HTML fields (content:encoded, content, description)
  const possibleHtmlFields = ['content:encoded', 'content', 'contentSnippet', 'description', 'summary'];
  for (const field of possibleHtmlFields) {
    const html = item[field];
    if (html && typeof html === 'string' && (html.includes('<img') || html.includes('&lt;img'))) {
      try {
        // Flatten escaped HTML if necessary
        const cleanHtml = html.includes('&lt;img') ? html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : html;
        const $ = cheerio.load(cleanHtml);
        let img = $('img').first().attr('src');
        if (img) {
          // Filter out small tracker pixels or relative paths
          if (!img.startsWith('http')) {
            try {
              const baseUrl = new URL(item.link || sourceUrl);
              img = new URL(img, baseUrl.origin).href;
            } catch (e) {}
          }
          // Basic check to skip tiny icons/trackers (optional but usually helpful)
          return img;
        }
      } catch (e) {}
    }
  }

  return null;
}

export async function createServer() {
  const app = express();
  
  app.use(express.json());

  app.get("/api/health", (req, res) => res.json({ 
    status: "ok", 
    path: req.path, 
    url: req.url,
    env: process.env.NODE_ENV,
    isNetlify: !!process.env.NETLIFY,
    hasApiKey: !!process.env.GEMINI_API_KEY
  }));

  app.post("/api/generate", async (req, res) => {
    const { title, description } = req.body;
    try {
      const model = ai.getGenerativeModel({ model: "gemini-3-flash-preview" });
      const prompt = `Create short, punchy social media post ideas based on this content:
      Title: ${title}
      Description: ${description}
      
      I need 3 things:
      1. A "headline" for the first image (max 10 words).
      2. A "caption" for the post body/comment section.
      3. A "description" for a SECOND slide. This should be a concise summary or a list of key points from the original content (max 50 words).
      
      The headline should be max 10 words.
      The caption should be engaging and include relevant hashtags.`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              caption: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["headline", "caption", "description"],
          },
        },
      });

      res.json(JSON.parse(result.response.text()));
    } catch (e: any) {
      console.error("Gemini generation error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/enhance-image", async (req, res) => {
    const { imageUrl, headline } = req.body;
    try {
      // 1. Analyze the current image
      const analysisModel = ai.getGenerativeModel({ model: "gemini-3-flash-preview" });
      
      // Fetch the image
      const imageResponse = await axios.get(`https://images.weserv.nl/?url=${encodeURIComponent(imageUrl)}&output=webp`, {
        responseType: 'arraybuffer'
      });
      const base64Data = Buffer.from(imageResponse.data).toString('base64');

      const analysisPrompt = `Analyze this image and the headline "${headline}". 
      Create a highly detailed, professional prompt for an AI image generator to REPLICATE this scene with significantly higher fidelity, clarity and professional production quality.
      Return ONLY the prompt string, no other text.`;

      const analysisResult = await analysisModel.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: "image/webp"
          }
        },
        { text: analysisPrompt }
      ]);

      const enhancedPrompt = analysisResult.response.text().trim();

      // 2. Generate the new image
      const generationModel = ai.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" });
      const generationResult = await generationModel.generateContent({
        contents: [{ role: "user", parts: [{ text: enhancedPrompt }] }],
        generationConfig: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "2K",
          } as any // Use as any if types aren't fully synchronized
        }
      } as any);

      // Find the image part
      for (const part of generationResult.response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return res.json({ imageUrl: `data:image/png;base64,${part.inlineData.data}` });
        }
      }

      throw new Error("No image data returned from Gemini");
    } catch (e: any) {
      console.error("Image enhancement error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send("No URL");
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
      const contentType = response.headers['content-type'];
      if (contentType) res.set('Content-Type', String(contentType));
      res.set('Cache-Control', 'public, max-age=31536000');
      res.send(response.data);
    } catch (e) {
      res.status(500).send("Proxy failed");
    }
  });

  // API Route to fetch and parse content
  app.post("/api/extract", async (req, res) => {
    const { url, type } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    try {
      // 1. Explicit RSS Mode
      if (type === 'rss') {
        const feed = await parser.parseURL(url);
        const today = new Date().toDateString();
        
        const filteredItems = feed.items
          .filter(item => {
            if (!item.pubDate) return false;
            return new Date(item.pubDate).toDateString() === today;
          });

        const items = await Promise.all(filteredItems.map(async item => {
          let image = extractImageFromRSS(item, url);
          
          if (!image && item.link) {
            try {
              const { data } = await axios.get(item.link, { timeout: 2000, headers: { 'User-Agent': 'Mozilla/5.0' } });
              const $ = cheerio.load(data);
              image = $('meta[property="og:image"]').attr('content') || 
                      $('meta[name="twitter:image"]').attr('content') ||
                      $('link[rel="image_src"]').attr('href');
              
              if (image && !image.startsWith('http')) {
                 const baseUrl = new URL(item.link);
                 image = new URL(image, baseUrl.origin).href;
              }
            } catch (e) {}
          }

          return {
            title: item.title,
            content: item.contentSnippet || item.content,
            link: item.link,
            pubDate: item.pubDate,
            image: image || null
          };
        }));

        return res.json({ type: 'rss', title: feed.title, items });
      }

      const isInstagram = url.includes('instagram.com') || url.includes('instagr.am');
      
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': isInstagram 
            ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 10000
      });
      const $ = cheerio.load(html);

      // 2. Explicit Link Mode (Single Article)
      if (type === 'link') {
        const title = $('meta[property="og:title"]').attr('content') || $('meta[name="og:title"]').attr('content') || $('title').text();
        const description = $('meta[property="og:description"]').attr('content') || $('meta[name="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
        
        let image = 
          $('meta[property="og:image:secure_url"]').attr('content') ||
          $('meta[property="og:image"]').attr('content') || 
          $('meta[name="og:image"]').attr('content') ||
          $('meta[name="twitter:image:src"]').attr('content') ||
          $('meta[name="twitter:image"]').attr('content') ||
          $('meta[itemprop="image"]').attr('content') ||
          $('link[rel="image_src"]').attr('href');

        if (!image) {
          const articleImages = $('article img, main img, .entry-content img, .post-content img');
          if (articleImages.length > 0) image = $(articleImages[0]).attr('src');
        }
        
        let absImage = image;
        if (absImage && !absImage.startsWith('http')) {
          try { absImage = new URL(absImage, url).href; } catch(e) {}
        }

        const items = [{ title, content: description, image: absImage || null, link: url, pubDate: new Date().toISOString() }];
        
        return res.json({
          type: 'link',
          title: $('title').text() || 'Web Content',
          description: description,
          image: absImage || null,
          url: url,
          items: items 
        });
      }

      // Default Logic: Try to find article-like elements (fallback for unspecified type)
      let items: any[] = [];
      let discoveredItems: any[] = [];
      const selectors = ['article', '.post', '.entry', '.item', '.media-block', '.story-preview'];
      
      selectors.forEach(sel => {
        if (discoveredItems.length > 5) return;
        $(sel).each((_, el) => {
          const $el = $(el);
          const a = $el.find('a').first();
          const h = $el.find('h1, h2, h3, h4, h5').first();
          const link = a.attr('href') || h.find('a').attr('href');
          const title = h.text().trim() || a.text().trim();
          
          if (link && title && title.length > 10) {
            let absLink = link;
            try { absLink = new URL(link, url).href; } catch(e) {}
            discoveredItems.push({ title, link: absLink, content: $el.find('p').first().text().trim() });
          }
        });
      });

      items = Array.from(new Map(discoveredItems.map(i => [i.link, i])).values()).slice(0, 5);

      if (items.length === 0) {
        // ... (Same single article extraction logic as above)
        const title = $('meta[property="og:title"]').attr('content') || $('title').text();
        const description = $('meta[property="og:description"]').attr('content') || '';
        const image = $('meta[property="og:image"]').attr('content');
        let absImage = image;
        if (absImage && !absImage.startsWith('http')) {
          try { absImage = new URL(absImage, url).href; } catch(e) {}
        }
        items = [{ title, content: description, image: absImage || null, link: url }];
      } else {
        // Deep scrape images
        items = await Promise.all(items.map(async item => {
          try {
            const res = await axios.get(item.link, { timeout: 3000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const $post = cheerio.load(res.data);
            let img = $post('meta[property="og:image"]').attr('content') || $post('article img').first().attr('src');
            if (img && !img.startsWith('http')) try { img = new URL(img, item.link).href; } catch(e) {}
            return { ...item, image: img || null, pubDate: new Date().toISOString() };
          } catch (e) {
            return { ...item, image: null, pubDate: new Date().toISOString() };
          }
        }));
      }
      
      return res.json({ type: 'web', title: $('title').text() || 'Web Content', items });

    } catch (error: any) {
      console.error("Extraction error:", error.message);
      res.status(500).json({ error: "Failed to extract content from the provided link." });
    }
  });

  return app;
}

async function startServer() {
  const app = await createServer();
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      // Catch-all for dev to prevent MIME errors on missing assets
      app.get('*', (req, res, next) => {
        if (req.path.includes('.') && !req.path.endsWith('.html')) {
          return res.status(404).send('Not found');
        }
        next();
      });
    } catch (e) {
      console.warn("Vite not found, skipping middleware");
    }
  } else if (!process.env.NETLIFY && !process.env.LAMBDA_TASK_ROOT) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (req, res) => {
      // Avoid MIME type errors by not serving index.html for file-like requests that were not found
      if (req.path.includes('.') && !req.path.endsWith('.html')) {
        return res.status(404).send('Not found');
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

// Only start the server if this file is run directly
const isMain = process.argv[1] && (
  process.argv[1].endsWith('server.ts') || 
  process.argv[1].endsWith('server.js') ||
  process.argv[1].includes('tsx')
);

if (isMain && !process.env.NETLIFY && !process.env.LAMBDA_TASK_ROOT) {
  startServer();
}
