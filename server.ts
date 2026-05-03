import express from "express";
import path from "path";
import fs from "fs";
import axios from "axios";
import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { fileURLToPath } from "url";

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
  const apiRouter = express.Router();
  
  app.use(express.json());

  apiRouter.get("/health", (req, res) => res.json({ 
    status: "ok", 
    path: req.path, 
    url: req.url,
    env: process.env.NODE_ENV,
    isNetlify: !!process.env.NETLIFY,
    hasApiKey: !!process.env.GEMINI_API_KEY
  }));

  apiRouter.get("/proxy", async (req, res) => {
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
  apiRouter.post("/extract", async (req, res) => {
    const { url, type } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    // Set a baseline timeout for the entire operation
    const ABORT_TIMEOUT = 8000; // 8 seconds to stay safely under Netlify's 10s limit
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ABORT_TIMEOUT);

    try {
      console.log(`[Extract] Starting for URL: ${url}, type: ${type}`);
      // 1. Explicit RSS Mode
      if (type === 'rss') {
        const feed = await Promise.race([
          parser.parseURL(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error("RSS Feed Timeout")), 6000))
        ]) as any;
        
        const today = new Date().toDateString();
        
        // Only get the top 5 to keep it fast
        const limit = 5;
        const feedItems = feed.items.slice(0, 10); // Look at first 10
        
        const items = feedItems
          .filter(item => {
            if (!item.pubDate) return true; // Include if no date
            const itemDate = new Date(item.pubDate);
            // Include if from today or yesterday to be safe
            const diff = (Date.now() - itemDate.getTime()) / (1000 * 60 * 60 * 24);
            return diff <= 2;
          })
          .slice(0, limit)
          .map(item => ({
            title: item.title,
            content: item.contentSnippet || item.content,
            link: item.link,
            pubDate: item.pubDate,
            image: extractImageFromRSS(item, url) || null
          }));

        clearTimeout(timeoutId);
        return res.json({ type: 'rss', title: feed.title, items });
      }

      const isInstagram = url.includes('instagram.com') || url.includes('instagr.am');
      
      console.log(`[Extract] Fetching HTML...`);
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': isInstagram 
            ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.google.com/',
        },
        timeout: 4500, // 4.5 second timeout for main fetch
        signal: controller.signal,
        validateStatus: (status) => status < 500 // Handle 4xx as data, not crash
      });
      console.log(`[Extract] HTML fetched (Status: ${html ? 'Got Data' : 'No Data'})`);
      if (!html || typeof html !== 'string') {
        throw new Error("Empty or invalid response from site");
      }
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
        
        clearTimeout(timeoutId);
        return res.json({
          type: 'link',
          title: $('title').text() || 'Web Content',
          description: description,
          image: absImage || null,
          url: url,
          items: items 
        });
      }

      // Default Logic: Try to find article-like elements
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
            
            // Try to get internal image for this list item
            let listItemImage = $el.find('img').first().attr('src');
            if (listItemImage && !listItemImage.startsWith('http')) {
              try { listItemImage = new URL(listItemImage, url).href; } catch(e) {}
            }

            discoveredItems.push({ 
              title, 
              link: absLink, 
              content: $el.find('p').first().text().trim(),
              image: listItemImage || null
            });
          }
        });
      });

      let items = Array.from(new Map(discoveredItems.map(i => [i.link, i])).values()).slice(0, 5);

      if (items.length === 0) {
        const title = $('meta[property="og:title"]').attr('content') || $('title').text();
        const description = $('meta[property="og:description"]').attr('content') || '';
        const image = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
        let absImage = image;
        if (absImage && !absImage.startsWith('http')) {
          try { absImage = new URL(absImage, url).href; } catch(e) {}
        }
        items = [{ title, content: description, image: absImage || null, link: url, pubDate: new Date().toISOString() }];
      } else {
        // To prevent timeouts, we SKIP deep scraping for images if we already have some or if time is running out
        // Only deep scrape if we don't have images for items
        const needsImageCount = items.filter(i => !i.image).length;
        const timeRemaining = ABORT_TIMEOUT - (Date.now() - startTime);

        if (needsImageCount > 0 && timeRemaining > 3000) {
          items = await Promise.all(items.map(async item => {
            if (item.image) return { ...item, pubDate: new Date().toISOString() };
            try {
              // Shorter timeout for sub-requests
              const res = await axios.get(item.link, { timeout: 2000, headers: { 'User-Agent': 'Mozilla/5.0' } });
              const $post = cheerio.load(res.data);
              let img = $post('meta[property="og:image"]').attr('content') || $post('article img').first().attr('src');
              if (img && !img.startsWith('http')) try { img = new URL(img, item.link).href; } catch(e) {}
              return { ...item, image: img || null, pubDate: new Date().toISOString() };
            } catch (e) {
              return { ...item, image: null, pubDate: new Date().toISOString() };
            }
          }));
        } else {
           items = items.map(i => ({ ...i, pubDate: new Date().toISOString() }));
        }
      }
      
      clearTimeout(timeoutId);
      return res.json({ type: 'web', title: $('title').text() || 'Web Content', items });

    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(`[Extract Error] ${url}:`, error.message);
      
      // Categorize the error for the user
      let errorMessage = error.message;
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        errorMessage = "The request timed out. The site might be slow or blocking our server.";
      } else if (error.response) {
        errorMessage = `The site returned an error (${error.response.status}).`;
      }
      
      res.status(500).json({ 
        error: `Failed to extract content: ${errorMessage}`,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined 
      });
    }
  });

  app.use("/api", apiRouter);
  
  if (process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT) {
    app.use("/", apiRouter);
  }

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
    const distPath = path.resolve(__dirname, "dist");
    console.log(`Serving static files from: ${distPath}`);
    
    app.use(express.static(distPath, { index: false }));
    
    app.get('*', (req, res) => {
      // Avoid MIME type errors by not serving index.html for file-like requests that were not found
      if (req.path.includes('.') && !req.path.endsWith('.html')) {
        console.warn(`Asset not found: ${req.path}`);
        return res.status(404).type('text/plain').send('Not found');
      }
      
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).type('text/plain').send('App not built yet');
      }
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
