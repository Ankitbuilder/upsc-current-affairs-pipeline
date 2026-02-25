// scripts/stateManager.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_FILE = path.join(__dirname, "../data/processedLinks.json");

export function loadProcessedLinks() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return new Set();
    }

    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    return new Set(data);
  } catch (error) {
    console.error("⚠ Error loading processed links:", error);
    return new Set();
  }
}

export function saveProcessedLinks(set) {
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify([...set], null, 2)
    );
  } catch (error) {
    console.error("⚠ Error saving processed links:", error);
  }
}

export function markAsProcessed(set, link) {
  set.add(link);
}
