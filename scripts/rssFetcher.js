// scripts/rssFetcher.js

import Parser from "rss-parser";
import { RSS_SOURCES } from "./rssSources.js";

const parser = new Parser();

export async function fetchRSSArticles() {
  const allArticles = [];

  for (const url of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(url);

      feed.items.forEach(item => {
        const link = item.link || "";

        const pridMatch = link.match(/PRID=(\d+)/);

        let normalizedLink = link;

        // 🚀 Always convert to universal reg=48 URL
        if (pridMatch) {
          const prid = pridMatch[1];

          normalizedLink =
            `https://pib.gov.in/PressReleasePage.aspx?PRID=${prid}&reg=48&lang=1`;
        }

        allArticles.push({
          title: item.title || "",
          link: normalizedLink,
          content: "",
          imageUrl: null,
          pubDate: item.pubDate || null
        });
      });

      console.log(`✅ Fetched RSS from ${url}`);

    } catch (error) {
      console.log(`⚠ Failed RSS: ${url}`);
      console.log(`   ${error.message}`);
    }
  }

  console.log(
    "📰 Total PIB Articles:",
    allArticles.length
  );

  return allArticles;
}
