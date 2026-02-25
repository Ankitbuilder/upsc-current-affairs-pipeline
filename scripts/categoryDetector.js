// scripts/categoryDetector.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const syllabusPath = path.join(__dirname, "syllabusKeywords.json");

let SYLLABUS = {};

try {
  const raw = fs.readFileSync(syllabusPath, "utf-8");
  SYLLABUS = JSON.parse(raw);
} catch (error) {
  console.error("❌ Failed to load syllabusKeywords.json in categoryDetector");
  SYLLABUS = {};
}

function normalize(text) {
  return (text || "").toLowerCase();
}

function countMatches(text, keywords) {
  let count = 0;
  keywords.forEach(keyword => {
    if (text.includes(keyword)) {
      count++;
    }
  });
  return count;
}

function countNested(text, categoryObject) {
  let total = 0;
  Object.values(categoryObject).forEach(keywordArray => {
    total += countMatches(text, keywordArray);
  });
  return total;
}

export function detectCategory(article) {
  const text = normalize(
    (article.title || "") + " " + (article.content || "")
  );

  let scores = {
    "GS-1": 0,
    "GS-2": 0,
    "GS-3": 0,
    "GS-4": 0
  };

  if (SYLLABUS.GS1_HISTORY) {
    scores["GS-1"] += countNested(text, SYLLABUS.GS1_HISTORY);
  }

  if (SYLLABUS.GS1_GEOGRAPHY) {
    scores["GS-1"] += countNested(text, SYLLABUS.GS1_GEOGRAPHY);
  }

  if (SYLLABUS.GS2_POLITY_GOVERNANCE) {
    scores["GS-2"] += countNested(text, SYLLABUS.GS2_POLITY_GOVERNANCE);
  }

  if (SYLLABUS.GS3_ECONOMY_ENV_SCI) {
    scores["GS-3"] += countNested(text, SYLLABUS.GS3_ECONOMY_ENV_SCI);
  }

  if (SYLLABUS.GS4_ETHICS) {
    scores["GS-4"] += countMatches(text, SYLLABUS.GS4_ETHICS);
  }

  let highest = "General";
  let maxScore = 0;

  Object.entries(scores).forEach(([key, value]) => {
    if (value > maxScore) {
      maxScore = value;
      highest = key;
    }
  });

  return maxScore > 0 ? highest : "General";
}
