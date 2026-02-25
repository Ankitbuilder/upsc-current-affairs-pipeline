// scripts/hybridGenerator.js

import axios from "axios";
import { generateStructuredHTML } from "./ruleBasedGenerator.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile"";

/* ===============================
   HTML VALIDATION
================================ */
function isValidHTML(output) {
  if (!output) return false;
  if (output.includes("```")) return false;
  if (!output.includes("<h3>Why in News</h3>")) return false;
  if (!output.includes("<h3>Background</h3>")) return false;
  if (!output.includes("<h3>Key Highlights</h3>")) return false;
  if (!output.includes("<h3>Prelims Facts</h3>")) return false;
  return true;
}

/* ===============================
   SAFE PROMPT BUILDER
   (Prevents token overflow)
================================ */
function buildPrompt(article) {
  const MAX_CHARS = 12000; // prevent token overflow

  const safeContent =
    article.content && article.content.length > MAX_CHARS
      ? article.content.slice(0, MAX_CHARS)
      : article.content || "";

  return `
Generate structured UPSC Current Affairs content in clean HTML format only.

Do NOT include markdown.
Do NOT include explanation outside HTML.
Return only valid HTML.

Structure:

<h3>Why in News</h3>
<h3>Background</h3>
<h3>Key Highlights</h3>
<h3>Constitutional / Legal Provisions</h3>
<h3>Significance</h3>
<h3>Challenges</h3>
<h3>Way Forward</h3>
<h3>Prelims Facts</h3>
<h3>GS Paper Categorization</h3>

Article Title:
${article.title || ""}

Article Content:
${safeContent}
`;
}

/* ===============================
   HYBRID GENERATOR
================================ */
export async function generateHybridHTML(article) {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    // If key missing → directly fallback
    if (!apiKey) {
      console.log("⚠ GROQ_API_KEY not found. Using rule engine.");
      return generateStructuredHTML(article);
    }

    const response = await axios.post(
      GROQ_API_URL,
      {
        model: MODEL,
        messages: [
          {
            role: "user",
            content: buildPrompt(article)
          }
        ],
        temperature: 0.3
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 45000 // increased from 15000 → prevents timeout failures
      }
    );

    const output =
      response?.data?.choices?.[0]?.message?.content || "";

    if (isValidHTML(output)) {
      return output.trim();
    }

    console.log("⚠ Groq returned invalid HTML. Using rule engine fallback.");
    return generateStructuredHTML(article);

  } catch (error) {
    console.log("⚠ Groq API failed:");
    console.log(
      error?.response?.data ||
      error?.message ||
      "Unknown Groq error"
    );

    console.log("Using rule engine fallback.");
    return generateStructuredHTML(article);
  }
}
