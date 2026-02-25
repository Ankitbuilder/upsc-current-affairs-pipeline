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
  // Case 1: enclosure
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }

  // Case 2: media:content
  if (item.mediaContent && item.mediaContent.length > 0) {
    return item.mediaContent[0].$.url;
  }

  // Case 3: media:thumbnail
  if (item.mediaThumbnail && item.mediaThumbnail.length > 0) {
    return item.mediaThumbnail[0].$.url;
  }

  // Case 4: Try extracting from content HTML
  if (item.content) {
    const match = item.content.match(/<img[^>]+src="([^">]+)"/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export async function fetchRSSArticles() {
  const allArticles = [];

  for (const url of RSS_SOURCES) {
    try {
      const feed = await parser.parseURL(url);

      feed.items.slice(0, 3).forEach(item => {
        allArticles.push({
          title: item.title || "",
          link: item.link || "",
          content: item.contentSnippet || item.content || "",
          imageUrl: extractImage(item)
        });
      });

      console.log(`✅ Fetched RSS from ${url}`);
    } catch (error) {
      console.log(`⚠ Failed RSS: ${url}`);
    }
  }

  return allArticles;
}
