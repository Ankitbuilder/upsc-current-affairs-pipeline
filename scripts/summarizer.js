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
  const targetWords = Math.max(Math.floor(words.length / 2), 250);

  const noise = ["condoles", "grief", "tribute", "congratulates", "greets", "warm wishes", "passed away"];
  if (noise.some(word => headline.toLowerCase().includes(word))) {
    return cleanText.substring(0, 500) + "... (News Summary)";
  }

  const prompt = `Provide a COMPREHENSIVE UPSC study note for this PIB article. 
  Sections: 1. CONTEXT, 2. KEY FEATURES, 3. SIGNIFICANCE, 4. UPSC RELEVANCE.
  LENGTH: At least ${targetWords} words. 
  ARTICLE: ${cleanText}`;

  // --- Provider 1: GROQ (Primary) ---
  if (GROQ_API_KEY && GROQ_API_KEY.length > 10) {
    try {
      const groqRes = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
        // Updated to the most stable latest model
        model: "llama-3.1-8b-instant", 
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000,
        temperature: 0.5
      }, { 
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, 
        timeout: 30000 
      });
      
      const res = groqRes.data.choices[0].message.content;
      if (res && res.length > 200) return res;
    } catch (e) {
      const code = e.response?.status;
      console.warn(`⚠️ Groq failed (${code || 'Timeout'}). Trying Cloudflare...`);
      if (code === 401) console.error("🛑 CRITICAL: Groq API Key is Invalid.");
    }
  }

  // --- Provider 2: Cloudflare (Secondary) ---
  const CF_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;
  try {
    const cfRes = await axios.post(CF_URL, { prompt, max_tokens: 1800 }, 
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` }, timeout: 60000 });
    return cfRes.data.result.response;
  } catch (e) {
    console.error(`❌ Cloudflare Error: ${e.response?.status || 'Timeout'}`);
    return null; 
  }
}

async function runSummarizer() {
  console.log(`🤖 Batch ${batchIndex + 1}/${totalBatches} active.`);
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
      if (!item.fullText && item.summaryText) {
        item.fullText = item.summaryText;
        modified = true;
      }

      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 350);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        console.log(`Deep Summarizing: ${item.headline?.substring(0, 40)}...`);
        const summary = await getDeepSummary(item.fullText, item.headline || "");
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          // Cooldown to avoid 429 errors
          await new Promise(r => setTimeout(r, 3000)); 
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
