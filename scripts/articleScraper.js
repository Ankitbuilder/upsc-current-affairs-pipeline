// scripts/articleScraper.js

import * as cheerio from "cheerio";
import { extractMinistry } from "./testMinistry.js";

/* ============================================================
   UTILITY: CLEANERS & FILTERS
============================================================ */
function normalizeImageUrl(src) {
  if (!src) return null;

  const fullUrl =
    src.startsWith("http")
      ? src
      : "https://pib.gov.in" + src;

  const blacklist = [
    "logo",
    "azadika",
    "facebook",
    "twitter",
    "instagram",
    "youtube",
    "print",
    "share",
    "icon"
  ];

  return blacklist.some(word =>
    fullUrl.toLowerCase().includes(word)
  )
    ? null
    : fullUrl;
}

function cleanText(text) {
  if (!text) return "";

  return text
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidHtml(html) {
  return (
    html &&
    html.length > 500 &&
    !html.includes("Page you have requested is not available") &&
    !html.includes("Sorry for your Inconvenience") &&
    !html.includes("Invalid PRID")
  );
}

/* ============================================================
   RESILIENT FETCH ENGINE
============================================================ */
async function fetchHtml(targetUrl) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Referer": "https://pib.gov.in/"
  };

  const strategies = [
    {
      name: "Direct (Bare Domain)",
      url: targetUrl
    },
    {
      name: "Direct (Archive)",
      url: targetUrl.replace(
        "pib.gov.in",
        "archive.pib.gov.in"
      )
    },
    {
      name: "CorsProxy",
      url: `https://corsproxy.io/?${targetUrl}`
    },
    {
      name: "CodeTabs",
      url: `https://api.codetabs.com/v1/proxy?quest=${targetUrl}`
    }
  ];

  for (const strat of strategies) {
    try {
      const res = await fetch(
        strat.url,
        {
          headers,
          signal: AbortSignal.timeout(12000)
        }
      );

      const text = await res.text();

      if (isValidHtml(text)) {
        console.log(
          `   ✅ Success via ${strat.name}`
        );
        return text;
      }
    } catch {
      // continue
    }
  }

  try {
    const res = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
      {
        signal: AbortSignal.timeout(15000)
      }
    );

    const json = await res.json();

    if (
      json.contents &&
      isValidHtml(json.contents)
    ) {
      console.log(
        `   ✅ Success via AllOrigins`
      );
      return json.contents;
    }
  } catch {}

  return null;
}

/* ============================================================
   PIB SCRAPER
============================================================ */
export async function scrapeFullArticle(url) {
  try {
    const prIDMatch =
      url.match(/PRID=(\d+)/);

    if (!prIDMatch) {
      return null;
    }

    const prid = prIDMatch[1];

    const masterUrl =
      `https://pib.gov.in/PressReleasePage.aspx?PRID=${prid}&reg=48&lang=1`;

    console.log(
      `🔗 Fetching PRID: ${prid} (Using reg=48 master key)...`
    );

    const html =
      await fetchHtml(masterUrl);

    if (!html) {
      console.log(
        `❌ Skipped: Network timeout or WAF blocked all proxy attempts for PRID ${prid}`
      );
      return null;
    }

    const $ = cheerio.load(html);

    /* ========================================================
       HEADLINE
    ======================================================== */

    const headline = cleanText(
      $("h2").first().text() ||
      $("h1").first().text() ||
      $(".ReleaseTitleTxt").text()
    );

    if (
      !headline ||
      headline.toLowerCase() === "untitled page" ||
      headline.toLowerCase() === "pib"
    ) {
      return null;
    }

const ministryResult = extractMinistry($);

const ministry =
  ministryResult?.ministry?.trim() || "";

console.log(
  `🏛 Ministry: ${ministry || "NOT FOUND"}`
);

    /* ========================================================
       CONTENT TARGETING
    ======================================================== */

    let target = null;

    const primarySelectors = [
      ".ReleaseText",
      ".ReleaseTextTxt",
      "#ReleaseText",
      ".release-details-full",

      ".innner-page-main-about-us-content-right-part",

      ".content-area",
      ".field-content",
      ".main-content",

      "table",
      "tbody"
    ];

    for (const selector of primarySelectors) {
      if ($(selector).length > 0) {
        target = $(selector).first();
        break;
      }
    }

    if (!target) {
      let maxScore = 0;

      $("article, main, div, td")
        .not(
          "nav, footer, header, aside, .sidebar"
        )
        .each((_, el) => {
          const $el = $(el);

          if (
            $el.find("a").length >
            $el.find("p, li, td").length
          ) {
            return;
          }

          const score =
            ($el.find("p, li, td").length * 10) +
            ($el.text().length / 100);

          if (score > maxScore) {
            maxScore = score;
            target = $el;
          }
        });
    }

    const finalTarget =
      target || $("body");

    /* ========================================================
       TABLE EXTRACTION
    ======================================================== */

    finalTarget.find("table").each(
      (_, table) => {
        const rows = [];

        $(table)
          .find("tr")
          .each((__, tr) => {
            const cols = [];

            $(tr)
              .find("th, td")
              .each((___, cell) => {
                const text = cleanText(
                  $(cell).text()
                );

                if (text) {
                  cols.push(text);
                }
              });

            if (cols.length) {
              rows.push(
                cols.join(" | ")
              );
            }
          });

        $(table).replaceWith(
          "\n" +
          rows.join("\n") +
          "\n"
        );
      }
    );

    /* ========================================================
       TEXT EXTRACTION
    ======================================================== */

    finalTarget
      .find("br")
      .replaceWith("\n");

    finalTarget
      .find(
        "p, li, div, td, h1, h2, h3"
      )
      .append("\n");

    const rawText =
      finalTarget.text();

    const contentBlocks =
      rawText
        .split("\n")
        .map(line =>
          cleanText(line)
        )
        .filter(
          line =>
            line.length > 15 &&
            !line.startsWith(
              "Posted On:"
            ) &&
            !line
              .toLowerCase()
              .includes(
                "follow us"
              ) &&
            !line.includes(
              "Visitor Counter :"
            )
        );

    const uniqueContent =
      [...new Set(contentBlocks)]
        .join("\n\n");

    /* ========================================================
       IMAGES
    ======================================================== */

    let images = [];

    finalTarget
      .find("img")
      .each((_, el) => {
        const validUrl =
          normalizeImageUrl(
            $(el).attr("src") ||
            $(el).attr(
              "data-src"
            )
          );

        if (validUrl) {
          images.push(validUrl);
        }
      });

    if (
      uniqueContent.length < 150
    ) {
      console.log(
        `❌ Skipped: Extracted text too short (Length: ${uniqueContent.length}).`
      );

      return null;
    }

    console.log(
      `✅ Scraped successfully: ${headline.substring(
        0,
        45
      )}...`
    );

    return {
      headline,
      ministry,
      content: uniqueContent,
      images: [...new Set(images)],
      meta: {
        timestamp:
          new Date().toISOString()
      }
    };
  } catch (error) {
    console.error(
      `❌ Critical PIB Fail [${url}]:`,
      error.message
    );

    return null;
  }
}
