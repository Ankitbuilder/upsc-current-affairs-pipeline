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
  const cleanText = stripHtml(text);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  // Target: Approximately 1/3 of the words
  const targetWords = Math.max(Math.floor(wordCount / 3), 50);

  const prompt = `[INST] You are an expert UPSC (Civil Services) mentor. 
  Task: Summarize the following PIB article into a high-quality study note.
  Guidelines:
  - Focus on Government Schemes, Ministries, Dates, and Facts useful for the Preliminary and Mains exams.
  - LENGTH REQUIREMENT: Your summary MUST be approximately ${targetWords} words long.
  - DO NOT provide a one-word or one-sentence response.
  - Use a professional and informative tone.

  Article content: ${cleanText} [/INST]`;

  try {
    const response = await axios.post(AI_URL, { prompt }, {
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
    });
    
    const summary = response.data.result.response;
    
    // Safety check: Ensure the AI didn't fail or give a tiny response
    if (!summary || summary.length < 150) return null;
    
    return summary;
  } catch (error) { 
    return null; 
  }
}

async function runSummarizer() {
  console.log("🤖 Starting UPSC Summarizer & Data Healing...");

  // Temporary 2000-day window to heal all existing data
  const recentFiles = Array.from({length: 2000}, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return `${d.toISOString().split('T')[0]}.json`;
  });

  const files = fs.readdirSync(dataDir).filter(f => recentFiles.includes(f));
  
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      // 🏥 HEALING STEP: If fullText is missing, create it
      if (!item.fullText && item.summaryText) {
        item.fullText = item.summaryText;
        modified = true;
      }

      // 🤖 SUMMARIZATION TRIGGER
      const isPlaceholder = item.summaryText === item.fullText;
      const tooShort = item.summaryText && item.summaryText.length < 200; // Catches bad/one-word summaries
      const hasHtml = item.summaryText && item.summaryText.includes("<p>");

      if ((!item.summaryText || isPlaceholder || tooShort || hasHtml) && item.fullText) {
        console.log(`Summarizing UPSC facts for: ${item.headline?.substring(0, 40)}...`);
        const summary = await summarizeForUPSC(item.fullText);
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          // Respect Cloudflare free tier rate limits
          await new Promise(r => setTimeout(r, 1500)); 
        }
      }
    }
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Healed and Summarized: ${file}`);
    }
  }
  console.log("🎉 All data healed and summarized.");
}
runSummarizer();
