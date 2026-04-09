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

const batchIndex = parseInt(process.argv[2]) || 0;
const totalBatches = parseInt(process.argv[3]) || 1;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function getDeepSummary(text, headline) {
  let cleanText = stripHtml(text);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  
  // 🚀 FIX 413: Aggressive slicing to prevent "Payload Too Large"
  const slicedText = words.slice(0, 1500).join(" ");
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
        ? { model: p.model, messages: [{ role: "user", content: prompt }], max_tokens: 1500 }
        : { prompt, max_tokens: 1500 };

      const res = await axios.post(p.url, body, {
        headers: { Authorization: `Bearer ${p.key}` },
        timeout: 45000
      });

      const output = isGroq ? res.data.choices[0].message.content : res.data.result.response;
      if (output && output.length > 200) return output;

    } catch (e) {
      const status = e.response?.status;
      console.warn(`⚠️ ${p.name} failed (${status}).`);
      
      // 🚀 FIX 429: If rate limited, wait 30 seconds before trying next provider
      if (status === 429) {
        console.log("🛑 Rate limit hit. Cooling down for 30s...");
        await new Promise(r => setTimeout(r, 30000));
      }
    }
  }
  return null;
}

async function runSummarizer() {
  // 🚀 FIX COLLISION: Staggered start based on batch index
  const jitter = batchIndex * 15000; 
  console.log(`🤖 Batch ${batchIndex + 1} waiting ${jitter/1000}s to stagger...`);
  await new Promise(r => setTimeout(r, jitter));

  const startTime = Date.now();
  const MAX_RUNTIME = 320 * 60 * 1000;

  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith(".json")).sort();
  const myFiles = allFiles.filter((_, i) => i % totalBatches === batchIndex).reverse();

  for (const file of myFiles) {
    if (Date.now() - startTime > MAX_RUNTIME) break;

    const filePath = path.join(dataDir, file);
    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      if (!item.fullText && item.summaryText) item.fullText = item.summaryText;

      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 350);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        // Solution 3: Noise Filtering
        const noise = ["condoles", "grief", "tribute", "congratulates", "greets", "warm wishes"];
        if (noise.some(word => item.headline?.toLowerCase().includes(word))) {
          item.summaryText = stripHtml(item.fullText).substring(0, 400) + "...";
          modified = true;
          continue;
        }

        console.log(`Deep Summarizing: ${item.headline?.substring(0, 40)}...`);
        const summary = await getDeepSummary(item.fullText, item.headline || "");
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          // 🚀 GLOBAL THROTTLE: 12s delay to accommodate 5 parallel runners
          await new Promise(r => setTimeout(r, 12000)); 
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
