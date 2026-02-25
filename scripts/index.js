// scripts/index.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { uploadAllData } from "./uploadToR2.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runPipeline() {
  try {
    console.log("🚀 UPSC Pipeline Started...");

    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    const todayDateObj = new Date();
    const today = todayDateObj.toISOString().split("T")[0];

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
        prelimsFacts: ["Fact 1", "Fact 2", "Fact 3", "Fact 4", "Fact 5"],
        gsPaper: "GS2"
      }
    ];

    fs.writeFileSync(
      path.join(dataDir, `${today}.json`),
      JSON.stringify(sampleData, null, 2)
    );

    const archiveStart = new Date("2025-01-01");
    const archiveEnd = new Date("2025-08-10");

    const datesPath = path.join(dataDir, "dates.json");

    let existingDates = [];
    if (fs.existsSync(datesPath)) {
      existingDates = JSON.parse(fs.readFileSync(datesPath));
    }

    const finalDatesSet = new Set();

    let temp = new Date(archiveStart);
    while (temp <= archiveEnd) {
      finalDatesSet.add(temp.toISOString().split("T")[0]);
      temp.setDate(temp.getDate() + 1);
    }

    existingDates.forEach((dateStr) => {
      const d = new Date(dateStr);
      if (d >= todayDateObj) {
        finalDatesSet.add(dateStr);
      }
    });

    finalDatesSet.add(today);

    const finalDates = Array.from(finalDatesSet).sort((a, b) =>
      b.localeCompare(a)
    );

    fs.writeFileSync(datesPath, JSON.stringify(finalDates, null, 2));

    console.log("✅ dates.json updated correctly.");

    await uploadAllData();

    console.log("🎉 Pipeline completed successfully.");
  } catch (error) {
    console.error("❌ Pipeline failed:");
    console.error(error);
    process.exit(1);
  }
}

runPipeline();
