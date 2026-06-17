// scripts/forceRetry.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Imports your existing state manager to handle processed links
import { loadProcessedLinks, saveProcessedLinks } from "./stateManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

async function resetCorrupted() {
  // Matches the exact IST date logic in your index.js
  const today = new Date().toLocaleDateString("en-CA"); 
  const todayPath = path.join(dataDir, `${today}.json`);

  if (!fs.existsSync(todayPath)) {
    console.log(`❌ No data file found for today (${today}.json).`);
    return;
  }

  let data = JSON.parse(fs.readFileSync(todayPath, "utf8"));
  const processedSet = loadProcessedLinks();

  // Find all corrupted articles (headlines with "Untitled Page" or containing the error text)
  const corruptedUrls = data
    .filter(item => 
      item.headline === "Untitled Page" || 
      item.fullText.includes("Page you have requested is not available")
    )
    .map(item => item.articleUrl);

  if (corruptedUrls.length === 0) {
    console.log("✨ No corrupted 'Untitled Page' articles found in today's JSON.");
    return;
  }

  console.log(`🔍 Found ${corruptedUrls.length} corrupted articles to reset.`);

  // 1. Remove the URLs from the processed links history
  let removedCount = 0;
  for (const url of corruptedUrls) {
    if (processedSet.has(url)) {
      processedSet.delete(url);
      console.log(`  -> Unmarked as processed: ${url}`);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    saveProcessedLinks(processedSet);
    console.log("✅ Processed links history updated.");
  }

  // 2. Delete the corrupted "Untitled Page" entries from today's JSON file
  const cleanedData = data.filter(item => !corruptedUrls.includes(item.articleUrl));
  fs.writeFileSync(todayPath, JSON.stringify(cleanedData, null, 2));
  console.log(`✅ Removed corrupted entries from today's JSON file (${today}.json).`);

  console.log("\n🔄 Reset complete! Run your scraper and summarizer pipelines again to fetch them properly.");
}

resetCorrupted();
