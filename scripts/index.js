// scripts/index.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { uploadAllData } from "./uploadToR2.js";
import { fetchRSSArticles } from "./rssFetcher.js";
import { scrapeFullArticle } from "./articleScraper.js";
import { generateHybridHTML } from "./hybridGenerator.js";
import { detectCategory } from "./categoryDetector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPipeline() {
  try {
    console.log("🚀 PIB Intelligence Pipeline Started...");

    const dataDir = path.join(__dirname, "../data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    const today = new Date().toISOString().split("T")[0];
    console.log("📅 Today:", today);

    // 1️⃣ Fetch PIB RSS
    const rssArticles = await fetchRSSArticles();
    console.log("📰 Total PIB Articles:", rssArticles.length);

    const scrapedArticles = [];

    // 2️⃣ Scrape ALL articles
    for (const article of rssArticles) {

      const scraped = await scrapeFullArticle(article.link);

      if (!scraped || !scraped.content || scraped.content.length < 50) {
        console.log("⚠ Skipped (empty content):", article.title);
        continue;
      }

      scrapedArticles.push({
        title: scraped.headline || article.title,
        link: article.link,
        content: scraped.content
      });
    }

    console.log("📝 Successfully Scraped:", scrapedArticles.length);

    // 3️⃣ Generate for ALL
    const finalOutput = [];

    for (const article of scrapedArticles) {
      const generatedHTML = await generateHybridHTML(article);
      const category = detectCategory(article);

      finalOutput.push({
        headline: article.title,
        summaryText: generatedHTML,
        category
      });
    }

    console.log("🎯 Generated Articles:", finalOutput.length);

    // 4️⃣ Save JSON
    fs.writeFileSync(
      path.join(dataDir, `${today}.json`),
      JSON.stringify(finalOutput, null, 2)
    );

    console.log("✅ Today's JSON created.");

    // 5️⃣ Update dates.json
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

    // 6️⃣ Upload
    await uploadAllData();

    console.log("🎉 Pipeline completed successfully.");

  } catch (error) {
    console.error("❌ Pipeline failed:");
    console.error(error);
    process.exit(1);
  }
}

runPipeline();
