// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

/* =========================================
   CLEAN HTML
========================================= */
function cleanHTML($) {
  $("script, style, noscript, iframe, header, footer, nav, form, svg").remove();
  $(".advertisement, .ads, .ad, .social-share, .related, .story-related-news").remove();
  return $;
}

/* =========================================
   SAFE TEXT EXTRACTION
========================================= */
function safeTextExtract(elements, minLength = 40) {
  let content = "";

  elements.each((_, el) => {
    const text = cheerio(el).text().trim();
    if (text.length > minLength) {
      content += text + "\n\n";
    }
  });

  return content.trim();
}

/* =========================================
   PIB EXTRACTION
========================================= */
function extractPIB($) {
  let content = "";

  const mainContainer = $("#ContentPlaceHolder1_StoryContent");

  if (mainContainer.length) {
    content = safeTextExtract(mainContainer.find("p, li"), 30);
  }

  return content;
}

/* =========================================
   GENERIC EXTRACTION
========================================= */
function extractGeneric($) {
  let content = "";

  const articleTag = $("article");

  if (articleTag.length) {
    content = safeTextExtract(articleTag.find("p, h2, h3, h4, li"));
  }

  if (!content || content.length < 300) {
    content = safeTextExtract($("p"), 60);
  }

  return content;
}

/* =========================================
   MAIN SCRAPER
========================================= */
export async function scrapeFullArticle(url) {
  try {

    /* 🔥 FIX PIB URL STRUCTURE */
    if (url.includes("pib.gov.in")) {
      const match = url.match(/PRID=(\d+)/);
      if (match) {
        const prid = match[1];
        url = `https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=${prid}&reg=3&lang=1`;
      }
    }

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml"
      },
      timeout: 25000
    });

    const html = response.data;

    if (!html || html.length < 800) {
      console.log("⚠ Empty HTML:", url);
      return {
        headline: "",
        content: ""
      };
    }

    const $ = cheerio.load(html);
    cleanHTML($);

    /* ===== HEADLINE ===== */
    let headline =
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text().trim() ||
      $("title").text().trim() ||
      "";

    /* ===== CONTENT ===== */
    let content = "";

    if (url.includes("pib.gov.in")) {
      content = extractPIB($);
    } else {
      content = extractGeneric($);
    }

    /* 🔥 FINAL HARD FALLBACK */
    if (!content || content.length < 200) {
      content = safeTextExtract($("p"), 30);
    }

    if (!headline) headline = "Untitled Article";

    if (!content) {
      console.log("⚠ Could not extract meaningful content:", url);
      content = "";
    }

    console.log("✅ Scraped:", headline.substring(0, 60));
    console.log("📏 Length:", content.length);

    return {
      headline,
      content
    };

  } catch (error) {
    console.log("❌ Scrape error:", url);

    return {
      headline: "",
      content: ""
    };
  }
}
