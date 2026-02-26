// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "en-US,en;q=0.9"
      },
      timeout: 30000
    });

    const html = response.data;

    if (!html || html.length < 2000) {
      console.log("⚠ HTML too small:", url);
      return null;
    }

    const $ = cheerio.load(html);

    // Headline
    const headline =
      $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content") ||
      "";

    let content = "";
    let images = [];

    // ✅ Correct PIB container from screenshot
    let container = $(".innner-page-main-about-us-content-right-part");

    if (container && container.length > 0) {

      // Extract paragraphs
      container.find("p").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30) {
          content += text + "\n\n";
        }
      });

      // Extract images
      container.find("img").each((_, el) => {
        const src = $(el).attr("src");
        const fullUrl = normalizeImageUrl(src);
        if (fullUrl) images.push(fullUrl);
      });

    } else {

      console.log("ℹ Using iframe fallback layout:", url);

      $("ol li, p").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30) {
          content += text + "\n\n";
        }
      });

      $("img").each((_, el) => {
        const src = $(el).attr("src");
        const fullUrl = normalizeImageUrl(src);
        if (fullUrl) images.push(fullUrl);
      });
    }

    content = content.trim();

    if (content.length < 100) {
      console.log("⚠ No meaningful PIB content:", url);
      return null;
    }

    console.log("✅ Scraped:", headline.substring(0, 60));
    console.log("📏 Length:", content.length);

    return {
      headline,
      content,
      images
    };

  } catch (error) {
    console.log("❌ PIB Scrape error:", url);
    return null;
  }
}
