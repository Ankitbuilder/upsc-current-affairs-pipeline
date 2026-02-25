// scripts/articleScraper.js

import axios from "axios";
import cheerio from "cheerio";

function cleanHTML($, container) {
  container.find("script").remove();
  container.find("style").remove();
  container.find("noscript").remove();
  container.find("iframe").remove();
  container.find("form").remove();
  container.find("button").remove();
  container.find("svg").remove();

  container.find("a").each((_, el) => {
    const text = $(el).text();
    $(el).replaceWith(text);
  });

  container.find("*").each((_, el) => {
    const attribs = el.attribs;
    if (attribs) {
      Object.keys(attribs).forEach(attr => {
        if (attr !== "href") {
          $(el).removeAttr(attr);
        }
      });
    }
  });

  return container.html() || "";
}

export async function scrapeFullArticle(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    const $ = cheerio.load(response.data);

    let articleContainer = null;

    // PIB handling
    if (url.includes("pib.gov.in")) {
      articleContainer = $(".innner-page-main-about-us");
      if (!articleContainer.length) {
        articleContainer = $(".content-area");
      }
    }

    // The Hindu
    if (!articleContainer || !articleContainer.length) {
      if (url.includes("thehindu.com")) {
        articleContainer = $("div.articlebodycontent");
        if (!articleContainer.length) {
          articleContainer = $("div#content-body-14269002");
        }
      }
    }

    // Indian Express
    if (!articleContainer || !articleContainer.length) {
      if (url.includes("indianexpress.com")) {
        articleContainer = $("div.story_details");
      }
    }

    // Fallback: main article tag
    if (!articleContainer || !articleContainer.length) {
      articleContainer = $("article");
    }

    if (!articleContainer || !articleContainer.length) {
      console.log("⚠ Could not extract main content:", url);
      return "";
    }

    const cleanedHTML = cleanHTML($, articleContainer);

    return cleanedHTML.trim();

  } catch (error) {
    console.log("⚠ Scrape failed:", url);
    return "";
  }
}
