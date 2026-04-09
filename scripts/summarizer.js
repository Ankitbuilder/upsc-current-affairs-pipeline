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
// Using Llama-3-8b-instruct for high-quality, long-form reasoning
const AI_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function summarizeForUPSC(text) {
  let cleanText = stripHtml(text);
  
  // Slicer: Allows more input words for deeper analysis
  const wordsArray = cleanText.split(/\s+/).filter(w => w.length > 0);
  if (wordsArray.length > 2500) {
    cleanText = wordsArray.slice(0, 2500).join(" ");
  }

  const wordCount = wordsArray.length;
  // Target: Roughly 1/2 of article length, with a high minimum for 'Long Type'
  const targetWords = Math.max(Math.floor(wordCount / 2), 250);

  const prompt = `[INST] You are an expert UPSC (Civil Services) Mentor. 
  Provide a DETAILED and COMPREHENSIVE study note for the following PIB article.
  
  STRUCTURE YOUR RESPONSE:
  1. CONTEXT: Background of the news.
  2. KEY FEATURES/PROVISIONS: Detailed breakdown of the scheme or policy.
  3. SIGNIFICANCE: Impact on development and governance.
  4. UPSC RELEVANCE: Specific facts for Prelims and themes for Mains.

  LENGTH REQUIREMENT: Your response MUST be at least ${targetWords} words.
  STRICT RULE: Start immediately with the 'CONTEXT' section. Do NOT say "Here is a summary."
  
  ARTICLE: ${cleanText} [/INST]`;

  try {
    const response = await axios.post(AI_URL, 
      { 
        prompt, 
        max_tokens: 2500 // Increased budget for long output
      }, 
      { 
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
        timeout: 90000 // 90-second wait for deep generation
      }
    );
    
    let summary = response.data.result.response;
    
    // Clean accidental AI chatter
    summary = summary.replace(/^(Here is a summary|Here's a study note|This PIB article|.*summarizing the article:)/i, "").trim();
    
    return summary.length > 300 ? summary : null;
  } catch (error) { 
    console.error(`❌ API Error (${error.response?.status || error.message}). Skipping.`);
    return null; 
  }
}

async function runSummarizer() {
  console.log("🤖 Starting Long-Form UPSC Summarizer...");
  
  const startTime = Date.now();
  const MAX_RUNTIME = 330 * 60 * 1000; // 5.5 hours Safety Margin

  // Generate 2000 days and process from Oldest to Newest
  const filesToProcess = Array.from({ length: 2000 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return `${d.toISOString().split('T')[0]}.json`;
  });
  filesToProcess.reverse(); 

  for (const file of filesToProcess) {
    // ⏱️ TIMEOUT CHECK: Save progress before 6-hour limit
    if (Date.now() - startTime > MAX_RUNTIME) {
      console.log("⏳ Reaching 5.5 hour limit. Saving and exiting to allow Upload phases...");
      break; 
    }

    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) continue;

    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      // 🏥 HEALING: Save original content before AI overwrites it
      if (!item.fullText && item.summaryText) {
        item.fullText = item.summaryText;
        modified = true;
      }

      // 🤖 TRIGGER: Re-summarize only if placeholder, broken, or too short
      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 300);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        console.log(`Summarizing Deeply (${file}): ${item.headline?.substring(0, 30)}...`);
        const summary = await summarizeForUPSC(item.fullText);
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          // 5-second delay to maintain stability for long generations
          await new Promise(r => setTimeout(r, 5000)); 
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ File Perfected: ${file}`);
    }
  }
  console.log("🎉 Long-Form Summarization Phase Finished.");
}
runSummarizer();
