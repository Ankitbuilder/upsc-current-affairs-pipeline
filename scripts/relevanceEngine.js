// scripts/relevanceEngine.js

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
  console.error("❌ Failed to load syllabusKeywords.json");
  SYLLABUS = {};
}

function normalize(text) {
  return (text || "").toLowerCase();
}

function scoreFromKeywordArray(text, keywords, weight = 5) {
  let score = 0;
  keywords.forEach(keyword => {
    if (text.includes(keyword)) {
      score += weight;
    }
  });
  return score;
}

function scoreFromNestedCategory(text, categoryObject, baseWeight = 6) {
  let score = 0;
  Object.values(categoryObject).forEach(keywordArray => {
    score += scoreFromKeywordArray(text, keywordArray, baseWeight);
  });
  return score;
}

export function calculateRelevanceScore(article) {
  const text = normalize(
    (article.title || "") + " " + (article.content || "")
  );

  let score = 0;

  if (SYLLABUS.GS1_HISTORY) {
    score += scoreFromNestedCategory(text, SYLLABUS.GS1_HISTORY, 6);
  }

  if (SYLLABUS.GS1_GEOGRAPHY) {
    score += scoreFromNestedCategory(text, SYLLABUS.GS1_GEOGRAPHY, 6);
  }

  if (SYLLABUS.GS2_POLITY_GOVERNANCE) {
    score += scoreFromNestedCategory(text, SYLLABUS.GS2_POLITY_GOVERNANCE, 8);
  }

  if (SYLLABUS.GS3_ECONOMY_ENV_SCI) {
    score += scoreFromNestedCategory(text, SYLLABUS.GS3_ECONOMY_ENV_SCI, 7);
  }

  if (SYLLABUS.GS4_ETHICS) {
    score += scoreFromKeywordArray(text, SYLLABUS.GS4_ETHICS, 5);
  }

  if (SYLLABUS.NEGATIVE_FILTER) {
    SYLLABUS.NEGATIVE_FILTER.forEach(keyword => {
      if (text.includes(keyword)) {
        score -= 25;
      }
    });
  }

  return score;
}

export function filterAndSortArticles(articles) {
  const scoredArticles = articles.map(article => ({
    ...article,
    relevanceScore: calculateRelevanceScore(article)
  }));

  const filtered = scoredArticles.filter(a => a.relevanceScore > 0);

  filtered.sort((a, b) => b.relevanceScore - a.relevanceScore);

  return filtered;
}
