// scripts/index.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { uploadAllData } from "./uploadToR2.js";
import { fetchRSSArticles } from "./rssFetcher.js";
import {
  loadProcessedLinks,
  saveProcessedLinks,
  filterUnprocessed,
  markAsProcessed
} from "./stateManager.js";
import { scrapeFullArticle } from "./articleScraper.js";
import { filterAndSortArticles } from "./relevanceEngine.js";
import { generateHybridHTML } from "./hybridGenerator.js";
import { detectCategory } from "./categoryDetector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPipeline() {
  try {
    console.log("🚀 UPSC Intelligence Pipeline Started...");

    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    const todayObj = new Date();
    const today = todayObj.toISOString().split("T")[0];

    console.log("📅 Today:", today);

    // ===============================
    // 1️⃣ FETCH RSS
    // ===============================

    console.log("📡 Fetching RSS feeds...");
    const rssArticles = await fetchRSSArticles();
    console.log("📰 Total RSS Articles:", rssArticles.length);

    // ===============================
    // 2️⃣ DEDUPLICATION
    // ===============================

    const seenTitles = new Set();

    const deduplicated = rssArticles.filter(article => {
      const normalized = (article.title || "").toLowerCase().trim();
      if (!normalized) return false;
      if (seenTitles.has(normalized)) return false;
      seenTitles.add(normalized);
      return true;
    });

    // ===============================
    // 3️⃣ HINDI FILTER
    // ===============================

    const hindiRegex = /[\u0900-\u097F]/;

    const englishOnly = deduplicated.filter(article => {
      return (
        !hindiRegex.test(article.title || "") &&
        !hindiRegex.test(article.content || "")
      );
    });

    // ===============================
    // 4️⃣ BACKLOG PROTECTION
    // ===============================

    const processedSet = loadProcessedLinks();
    const unprocessed = filterUnprocessed(englishOnly, processedSet);

    console.log("🆕 New Articles to Process:", unprocessed.length);

    // ===============================
    // 5️⃣ SCRAPE FULL ARTICLES
    // ===============================

    const scrapedArticles = [];

    for (const article of unprocessed) {
      try {
        const fullContent = await scrapeFullArticle(article.link);

        if (!fullContent || fullContent.length < 200) {
          continue;
        }

        scrapedArticles.push({
          title: article.title,
          link: article.link,
          content: fullContent,
          imageUrl: article.imageUrl || null
        });

        markAsProcessed(processedSet, article.link);

      } catch (err) {
        console.log("⚠ Skipping article due to scrape error");
      }
    }

    saveProcessedLinks(processedSet);

    // ===============================
    // 6️⃣ RELEVANCE SCORING
    // ===============================

    const relevantArticles = filterAndSortArticles(scrapedArticles);
    const topArticles = relevantArticles.slice(0, 20);

    console.log("🎯 Selected Top Articles:", topArticles.length);

    // ===============================
    // 7️⃣ HYBRID AI GENERATION
    // ===============================

    const finalOutput = [];

    for (const article of topArticles) {
      try {
        const generatedHTML = await generateHybridHTML(article);
        const category = detectCategory(article);

        finalOutput.push({
          headline: article.title,
          summaryText: generatedHTML,
          category: category
        });
      } catch (err) {
        console.log("⚠ Skipping article due to generation error");
      }
    }

    // ===============================
    // 8️⃣ SAVE TODAY JSON
    // ===============================

    fs.writeFileSync(
      path.join(dataDir, `${today}.json`),
      JSON.stringify(finalOutput, null, 2)
    );

    console.log("✅ Today's JSON created.");

    // ===============================
    // 9️⃣ UPDATE dates.json (NO ARCHIVE LOGIC)
    // ===============================

    const datesPath = path.join(dataDir, "dates.json");

    let existingDates = [];

    if (fs.existsSync(datesPath)) {
      existingDates = JSON.parse(fs.readFileSync(datesPath));
    }

    const dateSet = new Set(existingDates);
    dateSet.add(today);

    const finalDates = Array.from(dateSet).sort((a, b) =>
      b.localeCompare(a)
    );

    fs.writeFileSync(datesPath, JSON.stringify(finalDates, null, 2));

    console.log("✅ dates.json updated.");

    // ===============================
    // 🔟 UPLOAD TO R2
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
