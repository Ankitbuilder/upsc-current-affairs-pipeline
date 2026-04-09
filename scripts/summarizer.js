// scripts/summarizer.js
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

// You will need to add these to your GitHub Secrets / .env file
const CF_ACCOUNT_ID = process.env.R2_ACCOUNT_ID; // Reusing your existing R2 account ID
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN; // Needs to be created in CF Dashboard

const AI_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/facebook/bart-large-cnn`;

// Utility to strip HTML tags for accurate word counting
function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function summarizeArticle(text) {
  const cleanTextContent = stripHtml(text);
  const wordCount = cleanTextContent.split(/\s+/).length;
  
  // Enforce the strict 1/3 word limit (minimum 30 words so it doesn't break on tiny articles)
  const targetLength = Math.max(Math.floor(wordCount / 3), 30);

  try {
    const response = await axios.post(
      AI_URL,
      {
        input_text: cleanTextContent,
        max_length: targetLength 
      },
      {
        headers: { Authorization: `Bearer ${CF_API_TOKEN}` }
      }
    );
    return response.data.result.summary;
  } catch (error) {
    console.error("AI Summarization failed:", error.response?.data || error.message);
    return null;
  }
}

async function runSummarizer() {
  console.log("🤖 Starting Offline Summarization Pipeline...");
  const files = fs.readdirSync(dataDir).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
  
  let totalSummarized = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let fileModified = false;

    for (let item of data) {
      // 1. Backwards compatibility for your 1700 older articles
      // If summaryText holds a massive HTML string instead of a real summary, move it.
      if (item.summaryText && item.summaryText.length > 500 && !item.fullText) {
        item.fullText = item.summaryText;
        item.summaryText = null; 
      }

      // 2. Process items that need a summary
      if (!item.summaryText && item.fullText) {
        console.log(`Summarizing: ${item.headline.substring(0, 40)}...`);
        
        const summary = await summarizeArticle(item.fullText);
        
        if (summary) {
          item.summaryText = summary;
          fileModified = true;
          totalSummarized++;
          
          // Optional: Add a delay to prevent hitting API rate limits during the 1700 backfill
          await new Promise(res => setTimeout(res, 1500));
        }
      }
    }

    // Write back to the local JSON file if changes were made
    if (fileModified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Updated ${file} with new summaries.`);
    }
  }

  console.log(`🎉 Finished! Summarized ${totalSummarized} articles.`);
}

runSummarizer();
