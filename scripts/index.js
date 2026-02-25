// scripts/index.js

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

    const today = new Date().toISOString().split("T")[0];
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
    // 5️⃣ SAVE TODAY JSON
    // ===============================
    fs.writeFileSync(
      path.join(dataDir, `${today}.json`),
      JSON.stringify(finalOutput, null, 2)
    );

    console.log("✅ Today's JSON created.");

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

    fs.writeFileSync(
      datesPath,
      JSON.stringify(existingDates, null, 2)
    );

    console.log("✅ dates.json updated.");

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
