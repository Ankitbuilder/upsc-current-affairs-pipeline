import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

// Credentials
const CF_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Matrix Batching Logic (Solution 1)
const batchIndex = parseInt(process.argv[2]) || 0;
const totalBatches = parseInt(process.argv[3]) || 1;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

/**
 * Multi-Provider Fallback (Solution 2)
 */
async function getDeepSummary(text, headline) {
  let cleanText = stripHtml(text);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  const targetWords = Math.max(Math.floor(words.length / 2), 250);

  // 1. Solution 3: Noise Filtering (Skip AI for greetings/condolences)
  const noise = ["condoles", "grief", "tribute", "congratulates", "greets", "warm wishes", "passed away"];
  if (noise.some(word => headline.toLowerCase().includes(word))) {
    console.log(`⏩ Noise Filter: ${headline.substring(0, 30)}...`);
    return cleanText.substring(0, 500) + "... (Press Release Summary)";
  }

  const prompt = `[INST] Provide a COMPREHENSIVE UPSC study note. 
  Sections: 1. CONTEXT, 2. KEY FEATURES, 3. SIGNIFICANCE, 4. UPSC RELEVANCE.
  LENGTH: Minimum ${targetWords} words. STRICT: Start with CONTEXT.
  ARTICLE: ${cleanText} [/INST]`;

  // --- Provider 1: GROQ (Primary - High Speed/Large Context) ---
  if (GROQ_API_KEY) {
    try {
      const groqRes = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
        model: "llama3-8b-8192",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2000
      }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 40000 });
      
      const res = groqRes.data.choices[0].message.content;
      if (res && res.length > 300) return res;
    } catch (e) { console.warn("⚠️ Groq failed, falling back to Cloudflare..."); }
  }

  // --- Provider 2: Cloudflare Llama-3 (Secondary) ---
  const CF_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;
  try {
    const cfRes = await axios.post(CF_URL, { prompt, max_tokens: 1500 }, 
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` }, timeout: 80000 });
    return cfRes.data.result.response;
  } catch (e) {
    console.error("❌ All AI Providers failed for this item.");
    return null; // Fallback to Cleaned HTML logic in main loop
  }
}

async function runSummarizer() {
  console.log(`🤖 Batch ${batchIndex + 1}/${totalBatches} starting...`);
  const startTime = Date.now();
  const MAX_RUNTIME = 320 * 60 * 1000; // 5.3 hours safety window

  const allFiles = Array.from({ length: 2000 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return `${d.toISOString().split('T')[0]}.json`;
  });
  
  // Solution 1: Filter files assigned to this specific matrix runner
  const filesToProcess = allFiles.filter((_, i) => i % totalBatches === batchIndex).reverse();

  for (const file of filesToProcess) {
    if (Date.now() - startTime > MAX_RUNTIME) break;

    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) continue;

    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      // 🏥 Healing logic preserved
      if (!item.fullText && item.summaryText) {
        item.fullText = item.summaryText;
        modified = true;
      }

      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 350);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        console.log(`Deep Summarizing: ${item.headline?.substring(0, 30)}...`);
        const summary = await getDeepSummary(item.fullText, item.headline || "");
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          // Shorter delay because Groq handles load better
          await new Promise(r => setTimeout(r, 2000)); 
        } else if (!item.summaryText) {
          item.summaryText = item.fullText; // Fallback to HTML if AI fails
          modified = true;
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ File Perfected: ${file}`);
    }
  }
  console.log(`🎉 Batch ${batchIndex + 1} complete.`);
}
runSummarizer();
