// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

function cleanHTML($) {
  $("script, style, noscript, iframe").remove();
  return $;
}

function extractFromContainer($, selector) {
  let content = "";

  const container = $(selector);

  container.find("p, li").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length > 20) {
      content += text + "\n\n";
    }
  });

  return content.trim();
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
      return { headline: "", content: "" };
    }

    const $ = cheerio.load(html);
    cleanHTML($);

    const headline =
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text().trim() ||
      "";

    let content = "";

    // 🔥 Try multiple PIB containers
    content = extractFromContainer($, "#ContentPlaceHolder1_StoryContent");

    if (!content)
      content = extractFromContainer($, "#divContent");

    if (!content)
      content = extractFromContainer($, ".innner-page-content");

    if (!content)
      content = extractFromContainer($, "body");

    console.log("✅ Scraped:", headline.substring(0, 60));
    console.log("📏 Length:", content.length);

    return {
      headline,
      content
    };

  } catch (error) {
    console.log("❌ PIB Scrape error:", url);
    return { headline: "", content: "" };
  }
}
