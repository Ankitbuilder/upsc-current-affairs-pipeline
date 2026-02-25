// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

function cleanHTML($) {
  $("script, style, noscript, iframe").remove();
  return $;
}

function normalizeImageUrl(src) {
  if (!src) return null;

  if (src.startsWith("http")) return src;

  return "https://www.pib.gov.in" + src;
}

export async function scrapeFullArticle(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      timeout: 25000
    });

    const html = response.data;

    if (!html) {
      return { headline: "", content: "", images: [] };
    }

    const $ = cheerio.load(html);
    cleanHTML($);

    const headline =
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text().trim() ||
      "";

    let content = "";
    let images = [];

    const container = $("#ContentPlaceHolder1_StoryContent");

    // Extract text
    container.find("p, li").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) {
        content += text + "\n\n";
      }
    });

    // Extract images
    container.find("img").each((_, el) => {
      const src = $(el).attr("src");
      const fullUrl = normalizeImageUrl(src);
      if (fullUrl) {
        images.push(fullUrl);
      }
    });

    content = content.trim();

    return {
      headline,
      content,
      images
    };

  } catch (error) {
    console.log("❌ PIB Scrape error:", url);
    return { headline: "", content: "", images: [] };
  }
}
