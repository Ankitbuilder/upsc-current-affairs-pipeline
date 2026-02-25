// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .replace(/Story continues below this ad/gi, "")
    .replace(/Advertisement/gi, "")
    .trim();
}

function removeUnwanted($) {
  const unwantedSelectors = [
    "script",
    "style",
    "meta",
    "noscript",
    "iframe",
    "ev-engagement",
    ".advertisement",
    ".ads",
    ".ad",
    ".related",
    ".share",
    ".social",
    ".promo",
    ".subscription",
    ".print",
    "header",
    "footer",
    "nav"
  ];

  unwantedSelectors.forEach(selector => {
    $(selector).remove();
  });
}

function extractMainContent($, url) {
  if (url.includes("pib.gov.in")) {
    return $("#ContentPlaceHolder1_ArticleDetail").html();
  }

  if (url.includes("thehindu.com")) {
    return $("div.articlebodycontent").html();
  }

  if (url.includes("indianexpress.com")) {
    return $("div.full-details").html();
  }

  return $("article").html() || $("body").html();
}

function sanitizeStructuredHTML(rawHTML) {
  const $ = cheerio.load(rawHTML);

  removeUnwanted($);

  const allowedTags = ["p", "ul", "ol", "li", "h2", "h3"];

  $("*").each((_, el) => {
    const tag = el.tagName?.toLowerCase();

    if (!allowedTags.includes(tag)) {
      $(el).replaceWith($(el).text());
    }
  });

  const cleanedParts = [];

  $("p, ul, ol, h2, h3").each((_, el) => {
    const tag = el.tagName.toLowerCase();

    if (tag === "p") {
      const text = cleanText($(el).text());
      if (text.length > 40) {
        cleanedParts.push(`<p>${text}</p>`);
      }
    }

    if (tag === "h2" || tag === "h3") {
      const text = cleanText($(el).text());
      if (text.length > 5 && text.length < 120) {
        cleanedParts.push(`<h3>${text}</h3>`);
      }
    }

    if (tag === "ul" || tag === "ol") {
      const items = [];
      $(el)
        .find("li")
        .each((__, li) => {
          const text = cleanText($(li).text());
          if (text.length > 20) {
            items.push(`<li>${text}</li>`);
          }
        });

      if (items.length > 0) {
        cleanedParts.push(`<ul>${items.join("")}</ul>`);
      }
    }
  });

  return cleanedParts.join("");
}

export async function scrapeFullArticle(url) {
  try {
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(response.data);

    const rawHTML = extractMainContent($, url);

    if (!rawHTML) return "";

    const structuredClean = sanitizeStructuredHTML(rawHTML);

    return structuredClean;

  } catch (error) {
    console.log("❌ Scrape error:", url);
    return "";
  }
}
