// scripts/fetchPibSources.js
import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";

const PIB_URL = "https://pib.gov.in/AllRelease.aspx";

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function isValidOption(text) {
  const t = cleanText(text);

  if (!t) return false;
  if (/^all ministry$/i.test(t)) return false;
  if (/^select$/i.test(t)) return false;
  if (/^home$/i.test(t)) return false;

  return true;
}

function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

function extractDropdownOptions($) {
  const collected = [];

  const possibleSelectors = [
    "select option",
    "#ContentPlaceHolder1_ddldepartment option",
    "#ddldepartment option",
    "select[name*='department'] option",
    "select[id*='department'] option",
    "select[name*='ministry'] option",
    "select[id*='ministry'] option"
  ];

  for (const selector of possibleSelectors) {
    $(selector).each((_, el) => {
      const text = cleanText($(el).text());
      if (isValidOption(text)) {
        collected.push(text);
      }
    });
  }

  return uniqueSorted(collected);
}

async function main() {
  const response = await axios.get(PIB_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    },
    timeout: 30000
  });

  const $ = cheerio.load(response.data);
  const sources = extractDropdownOptions($);

  if (sources.length === 0) {
    console.error("No PIB source options found.");
    process.exit(1);
  }

  const output = {
    source: PIB_URL,
    fetchedAt: new Date().toISOString(),
    count: sources.length,
    pibSources: sources
  };

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(
    "data/pibSources.json",
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log(`Saved ${sources.length} PIB sources to data/pibSources.json`);
  console.log(JSON.stringify(sources, null, 2));
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
