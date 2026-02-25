import fs from "fs";
import axios from "axios";
import { uploadJSON } from "./uploadToR2.js";

async function run() {
  console.log("UPSC Pipeline Started...");

  const today = new Date().toISOString().split("T")[0];
  const cutoffDate = "2025-08-10";
  const baseUrl = `https://${process.env.R2_BUCKET_NAME}.r2.dev`;

  if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data");
  }

  const sample = [
    {
      title: "Pipeline Setup Test",
      source: "System",
      publishedAt: today,
      whyInNews: "Testing pipeline initialization.",
      background: "Initial setup validation.",
      keyHighlights: ["Structure ready", "JSON format validated"],
      constitutionalProvisions: "N/A",
      significance: "Ensures backend works.",
      challenges: "None",
      wayForward: "Proceed with next build steps.",
      prelimsFacts: ["Automation enabled"],
      gsPaper: "GS2"
    }
  ];

  // Save locally
  fs.writeFileSync(`./data/${today}.json`, JSON.stringify(sample, null, 2));

  // Fetch existing dates from R2
  let existingDates = [];

  try {
    const response = await axios.get(`${baseUrl}/dates.json`);
    existingDates = response.data || [];
    console.log("Fetched existing dates from R2.");
  } catch (error) {
    console.log("No existing dates found or failed to fetch.");
  }

  // Keep only dates <= cutoff
  const filteredDates = existingDates.filter(date => date <= cutoffDate);

  // Add today if not present
  if (!filteredDates.includes(today)) {
    filteredDates.unshift(today);
  }

  // Sort newest first
  filteredDates.sort((a, b) => b.localeCompare(a));

  // Save locally
  fs.writeFileSync("./data/dates.json", JSON.stringify(filteredDates, null, 2));

  console.log("Local JSON updated.");

  // Upload to R2
  await uploadJSON(`${today}.json`, sample);
  await uploadJSON("dates.json", filteredDates);

  console.log("Uploaded to R2 successfully.");
}

run();
