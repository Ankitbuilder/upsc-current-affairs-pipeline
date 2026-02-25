// scripts/index.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { uploadAllData } from "./uploadToR2.js";

// Required for ES modules (__dirname replacement)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPipeline() {
  try {
    console.log("🚀 UPSC Pipeline Started...");

    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    // ==============================
    // 1️⃣ Get Today Date
    // ==============================

    const todayDateObj = new Date();
    const today = todayDateObj.toISOString().split("T")[0];

    // ==============================
    // 2️⃣ Generate Today JSON
    // ==============================

    const sampleData = [
      {
        title: "Pipeline Test Entry",
        whyInNews: "Automated daily pipeline execution.",
        background: "Testing Cloudflare R2 + GitHub Actions integration.",
        keyHighlights: ["Automation active", "Date logic applied"],
        constitutionalProvisions: "N/A",
        significance: "Ensures daily current affairs update.",
        challenges: "None",
        wayForward: "Proceed with AI integration.",
        prelimsFacts: [
          "Fact 1",
          "Fact 2",
          "Fact 3",
          "Fact 4",
          "Fact 5"
        ],
        gsPaper: "GS2"
      }
    ];

    const todayFilePath = path.join(dataDir, `${today}.json`);
    fs.writeFileSync(todayFilePath, JSON.stringify(sampleData, null, 2));

    console.log("✅ Today's JSON generated.");

    // ==============================
    // 3️⃣ Date Logic
    // ==============================

    const archiveStart = new Date("2025-01-01");
    const archiveEnd = new Date("2025-08-10");

    const datesFilePath = path.join(dataDir, "dates.json");

    let existingDates = [];

    if (fs.existsSync(datesFilePath)) {
      existingDates = JSON.parse(fs.readFileSync(datesFilePath));
    }

    const finalDatesSet = new Set();

    // Fixed archive range
    let tempDate = new Date(archiveStart);
    while (tempDate <= archiveEnd) {
      finalDatesSet.add(tempDate.toISOString().split("T")[0]);
      tempDate.setDate(tempDate.getDate() + 1);
    }

    // Add today + future dates
    existingDates.forEach((dateStr) => {
      const dateObj = new Date(dateStr);
      if (dateObj >= todayDateObj) {
        finalDatesSet.add(dateStr);
      }
    });

    finalDatesSet.add(today);

    const finalDates = Array.from(finalDatesSet).sort((a, b) =>
      b.localeCompare(a)
    );

    fs.writeFileSync(datesFilePath, JSON.stringify(finalDates, null, 2));

    console.log("✅ dates.json updated correctly.");

    // ==============================
    // 4️⃣ Upload to R2
    // ==============================

    await uploadAllData();

    console.log("🎉 Pipeline completed successfully.");
  } catch (error) {
    console.error("❌ Pipeline failed:");
    console.error(error);
    process.exit(1);
  }
}

runPipeline();
