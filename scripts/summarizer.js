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
// Using Llama-3-8b-instruct for high-quality logic
const AI_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function summarizeForUPSC(text) {
  let cleanText = stripHtml(text);
  
  // 🚀 FIX: Slice extremely long articles to avoid AI context crashes
  // Most UPSC facts are in the first 2000 words.
  const wordsArray = cleanText.split(/\s+/).filter(w => w.length > 0);
  if (wordsArray.length > 2000) {
    cleanText = wordsArray.slice(0, 2000).join(" ");
  }

  const wordCount = wordsArray.length;
  const targetWords = Math.max(Math.floor(wordCount / 3), 60);

  // 🚀 FIX: Strict Prompt to eliminate AI Chatter and Truncation
  const prompt = `[INST] You are an expert UPSC Mentor. Summarize this PIB article into a high-quality study note.
  - FOCUS: Government Schemes, Ministries, Dates, and Exam-relevant Facts.
  - LENGTH: Use exactly ${targetWords} words. 
  - FORMAT: Use bullet points for key facts.
  - STRICT RULE: Start the summary IMMEDIATELY. Do NOT say 'Here is a summary' or 'This article discusses'.
  - ARTICLE: ${cleanText} [/INST]`;

  try {
    const response = await axios.post(AI_URL, 
      { 
        prompt,
        max_tokens: 1500 // 🚀 FIX: Increase output limit so it doesn't cut off
      }, 
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
    );
    
    let summary = response.data.result.response;
    
    // 🚀 FIX: Post-process to remove accidental AI chatter
    summary = summary.replace(/^(Here is a summary|Here's a study note|This PIB article|.*summarizing the article:)/i, "").trim();
    
    return summary.length > 100 ? summary : null;
  } catch (error) { 
    console.error("❌ AI API Timeout or Error. Skipping item.");
    return null; 
  }
}
async function runSummarizer() {
  console.log("🤖 Starting UPSC Summarizer (Backward Processing)...");

  // 1. Generate the list of dates for the last 2000 days
  const filesToProcess = Array.from({ length: 2000 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return `${d.toISOString().split('T')[0]}.json`;
  });

  // 2. REVERSE the array to start from 2000 days ago and move toward today
  filesToProcess.reverse(); 

  console.log(`📂 Scanning up to ${filesToProcess.length} historical files...`);

  for (const file of filesToProcess) {
    const filePath = path.join(dataDir, file);
    
    // Skip if the file doesn't exist for that specific date
    if (!fs.existsSync(filePath)) continue;

    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      // 🏥 HEALING: Move old text to fullText
      if (!item.fullText && item.summaryText) {
        item.fullText = item.summaryText;
        modified = true;
      }

      // 🤖 TRIGGER: Re-summarize if placeholder, HTML-heavy, or too short
      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 300);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        console.log(`Deep Summarizing (${file}): ${item.headline?.substring(0, 30)}...`);
        const summary = await summarizeForUPSC(item.fullText);
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          // Stay within Cloudflare free tier rate limits
          await new Promise(r => setTimeout(r, 1200)); 
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ File Perfected: ${file}`);
    }
  }
  console.log("🎉 UPSC Summarization Complete.");
}
runSummarizer();
