// scripts/summarizer.js
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

const AI_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/facebook/bart-large-cnn`;

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function summarizeArticle(text) {
  const cleanTextContent = stripHtml(text);
  const wordCount = cleanTextContent.split(/\s+/).length;
  
  // Enforce the 1/3 word count limit
  const targetLength = Math.max(Math.floor(wordCount / 3), 30);

  try {
    const response = await axios.post(
      AI_URL,
      { input_text: cleanTextContent, max_length: targetLength },
      { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } }
    );
    return response.data.result.summary;
  } catch (error) {
    console.error("AI Error:", error.response?.data || error.message);
    return null;
  }
}

async function runSummarizer() {
  console.log("🤖 Summarization & Backfill Pipeline Started...");
  const files = fs.readdirSync(dataDir).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file));
  
  let totalSummarized = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let fileModified = false;

    for (let item of data) {
      // 🚀 THE BACKFILL LOGIC:
      // If summaryText is long (>50 chars) and fullText is empty, 
      // it means it's one of your 1700 old articles. We move it.
      if (item.summaryText && item.summaryText.length > 50 && !item.fullText) {
        item.fullText = item.summaryText;
        item.summaryText = null; 
        fileModified = true;
      }

      // 🤖 THE SUMMARIZATION LOGIC:
      if (!item.summaryText && item.fullText) {
        console.log(`Processing: ${item.headline.substring(0, 50)}...`);
        const summary = await summarizeArticle(item.fullText);
        if (summary) {
          item.summaryText = summary;
          fileModified = true;
          totalSummarized++;
          // Delay to stay within free tier rate limits
          await new Promise(res => setTimeout(res, 1200));
        }
      }
    }

    if (fileModified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ File Updated: ${file}`);
    }
  }
  console.log(`🎉 Pipeline Complete. Summarized ${totalSummarized} articles.`);
}

runSummarizer();
