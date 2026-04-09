// scripts/summarizer.js
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

// 🚀 FALLBACK CHAIN: Best to Fastest
const AI_MODELS = [
  "@cf/meta/llama-3-8b-instruct",       // UPSC Expert (High Quality)
  "@cf/mistralcea/mistral-7b-instruct-v0.1", // Fast Fallback
  "@cf/meta/llama-2-7b-chat-int8"       // Safety Fallback
];

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

/**
 * Tries multiple models and retries each one on failure.
 */
async function summarizeForUPSC(text) {
  let cleanText = stripHtml(text);
  const wordsArray = cleanText.split(/\s+/).filter(w => w.length > 0);
  
  if (wordsArray.length > 2000) {
    cleanText = wordsArray.slice(0, 2000).join(" ");
  }

  const targetWords = Math.max(Math.floor(wordsArray.length / 2), 250);

  const prompt = `[INST] Provide a COMPREHENSIVE UPSC study note. 
  Sections: 1. CONTEXT, 2. KEY FEATURES, 3. SIGNIFICANCE, 4. UPSC RELEVANCE.
  LENGTH: Minimum ${targetWords} words.
  STRICT: Start immediately with CONTEXT. No filler.
  ARTICLE: ${cleanText} [/INST]`;

  for (const modelPath of AI_MODELS) {
    const AI_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${modelPath}`;
    
    // Try each model twice before moving to the next one
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`🤖 [Attempt ${attempt}] Using: ${modelPath.split('/').pop()}...`);
        const response = await axios.post(AI_URL, 
          { prompt, max_tokens: 2500 }, 
          { 
            headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
            timeout: 90000 // 90-second wait for deep summaries
          }
        );
        
        let res = response.data.result.response;
        if (res && res.length > 300) {
          return res.replace(/^(Here is a summary|Here's a study note|.*summarizing:)/i, "").trim();
        }
      } catch (error) {
        console.warn(`⚠️ ${modelPath.split('/').pop()} failed. Status: ${error.response?.status || error.message}`);
        await new Promise(r => setTimeout(r, 5000)); // Cool down
      }
    }
  }

  // 🚀 FINAL FALLBACK: If all models fail, return null to keep original text
  return null;
}

async function runSummarizer() {
  console.log("🤖 Starting Full Backfill (Backward Mode)...");
  const startTime = Date.now();
  const MAX_RUNTIME = 330 * 60 * 1000; // 5.5 hour safety window

  const filesToProcess = Array.from({ length: 2000 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return `${d.toISOString().split('T')[0]}.json`;
  });
  filesToProcess.reverse(); 

  for (const file of filesToProcess) {
    if (Date.now() - startTime > MAX_RUNTIME) {
      console.log("⏳ Safety Limit Reached (5.5h). Saving progress for next run...");
      break; 
    }

    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) continue;

    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      // 🏥 HEALING: Ensure original text is preserved
      if (!item.fullText && item.summaryText) {
        item.fullText = item.summaryText;
        modified = true;
      }

      // 🔍 CHECK: If summary is a placeholder (same as fullText) or broken, it MUST run
      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 350);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        console.log(`Deep Summarizing (${file}): ${item.headline?.substring(0, 35)}...`);
        const summary = await summarizeForUPSC(item.fullText);
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          await new Promise(r => setTimeout(r, 4000)); // Stability delay
        } else {
          // 🚀 FAILSAFE: All AI failed. Ensure it defaults to Cleaned HTML.
          // If it was already a placeholder, it stays a placeholder.
          if (!item.summaryText) {
             item.summaryText = item.fullText;
             modified = true;
          }
          console.log(`ℹ️ All AI failed for "${item.headline?.substring(0, 20)}". Keeping cleaned HTML.`);
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Progress Saved: ${file}`);
    }
  }
  console.log("🎉 Run Completed.");
}
runSummarizer();
