// scripts/stateManager.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stateFilePath = path.join(__dirname, ".processedLinks.json");

function ensureStateFile() {
  if (!fs.existsSync(stateFilePath)) {
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify({ processed: [] }, null, 2)
    );
  }
}

export function loadProcessedLinks() {
  try {
    ensureStateFile();
    const raw = fs.readFileSync(stateFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    return new Set(parsed.processed || []);
  } catch (error) {
    console.log("⚠ Failed to load processed links. Resetting state.");
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify({ processed: [] }, null, 2)
    );
    return new Set();
  }
}

export function saveProcessedLinks(linkSet) {
  try {
    const data = {
      processed: Array.from(linkSet)
    };

    fs.writeFileSync(
      stateFilePath,
      JSON.stringify(data, null, 2)
    );
  } catch (error) {
    console.log("⚠ Failed to save processed links.");
  }
}

export function filterUnprocessed(articles, processedSet) {
  return articles.filter(article => {
    if (!article.link) return false;
    return !processedSet.has(article.link);
  });
}

export function markAsProcessed(processedSet, link) {
  if (link) {
    processedSet.add(link);
  }
}
