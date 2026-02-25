// scripts/index.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { uploadAllData } from "./uploadToR2.js";
import { fetchRSSArticles } from "./rssFetcher.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPipeline() {
  try {
    console.log("🚀 UPSC Pipeline Started...");

    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    // ===============================
    // 1️⃣ GET TODAY DATE
    // ===============================

    const todayObj = new Date();
    const today = todayObj.toISOString().split("T")[0];

    console.log("📅 Today:", today);

    // ===============================
    // 2️⃣ FETCH RSS ARTICLES
    // ===============================

    console.log("📡 Fetching RSS feeds...");
    const rssArticles = await fetchRSSArticles();

    console.log("📰 Total RSS Articles:", rssArticles.length);

    // Limit to first 8 articles for stability
    const limitedArticles = rssArticles.slice(0, 8);

    // ===============================
    // 3️⃣ PREPARE TODAY JSON
    // ===============================

    const formattedArticles = limitedArticles.map(article => ({
      title: article.title || "",
      link: article.link || "",
      imageUrl: article.imageUrl || null,
      content: article.content || "",
      generatedAt: new Date().toISOString()
    }));

    fs.writeFileSync(
      path.join(dataDir, `${today}.json`),
      JSON.stringify(formattedArticles, null, 2)
    );

    console.log("✅ Today's JSON created.");

    // ===============================
    // 4️⃣ DATE MANAGEMENT LOGIC
    // ===============================
    // KEEP:
    // 1 Jan 2025 → 9 Aug 2025 (fixed permanent archive)
    // + today onward
    // NEVER include 10 Aug 2025
    // Remove unwanted middle dates

    const archiveStart = new Date("2025-01-01");
    const archiveEnd = new Date("2025-08-09"); // IMPORTANT: 9 AUG ONLY

    const datesPath = path.join(dataDir, "dates.json");

    let existingDates = [];

    if (fs.existsSync(datesPath)) {
      existingDates = JSON.parse(fs.readFileSync(datesPath));
    }

    const finalDatesSet = new Set();

    // Add fixed archive (1 Jan 2025 → 9 Aug 2025)
    let temp = new Date(archiveStart);
    while (temp <= archiveEnd) {
      finalDatesSet.add(temp.toISOString().split("T")[0]);
      temp.setDate(temp.getDate() + 1);
    }

    // Add today + future dates only
    existingDates.forEach(dateStr => {
      const dateObj = new Date(dateStr);
      if (dateObj >= todayObj) {
        finalDatesSet.add(dateStr);
      }
    });

    // Always add today
    finalDatesSet.add(today);

    const finalDates = Array.from(finalDatesSet).sort((a, b) =>
      b.localeCompare(a)
    );

    fs.writeFileSync(datesPath, JSON.stringify(finalDates, null, 2));

    console.log("✅ dates.json updated correctly.");
    console.log("📆 Total Active Dates:", finalDates.length);

    // ===============================
    // 5️⃣ UPLOAD TO R2
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
