import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

const CF_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function getDeepSummary(text, headline) {
  let cleanText = stripHtml(text);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  
  // 🚀 SLICER: Keep input small to save your TPM quota
  const slicedText = words.slice(0, 1000).join(" ");
  const targetWords = Math.max(Math.floor(words.length / 3), 200);

  const prompt = `Provide a DETAILED UPSC study note. 
  Sections: 1. CONTEXT, 2. KEY FEATURES, 3. SIGNIFICANCE, 4. UPSC RELEVANCE.
  LENGTH: ~${targetWords} words. 
  ARTICLE: ${slicedText}`;

  // Provider Chain
  const providers = [
    { name: 'Groq', url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.1-8b-instant", key: GROQ_API_KEY },
    { name: 'Cloudflare', url: `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`, key: CF_API_TOKEN }
  ];

  for (const p of providers) {
    if (!p.key) continue;
    try {
      const isGroq = p.name === 'Groq';
      const body = isGroq 
        ? { model: p.model, messages: [{ role: "user", content: prompt }], max_tokens: 1000 }
        : { prompt, max_tokens: 1000 };

      const res = await axios.post(p.url, body, {
        headers: { Authorization: `Bearer ${p.key}` },
        timeout: 40000
      });

      const output = isGroq ? res.data.choices[0].message.content : res.data.result.response;
      if (output && output.length > 200) return output;

    } catch (e) {
      console.warn(`⚠️ ${p.name} failed (${e.response?.status || 'Timeout'}).`);
      if (e.response?.status === 429) await new Promise(r => setTimeout(r, 30000));
    }
  }
  return null;
}

async function runSummarizer() {
  console.log("🤖 Starting Stable Single-Runner Pipeline...");
  const startTime = Date.now();
  const MAX_RUNTIME = 330 * 60 * 1000; // 5.5 hours

  // Get all files and process from newest to oldest
  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith(".json")).sort().reverse();

  for (const file of allFiles) {
    if (Date.now() - startTime > MAX_RUNTIME) break;

    const filePath = path.join(dataDir, file);
    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      if (!item.fullText && item.summaryText) item.fullText = item.summaryText;

      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 350);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        // Noise Filter
        const noise = ["condoles", "grief", "tribute", "congratulates", "greets", "warm wishes"];
        if (noise.some(word => item.headline?.toLowerCase().includes(word))) {
          item.summaryText = stripHtml(item.fullText).substring(0, 400) + "...";
          modified = true;
          continue;
        }

        console.log(`Summarizing: ${item.headline?.substring(0, 40)}...`);
        const summary = await getDeepSummary(item.fullText, item.headline || "");
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          // 🚀 STABLE DELAY: 15 seconds to ensure you never hit a rate limit
          await new Promise(r => setTimeout(r, 15000)); 
        }
      }
    }
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Progress Saved: ${file}`);
    }
  }
}
runSummarizer();
