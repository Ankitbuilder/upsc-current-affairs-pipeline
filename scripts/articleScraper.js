// scripts/articleScraper.js

import axios from "axios";
import * as cheerio from "cheerio";

function cleanHTML($) {
  $("script, style, noscript, iframe, header, footer, nav, form, svg").remove();
  $(".advertisement, .ads, .ad, .social-share, .related, .story-related-news").remove();
  return $;
}

function extractContent($) {
  let content = "";

  const articleTag = $("article");

  if (articleTag.length) {
    articleTag.find("p, h2, h3, h4, li").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 40) {
        content += text + "\n\n";
      }
    });
  } else {
    $("p").each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 60) {
        content += text + "\n\n";
      }
    });
  }

  return content.trim();
}

export async function scrapeFullArticle(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml"
      },
      timeout: 15000
    });

    const html = response.data;

    if (!html || html.length < 1000) {
      console.log("⚠ Empty HTML:", url);
      return null;
    }

    const $ = cheerio.load(html);
    cleanHTML($);

    let headline =
      $("meta[property='og:title']").attr("content") ||
      $("h1").first().text().trim();

    if (!headline || headline.length < 10) {
      console.log("⚠ No headline:", url);
      return null;
    }

    const content = extractContent($);

    if (!content || content.length < 500) {
      console.log("⚠ Content too small:", url);
      return null;
    }

    console.log("✅ Scraped:", headline.substring(0, 60));
    console.log("📏 Length:", content.length);

    return {
      headline,
      content
    };

  } catch (error) {
    console.log("❌ Scrape error:", url);
    return null;
  }
}
