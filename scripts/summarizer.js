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
const AI_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function summarizeForUPSC(text) {
  let cleanText = stripHtml(text);
  
  const wordsArray = cleanText.split(/\s+/).filter(w => w.length > 0);
  if (wordsArray.length > 2000) {
    cleanText = wordsArray.slice(0, 2000).join(" ");
  }

  const wordCount = wordsArray.length;
  const targetWords = Math.max(Math.floor(wordCount / 3), 60);

  const prompt = `[INST] You are an expert UPSC Mentor. Summarize this PIB article into a high-quality study note.
  - FOCUS: Government Schemes, Ministries, Dates, and Exam-relevant Facts.
  - LENGTH: Use exactly ${targetWords} words. 
  - FORMAT: Use bullet points for key facts.
  - STRICT RULE: Start the summary IMMEDIATELY. Do NOT say 'Here is a summary' or 'This article discusses'.
  - ARTICLE: ${cleanText} [/INST]`;

  try {
    const response = await axios.post(AI_URL, 
      { prompt, max_tokens: 1500 }, 
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
    );
    
    let summary = response.data.result.response;
    summary = summary.replace(/^(Here is a summary|Here's a study note|This PIB article|.*summarizing the article:)/i, "").trim();
    
    return summary.length > 100 ? summary : null;
  } catch (error) { 
    console.error("❌ AI API Timeout or Error. Skipping item.");
    return null; 
  }
}

async function runSummarizer() {
  console.log("🤖 Starting UPSC Summarizer (Backward Processing)...");
  
  // ⏱️ SURGICAL FIX: Track time to save progress before GitHub's 6-hour limit
  const startTime = Date.now();
  const MAX_RUNTIME = 330 * 60 * 1000; // 5.5 hours (Safety Margin)

  const filesToProcess = Array.from({ length: 2000 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return `${d.toISOString().split('T')[0]}.json`;
  });

  filesToProcess.reverse(); 

  console.log(`📂 Scanning up to ${filesToProcess.length} historical files...`);

  for (const file of filesToProcess) {
    // ⏱️ SURGICAL FIX: Exit early if we are near the 6-hour timeout
    if (Date.now() - startTime > MAX_RUNTIME) {
      console.log("⏳ Reaching 5.5 hour limit. Saving current progress and exiting gracefully to allow R2 Upload and Git Commit...");
      break; 
    }

    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) continue;

    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      if (!item.fullText && item.summaryText) {
        item.fullText = item.summaryText;
        modified = true;
      }

      const isPlaceholder = item.summaryText === item.fullText;
      // 🚀 TRIGGER: Re-summarize if placeholder, HTML-heavy, or too short/truncated
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 300);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        console.log(`Deep Summarizing (${file}): ${item.headline?.substring(0, 30)}...`);
        const summary = await summarizeForUPSC(item.fullText);
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          await new Promise(r => setTimeout(r, 1200)); 
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ File Perfected: ${file}`);
    }
  }
  console.log("🎉 UPSC Summarization Phase Finished.");
}
runSummarizer();
