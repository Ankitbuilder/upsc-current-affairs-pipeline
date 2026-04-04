// testMinistry.js
import axios from "axios";
import * as cheerio from "cheerio";

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function extractMinistry($) {
  const headline =
    cleanText($("h2").first().text()) ||
    cleanText($("h1").first().text()) ||
    cleanText($(".ReleaseTitle, .ReleaseTitleTxt").first().text());

  const candidates = [];

  $("body *").each((_, el) => {
    const $el = $(el);
    const text = cleanText($el.text());

    if (!text) return;
    if (text === headline) return;
    if (text.length < 3 || text.length > 120) return;
    if (/^posted on[:\s]/i.test(text)) return;
    if (/^home$/i.test(text)) return;
    if (/facebook|twitter|whatsapp|linkedin/i.test(text)) return;

    const hasChildren = $el.children().length > 0;
    if (hasChildren) return;

    const style = ($el.attr("style") || "").toLowerCase();
    const cls = ($el.attr("class") || "").toLowerCase();

    const looksCentered =
      style.includes("text-align:center") ||
      cls.includes("text-center") ||
      cls.includes("center");

    if (looksCentered) {
      candidates.push(text);
    }
  });

  if (candidates.length > 0) {
    return candidates[0];
  }

  const headingEl = $("h2").first().length ? $("h2").first() : $("h1").first();

  if (headingEl.length) {
    const prevCandidates = headingEl
      .prevAll()
      .toArray()
      .map((el) => cleanText($(el).text()))
      .filter(
        (text) =>
          text &&
          text.length >= 3 &&
          text.length <= 120 &&
          !/^posted on[:\s]/i.test(text) &&
          !/facebook|twitter|whatsapp|linkedin/i.test(text)
      );

    if (prevCandidates.length > 0) {
      return prevCandidates[0];
    }
  }

  return "";
}

async function test() {
  const url =
    "https://pib.gov.in/PressReleasePage.aspx?PRID=2280530";

  const { data } = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
    },
  });

  const $ = cheerio.load(data);

  const ministry = extractMinistry($);
  const headline =
    cleanText($("h2").first().text()) ||
    cleanText($("h1").first().text()) ||
    cleanText($(".ReleaseTitle, .ReleaseTitleTxt").first().text());

  console.log("MINISTRY:", ministry);
  console.log("HEADLINE:", headline);
}

test().catch(console.error);
