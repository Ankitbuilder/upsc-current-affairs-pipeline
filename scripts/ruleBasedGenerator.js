// scripts/ruleBasedGenerator.js

function escapeHTML(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractSentences(text, limit = 5) {
  if (!text) return [];
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .filter(s => s.length > 40);
  return sentences.slice(0, limit);
}

function generatePrelimsFacts(text) {
  const facts = [];
  const words = text.split(" ");

  for (let i = 0; i < words.length; i++) {
    if (words[i].match(/\b(Act|Mission|Scheme|Policy|Agreement|Treaty|Bill|Court|Article|Commission)\b/i)) {
      const snippet = words.slice(Math.max(0, i - 3), i + 4).join(" ");
      facts.push(snippet.trim());
    }
    if (facts.length >= 5) break;
  }

  return facts.slice(0, 5);
}

export function generateStructuredHTML(article) {
  const title = escapeHTML(article.title || "");
  const content = article.content || "";

  const sentences = extractSentences(content, 8);
  const prelimsFacts = generatePrelimsFacts(content);

  const whyInNews = sentences[0] || "This issue has gained importance in recent developments.";
  const background = sentences[1] || "The issue has historical and policy relevance.";
  const highlights = sentences.slice(2, 4);
  const significance = sentences[4] || "The issue has broader implications for governance and policy.";
  const challenges = sentences[5] || "Implementation challenges remain in addressing this issue.";
  const wayForward = sentences[6] || "A coordinated and policy-driven approach is required.";

  let html = "";

  html += `<h2>${title}</h2>`;

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
  html += `<p>Relevant constitutional provisions, acts, or policy frameworks may apply depending on context.</p>`;

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
  html += `<p>Category determined based on syllabus relevance.</p>`;

  return html;
}
