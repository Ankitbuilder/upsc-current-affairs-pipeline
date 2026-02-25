// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

function cleanHTML($) {
  $("script, style, noscript, iframe, header, footer, nav, form, svg").remove();
  return $;
}

export async function scrapeFullArticle(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      timeout: 25000
    });

    const html = response.data;

    if (!html || html.length < 800) {
      console.log("⚠ Empty HTML:", url);
      return { headline: "", content: "" };
    }

    const $ = cheerio.load(html);
    cleanHTML($);

    const headline =
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text().trim() ||
      "";

    let content = "";

    const container = $("#ContentPlaceHolder1_StoryContent");

    container.find("p, li").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 25) {
        content += text + "\n\n";
      }
    });

    content = content.trim();

    if (!content) {
      console.log("⚠ No meaningful PIB content:", url);
    }

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
