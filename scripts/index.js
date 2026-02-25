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

    const rssArticles = await fetchRSSArticles();
    console.log("📰 Total RSS Articles:", rssArticles.length);

    // ===============================
    // 2️⃣ DEDUPLICATE
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

    console.log("🆕 New Articles:", unprocessed.length);

    // ===============================
    // 5️⃣ PRE-SCORE BEFORE SCRAPING
    // ===============================

    const preScored = filterAndSortArticles(unprocessed);

    // Only take top 60 for scraping
    const candidates = preScored.slice(0, 60);

    console.log("🔎 Candidates for Scraping:", candidates.length);

    // ===============================
    // 6️⃣ SCRAPE SELECTED ARTICLES
    // ===============================

    const scrapedArticles = [];

    for (const article of candidates) {
      try {
        const fullContent = await scrapeFullArticle(article.link);

        if (!fullContent || fullContent.length < 300) continue;

        scrapedArticles.push({
          title: article.title,
          link: article.link,
          content: fullContent,
          imageUrl: article.imageUrl || null
        });

        markAsProcessed(processedSet, article.link);

      } catch (err) {
        console.log("⚠ Scrape failed for:", article.link);
      }
    }

    saveProcessedLinks(processedSet);

    console.log("📝 Scraped Articles:", scrapedArticles.length);

    // ===============================
    // 7️⃣ FINAL RELEVANCE SCORING
    // ===============================

    const finalRanked = filterAndSortArticles(scrapedArticles);
    const topArticles = finalRanked.slice(0, 20);

    console.log("🎯 Final Selected Articles:", topArticles.length);

    // ===============================
    // 8️⃣ HYBRID AI GENERATION
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
        console.log("⚠ Generation failed for:", article.title);
      }
    }

    // ===============================
    // 9️⃣ SAVE TODAY JSON
    // ===============================

    fs.writeFileSync(
      path.join(dataDir, `${today}.json`),
      JSON.stringify(finalOutput, null, 2)
    );

    console.log("✅ Today's JSON created.");

    // ===============================
    // 🔟 UPDATE dates.json
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
    // 1️⃣1️⃣ UPLOAD TO R2
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
