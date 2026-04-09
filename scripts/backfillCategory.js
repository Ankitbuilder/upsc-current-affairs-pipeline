process.env.TZ = "Asia/Kolkata";

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

import { detectCategory } from "./categoryDetector.js";
import { extractMinistryFromUrl } from "./testMinistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getArgValue(name) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) {
    return exact.slice(name.length + 1).trim();
  }

  const index = process.argv.indexOf(name);
  if (index !== -1 && index + 1 < process.argv.length) {
    return String(process.argv[index + 1]).trim();
  }

  return "";
}

const isWriteMode = hasFlag("--write");
const targetDate = getArgValue("--date");
const limitRaw = getArgValue("--limit");
const limit = limitRaw ? Number(limitRaw) : 0;

if (limitRaw && (!Number.isInteger(limit) || limit <= 0)) {
  throw new Error("--limit must be a positive integer");
}

function toPlainText(html) {
  const $ = cheerio.load(`<body>${html || ""}</body>`);
  return $("body").text().replace(/\s+/g, " ").trim();
}

function getTargetFiles() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Data directory not found: ${dataDir}`);
  }

  if (targetDate) {
    const fileName = `${targetDate}.json`;
    const fullPath = path.join(dataDir, fileName);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Target file not found: ${fileName}`);
    }

    return [fileName];
  }

  return fs
    .readdirSync(dataDir)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
}

async function resolveNewCategory(item) {
  const fallbackCategory = detectCategory({
    headline: item?.headline || "",
    fullText: toPlainText(item?.summaryText || item?.fullText || ""),
  });

  if (!item?.articleUrl || typeof item.articleUrl !== "string") {
    return {
      newCategory: fallbackCategory,
      source: "fallback",
      reason: "missing articleUrl",
    };
  }

  try {
    const { ministry } = await extractMinistryFromUrl(item.articleUrl);

    if (ministry && ministry.trim()) {
      return {
        newCategory: ministry.trim(),
        source: "ministry",
        reason: "PIB top section detected",
      };
    }

    return {
      newCategory: fallbackCategory,
      source: "fallback",
      reason: "ministry empty",
    };
  } catch (error) {
    return {
      newCategory: fallbackCategory,
      source: "fallback",
      reason: `ministry detection failed: ${error.message}`,
    };
  }
}

async function runBackfill() {
  const files = getTargetFiles();

  if (files.length === 0) {
    console.log("No date JSON files found.");
    return;
  }

  console.log(
    `Mode: ${isWriteMode ? "WRITE" : "PREVIEW"} | Files: ${files.length}` +
      (targetDate ? ` | Date: ${targetDate}` : "") +
      (limit ? ` | Limit: ${limit}` : "")
  );

  let processedCount = 0;
  let changedCount = 0;
  let writtenFileCount = 0;
  const previewRows = [];

  for (const fileName of files) {
    if (limit && processedCount >= limit) {
      break;
    }

    const filePath = path.join(dataDir, fileName);

    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      console.log(`⚠ Skipping ${fileName}: invalid JSON`);
      continue;
    }

    if (!Array.isArray(data)) {
      console.log(`⚠ Skipping ${fileName}: expected an array`);
      continue;
    }

    let fileChanged = false;

    for (const item of data) {
      if (limit && processedCount >= limit) {
        break;
      }

      if (!item || typeof item !== "object") {
        continue;
      }

      processedCount += 1;

      const oldCategory =
        typeof item.category === "string" ? item.category.trim() : "";

      const { newCategory, source, reason } = await resolveNewCategory(item);

      if (oldCategory !== newCategory) {
        changedCount += 1;

        previewRows.push({
          fileName,
          headline: item.headline || "",
          articleUrl: item.articleUrl || "",
          oldCategory,
          newCategory,
          source,
          reason,
        });

        if (isWriteMode) {
          item.category = newCategory;
          fileChanged = true;
        }
      }
    }

    if (isWriteMode && fileChanged) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      writtenFileCount += 1;
      console.log(`✅ Updated ${fileName}`);
    }
  }

  console.log("");
  console.log(`Processed articles: ${processedCount}`);
  console.log(`Changed categories: ${changedCount}`);
  console.log(`Files written: ${writtenFileCount}`);

  if (previewRows.length === 0) {
    console.log("");
    console.log("No category changes found.");
  } else {
    console.log("");
    console.log("===== CATEGORY CHANGES =====");
    for (let i = 0; i < previewRows.length; i++) {
      const row = previewRows[i];
      console.log(`\n[${i + 1}] ${row.fileName}`);
      console.log(`Headline: ${row.headline}`);
      console.log(`URL: ${row.articleUrl}`);
      console.log(`Old category: ${row.oldCategory || "[EMPTY]"}`);
      console.log(`New category: ${row.newCategory || "[EMPTY]"}`);
      console.log(`Source: ${row.source}`);
      console.log(`Reason: ${row.reason}`);
    }
  }

  if (!isWriteMode) {
    console.log("");
    console.log("Preview mode only. No files were modified.");
  }
}

runBackfill().catch((error) => {
  console.error("❌ Backfill failed:");
  console.error(error);
  process.exit(1);
});
