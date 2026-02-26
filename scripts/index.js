// scripts/index.js

process.env.TZ = "Asia/Kolkata"; // ✅ Ensure IST date always

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { uploadAllData } from "./uploadToR2.js";
import { fetchRSSArticles } from "./rssFetcher.js";
import { scrapeFullArticle } from "./articleScraper.js";
import { detectCategory } from "./categoryDetector.js";

import {
  loadProcessedLinks,
  saveProcessedLinks,
  markAsProcessed
} from "./stateManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPipeline() {
  try {
    console.log("🚀 PIB Official Feed Pipeline Started...");

    const dataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    // ✅ Use IST date (NOT UTC)
    const today = new Date().toLocaleDateString("en-CA");
    console.log("📅 Today:", today);

    // ===============================
    // 1️⃣ FETCH PIB RSS
    // ===============================
    const rssArticles = await fetchRSSArticles();
    console.log("📰 Total RSS Articles:", rssArticles.length);

    // ===============================
    // 2️⃣ DEDUPLICATE USING PRID
    // ===============================
    const seenPRIDs = new Set();
    const uniqueArticles = [];

    for (const article of rssArticles) {
      const match = article.link?.match(/PRID=(\d+)/);
      if (!match) continue;

      const prid = match[1];

      if (!seenPRIDs.has(prid)) {
        seenPRIDs.add(prid);
        uniqueArticles.push(article);
      }
    }

    console.log("🔁 Unique PIB Articles:", uniqueArticles.length);

    // ===============================
    // 2.5️⃣ SORT BY PIB PUBLISH TIME (DESC)
    // ===============================
    uniqueArticles.sort((a, b) => {
      const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
      const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
      return dateB - dateA;
    });

    console.log("⏳ Articles sorted by publish time.");

    // ===============================
    // 3️⃣ LOAD PROCESSED LINKS
    // ===============================
    const processedSet = loadProcessedLinks();

    // ===============================
    // 4️⃣ SCRAPE ALL NEW ARTICLES
    // ===============================
    const finalOutput = [];

    for (const article of uniqueArticles) {
      if (processedSet.has(article.link)) {
        continue;
      }

      const scraped = await scrapeFullArticle(article.link);

      if (!scraped || !scraped.content || scraped.content.length < 50) {
        console.log("⚠ Skipped:", article.title);
        continue;
      }

      const cleanedHTML = `<p>${scraped.content
        .replace(/\n+/g, "</p><p>")
      }</p>`;

      finalOutput.push({
        headline: scraped.headline || article.title,

        summaryText: cleanedHTML,

        category: detectCategory({
          headline: scraped.headline,
          fullText: scraped.content
        }),

        imageUrl: scraped.images?.[0] || null,
        imageUrls: scraped.images || [],

        articleUrl: article.link
      });

      markAsProcessed(processedSet, article.link);

      console.log("✅ Scraped:", article.title);
    }

    saveProcessedLinks(processedSet);

    console.log("📝 Successfully Scraped:", finalOutput.length);

    // ===============================
   // 5️⃣ SAVE TODAY JSON (APPEND MODE)
  // ===============================
  const todayPath = path.join(dataDir, `${today}.json`);

  let existingData = [];

  if (fs.existsSync(todayPath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(todayPath));
    } catch (err) {
      console.log("⚠ Error reading existing file. Creating fresh.");
      existingData = [];
    }
  }

  // Merge old + new
  const combinedData = [...existingData, ...finalOutput];

  // Remove duplicates safely using articleUrl
  const uniqueMap = new Map();
  for (const item of combinedData) {
    uniqueMap.set(item.articleUrl, item);
  }

  const finalMerged = Array.from(uniqueMap.values());

  const newContent = JSON.stringify(finalMerged, null, 2);

  let shouldWriteToday = true;

  if (fs.existsSync(todayPath)) {
    const currentContent = fs.readFileSync(todayPath, "utf8");
    if (currentContent === newContent) {
      shouldWriteToday = false;
      console.log("⏭ No change in today's JSON.");
    }
  }

  if (shouldWriteToday) {
    fs.writeFileSync(todayPath, newContent);
    console.log("✅ Today's JSON updated.");
  }
    // ===============================
    // 6️⃣ UPDATE dates.json
    // ===============================
    const datesPath = path.join(dataDir, "dates.json");

    let existingDates = [];

    if (fs.existsSync(datesPath)) {
        existingDates = JSON.parse(fs.readFileSync(datesPath));
      }

    if (!existingDates.includes(today)) {
      existingDates.unshift(today);
      }

    const newDatesContent = JSON.stringify(existingDates, null, 2);

    let shouldWriteDates = true;

    if (fs.existsSync(datesPath)) {
      const currentDatesContent = fs.readFileSync(datesPath, "utf8");
    if (currentDatesContent === newDatesContent) {
        shouldWriteDates = false;
        console.log("⏭ No change in dates.json.");
      }
    }

    if (shouldWriteDates) {
        fs.writeFileSync(datesPath, newDatesContent);
        console.log("✅ dates.json updated.");
      }

    // ===============================
    // 7️⃣ UPLOAD TO R2
    // ===============================
    await uploadAllData();

    console.log("🎉 Pipeline completed successfully.");

  } catch (error) {
    console.error("❌ Pipeline failed:");
    console.error(error);
    process.exit(1);
  }
}

runPipeline();
