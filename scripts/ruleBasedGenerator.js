// scripts/ruleBasedGenerator.js

function escapeHTML(text) {
  if (typeof text !== "string") {
    text = String(text || "");
  }

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractSentences(text, limit = 5) {
  if (typeof text !== "string" || !text.trim()) return [];

  const cleaned = text.replace(/\s+/g, " ").trim();

  const sentences = cleaned
    .split(/(?<=[.?!])\s+/)
    .filter(s => s.length > 40);

  return sentences.slice(0, limit);
}

function generatePrelimsFacts(text) {
  if (typeof text !== "string") return [];

  const facts = [];
  const words = text.split(" ");

  for (let i = 0; i < words.length; i++) {
    if (
      /\b(Act|Mission|Scheme|Policy|Agreement|Treaty|Bill|Court|Article|Commission|Authority|Tribunal|Fund|Programme|Initiative)\b/i.test(
        words[i]
      )
    ) {
      const snippet = words
        .slice(Math.max(0, i - 3), i + 4)
        .join(" ")
        .trim();

      facts.push(snippet);
    }

    if (facts.length >= 5) break;
  }

  return facts.slice(0, 5);
}

export function generateStructuredHTML(article) {
  try {
    const title =
      typeof article?.title === "string"
        ? article.title
        : String(article?.title || "");

    const content =
      typeof article?.content === "string"
        ? article.content
        : String(article?.content || "");

    const sentences = extractSentences(content, 8);
    const prelimsFacts = generatePrelimsFacts(content);

    const whyInNews =
      sentences[0] ||
      "The issue has gained attention in recent developments.";

    const background =
      sentences[1] ||
      "The issue has broader historical and policy relevance.";

    const highlights = sentences.slice(2, 5);

    const significance =
      sentences[5] ||
      "The development has implications for governance, economy, or society.";

    const challenges =
      sentences[6] ||
      "Implementation and policy challenges may arise.";

    const wayForward =
      sentences[7] ||
      "A structured and policy-driven approach may be required.";

    let html = "";

    html += `<h2>${escapeHTML(title)}</h2>`;

    html += `<h3>Why in News</h3>`;
    html += `<p>${escapeHTML(whyInNews)}</p>`;

    html += `<h3>Background</h3>`;
    html += `<p>${escapeHTML(background)}</p>`;

    html += `<h3>Key Highlights</h3>`;
    html += `<ul>`;
    highlights.forEach(h => {
      html += `<li>${escapeHTML(h)}</li>`;
    });
    html += `</ul>`;

    html += `<h3>Constitutional / Legal Provisions</h3>`;
    html += `<p>Refer to relevant constitutional articles, acts, or policy frameworks if mentioned in the article.</p>`;

    html += `<h3>Significance</h3>`;
    html += `<p>${escapeHTML(significance)}</p>`;

    html += `<h3>Challenges</h3>`;
    html += `<p>${escapeHTML(challenges)}</p>`;

    html += `<h3>Way Forward</h3>`;
    html += `<p>${escapeHTML(wayForward)}</p>`;

    html += `<h3>Prelims Facts</h3>`;
    html += `<ul>`;
    prelimsFacts.forEach(fact => {
      html += `<li>${escapeHTML(fact)}</li>`;
    });
    html += `</ul>`;

    html += `<h3>GS Paper Categorization</h3>`;
    html += `<p>To be determined based on UPSC syllabus relevance.</p>`;

    return html;
  } catch (error) {
    console.log("Rule Engine Error:", error.message);

    return `
<h3>Why in News</h3>
<p>Content processing error.</p>

<h3>Background</h3>
<p>Unable to extract structured summary.</p>
`;
  }
}
