// scripts/rssFetcher.js

import Parser from "rss-parser";
import { RSS_SOURCES } from "./rssSources.js";

const parser = new Parser({
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }]
    ]
  }
});

function extractImage(item) {
  if (item.enclosure?.url) {
    return item.enclosure.url;
  }

  if (item.mediaContent?.length > 0) {
    return item.mediaContent[0].$.url;
  }

  if (item.mediaThumbnail?.length > 0) {
    return item.mediaThumbnail[0].$.url;
  }

  if (item.content) {
    const match = item.content.match(/<img[^>]+src="([^">]+)"/);
    if (match) return match[1];
  }

  return null;
}

export async function fetchRSSArticles() {
  const allArticles = [];

  for (const url of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(url);

      if (feed.items?.length > 0) {
        feed.items.forEach(item => {
          allArticles.push({
            title: item.title || "",
            link: item.link || "",
            content: "", // 🔥 DO NOT USE RSS SNIPPET
            imageUrl: extractImage(item)
          });
        });
      }

      console.log(`✅ Fetched RSS from ${url}`);
    } catch (error) {
      console.log(`⚠ Failed RSS: ${url}`);
    }
  }

  return allArticles;
}
