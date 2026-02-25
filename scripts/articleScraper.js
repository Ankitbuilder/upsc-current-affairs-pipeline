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
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      timeout: 30000
    });

    const html = response.data;

    if (!html) {
      console.log("⚠ Empty HTML:", url);
      return null;
    }

    const $ = cheerio.load(html);

    // Headline
    const headline =
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text().trim() ||
      "";

    let content = "";
    let images = [];

    // Try main PIB container
    let container =
      $("#ContentPlaceHolder1_StoryContent");

    // If not found, fallback to full body
    if (!container || container.length === 0) {
      container = $("body");
    }

    // Extract paragraphs
    container.find("p").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) {
        content += text + "\n\n";
      }
    });

    // Extract list items
    container.find("li").each((_, el) => {
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

    if (content.length < 50) {
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
