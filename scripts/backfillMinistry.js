import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { detectCategory } from "./categoryDetector.js";
import {
  normalizeMinistry,
  stripHtml,
  extractMinistryFromSummary,
  detectMinistryFromUrl,
} from "./ministryDetector.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");

const WRITE_CHANGES = process.env.WRITE_CHANGES === "true";
const VERIFY_AFTER_WRITE = process.env.VERIFY_AFTER_WRITE !== "false";
const ALLOW_FETCH = process.env.ALLOW_FETCH !== "false";
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 150);

const REPORT_PATH = path.join(DATA_DIR, "ministry-backfill-report.json");
const REVIEW_PATH = path.join(DATA_DIR, "ministry-review-needed.json");

const SKIP_FILES = new Set([
  "dates.json",
  "processedLinks.json",
  ".uploadHashes.json",
  "ministry-backfill-report.json",
  "ministry-review-needed.json",
]);

const FALLBACK_LABELS = new Set([
  "economy",
  "international relations",
  "defence",
  "environment",
  "health",
  "agriculture",
  "infrastructure",
  "history",
  "sports",
  "general",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isJsonDataFile(file) {
  return (
    file.endsWith(".json") &&
    !file.endsWith(".bak") &&
    !SKIP_FILES.has(file)
  );
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeWriteJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function buildCategoryFallback(article) {
  const summaryPlain = stripHtml(article.summaryText || "");

  return detectCategory({
    headline: article.headline || "",
    fullText: summaryPlain || "",
  });
}

function isSuspiciousMinistry(ministry, headline = "") {
  const m = normalizeMinistry(ministry).toLowerCase();
  const h = normalizeMinistry(headline).toLowerCase();

  return (
    !m ||
    m === h ||
    m.length < 4 ||
    m.length > 120 ||
    /^posted on[:\s]/i.test(m) ||
    /^read this release in[:\s]/i.test(m) ||
    /facebook|twitter|whatsapp|linkedin|instagram|youtube|telegram|email/i.test(m) ||
    /press information bureau/i.test(m) ||
    /pib delhi/i.test(m) ||
    FALLBACK_LABELS.has(m) ||
    /[.!?]/.test(m)
  );
}

async function resolveMinistryForArticle(article) {
  const headline = article.headline || "";

  const existingMinistry = normalizeMinistry(article.ministry || "");
  if (existingMinistry && !isSuspiciousMinistry(existingMinistry, headline)) {
    return {
      ministry: existingMinistry,
      source: "existing",
      debugCandidates: [],
      fetchError: null,
    };
  }

  const summaryResult = extractMinistryFromSummary(article.summaryText || "");
  if (
    summaryResult.ministry &&
    !isSuspiciousMinistry(summaryResult.ministry, headline)
  ) {
    return {
      ministry: normalizeMinistry(summaryResult.ministry),
      source: "summary",
      debugCandidates: summaryResult.debugCandidates || [],
      fetchError: null,
    };
  }

  if (ALLOW_FETCH && article.articleUrl) {
    const fetchResult = await detectMinistryFromUrl(article.articleUrl);

    if (
      fetchResult.ministry &&
      !isSuspiciousMinistry(fetchResult.ministry, headline)
    ) {
      return {
        ministry: normalizeMinistry(fetchResult.ministry),
        source: "url_fetch",
        debugCandidates: fetchResult.debugCandidates || [],
        fetchError: null,
      };
    }

    const fallbackFromFetch = buildCategoryFallback(article);
    return {
      ministry: fallbackFromFetch,
      source: "category_fallback_after_fetch",
      debugCandidates: fetchResult.debugCandidates || [],
      fetchError: fetchResult.error || null,
    };
  }

  const fallback = buildCategoryFallback(article);
  return {
    ministry: fallback,
    source: "category_fallback",
    debugCandidates: summaryResult.debugCandidates || [],
    fetchError: null,
  };
}

function verifyWrittenFile(filePath, expectedCount) {
  const parsed = safeReadJson(filePath);

  if (!Array.isArray(parsed)) {
    return { ok: false, reason: "File is not an array" };
  }

  if (parsed.length !== expectedCount) {
    return {
      ok: false,
      reason: `Article count mismatch. Expected ${expectedCount}, got ${parsed.length}`,
    };
  }

  for (let i = 0; i < parsed.length; i += 1) {
    const article = parsed[i];

    if (!article.ministry || typeof article.ministry !== "string") {
      return {
        ok: false,
        reason: `Missing ministry at index ${i}`,
      };
    }

    if (Object.prototype.hasOwnProperty.call(article, "category")) {
      return {
        ok: false,
        reason: `category still present at index ${i}`,
      };
    }
  }

  return { ok: true, reason: "" };
}

async function processFile(fileName, report, reviewItems) {
  const filePath = path.join(DATA_DIR, fileName);
  const backupPath = `${filePath}.bak`;

  let parsed;
  try {
    parsed = safeReadJson(filePath);
  } catch (error) {
    report.filesFailed.push({
      file: fileName,
      reason: `JSON parse failed: ${error.message}`,
    });
    return;
  }

  if (!Array.isArray(parsed)) {
    report.filesSkipped.push({
      file: fileName,
      reason: "Not an article array",
    });
    return;
  }

  let fileChanged = false;
  const updatedArticles = [];

  for (let index = 0; index < parsed.length; index += 1) {
    const article = parsed[index];
    report.totalArticlesChecked += 1;

    const result = await resolveMinistryForArticle(article);

    const updated = {
      ...article,
      ministry: result.ministry,
    };

    delete updated.category;

    if (JSON.stringify(updated) !== JSON.stringify(article)) {
      fileChanged = true;
    }

    updatedArticles.push(updated);

    if (result.source === "existing") report.sourceCounts.existing += 1;
    if (result.source === "summary") report.sourceCounts.summary += 1;
    if (result.source === "url_fetch") report.sourceCounts.url_fetch += 1;
    if (result.source === "category_fallback") report.sourceCounts.category_fallback += 1;
    if (result.source === "category_fallback_after_fetch") {
      report.sourceCounts.category_fallback_after_fetch += 1;
    }

    if (result.fetchError) {
      report.fetchErrors.push({
        file: fileName,
        index,
        headline: article.headline || "",
        articleUrl: article.articleUrl || "",
        error: result.fetchError,
      });
    }

    if (
      isSuspiciousMinistry(updated.ministry, updated.headline || "") ||
      result.source.startsWith("category_fallback")
    ) {
      reviewItems.push({
        file: fileName,
        index,
        headline: updated.headline || "",
        articleUrl: updated.articleUrl || "",
        ministry: updated.ministry || "",
        source: result.source,
        debugCandidates: result.debugCandidates || [],
      });
    }

    if (ALLOW_FETCH && article.articleUrl) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  report.filesProcessed += 1;

  const newContent = JSON.stringify(updatedArticles, null, 2);
  const oldContent = fs.readFileSync(filePath, "utf8");

  if (oldContent === newContent) {
    report.filesUnchanged.push(fileName);
    return;
  }

  report.filesChanged.push(fileName);

  if (!WRITE_CHANGES) {
    return;
  }

  fs.copyFileSync(filePath, backupPath);
  safeWriteJson(filePath, updatedArticles);

  if (!VERIFY_AFTER_WRITE) return;

  const verification = verifyWrittenFile(filePath, updatedArticles.length);

  if (!verification.ok) {
    fs.copyFileSync(backupPath, filePath);
    report.filesFailed.push({
      file: fileName,
      reason: `Verification failed, restored backup: ${verification.reason}`,
    });
    return;
  }

  report.filesVerified.push(fileName);
}

async function runBackfill() {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error("Data directory does not exist.");
  }

  const report = {
    startedAt: new Date().toISOString(),
    writeMode: WRITE_CHANGES,
    verifyAfterWrite: VERIFY_AFTER_WRITE,
    allowFetch: ALLOW_FETCH,
    requestDelayMs: REQUEST_DELAY_MS,
    filesProcessed: 0,
    totalArticlesChecked: 0,
    sourceCounts: {
      existing: 0,
      summary: 0,
      url_fetch: 0,
      category_fallback: 0,
      category_fallback_after_fetch: 0,
    },
    filesChanged: [],
    filesUnchanged: [],
    filesVerified: [],
    filesSkipped: [],
    filesFailed: [],
    fetchErrors: [],
    finishedAt: null,
  };

  const reviewItems = [];

  const files = fs.readdirSync(DATA_DIR).filter(isJsonDataFile).sort();

  for (const fileName of files) {
    console.log(`🔍 Processing ${fileName}`);
    await processFile(fileName, report, reviewItems);
  }

  report.finishedAt = new Date().toISOString();

  safeWriteJson(REPORT_PATH, report);
  safeWriteJson(REVIEW_PATH, reviewItems);

  console.log("✅ Backfill finished");
  console.log(`📄 Report: ${REPORT_PATH}`);
  console.log(`📝 Review list: ${REVIEW_PATH}`);
}

runBackfill().catch((error) => {
  console.error("❌ Backfill failed:", error.message);
  process.exit(1);
});
