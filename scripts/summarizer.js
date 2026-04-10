import "dotenv/config";
import fs from "fs";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data");

const CF_ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim();
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN?.trim();
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim();

function stripHtml(html) {
  const $ = cheerio.load(html || "");
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function getDeepSummary(text, headline, providers) {
  let cleanText = stripHtml(text);
  const words = cleanText.split(/\s+/).filter(w => w.length > 0);
  
  const slicedText = words.slice(0, 1000).join(" ");
  const targetWords = Math.max(Math.floor(words.length / 3), 200);

  const prompt = `Provide a DETAILED UPSC study note. 
  Sections: 1. CONTEXT, 2. KEY FEATURES, 3. SIGNIFICANCE, 4. UPSC RELEVANCE.
  LENGTH: ~${targetWords} words. 
  ARTICLE: ${slicedText}`;

  for (const p of providers) {
    if (!p.active) continue;
    
    try {
      let output = null;

      // ==========================================
      // 1. OPENROUTER 
      // ==========================================
      if (p.id === 'OpenRouter') {
        const res = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
          // 🚀 FIX 1: Updated to the active Llama 3.1 model
          model: "mistralai/mistral-7b-instruct:free", 
          messages: [{ role: "user", content: prompt }],
        }, { 
          headers: { 
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": "https://github.com/ankitbuilder/upsc-current-affairs-pipeline", 
            "X-Title": "UPSC Pipeline" 
          }, 
          timeout: 35000 
        });
        output = res.data.choices?.[0]?.message?.content;
      }

      // ==========================================
      // 2. GROQ (The Fast Fallback)
      // ==========================================
      else if (p.id === 'Groq') {
        const res = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1000
        }, { headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, timeout: 30000 });
        output = res.data.choices?.[0]?.message?.content;
      }

      // ==========================================
      // 3. CLOUDFLARE (The Reliable Backup)
      // ==========================================
      else if (p.id === 'Cloudflare') {
        const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;
        const res = await axios.post(url, { prompt, max_tokens: 1000 }, {
          headers: { Authorization: `Bearer ${CF_API_TOKEN}` }, timeout: 40000
        });
        output = res.data.result?.response;
      }

      // ==========================================
      // 4. GEMINI NATIVE (The Last Resort)
      // ==========================================
      else if (p.id === 'Gemini') {
        // 🚀 FIX 2: Reverted to the exact 2.0 model your project is authorized for
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-001:generateContent?key=${GEMINI_API_KEY}`;
        
        let attempts = 3;
        while (attempts > 0) {
          try {
            const res = await axios.post(url, {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1000, temperature: 0.3 }
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 35000 });
            
            output = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
            break; 
            
          } catch (error) {
            const statusCode = error.response?.status;
            if ((statusCode === 503 || statusCode === 429) && attempts > 1) {
              console.log(`   ⏳ Gemini rate-limited (${statusCode}). Hard reset for 65 seconds...`);
              await new Promise(r => setTimeout(r, 65000));
              attempts--;
            } else {
              throw error; 
            }
          }
        }
      }

      if (output && output.length > 200) {
        console.log(`⚡ Success via ${p.id}`);
        return output.replace(/^(Here is a summary|Here's a study note|.*summarizing:)/i, "").trim();
      }

    } catch (e) {
      const status = e.response?.status || e.status || 'Error';
      const detail = e.response?.data?.error?.message || e.message;
      console.warn(`⚠️ ${p.id} failed (${status})`);
      
      if (status === 429 && detail?.includes("tokens per day")) {
        console.log(`🛑 ${p.id} daily quota exhausted. Deactivating for remainder of this run.`);
        p.active = false;
      }
    }
  }
  
  return null;
}

async function runSummarizer() {
  console.log("🤖 Starting Ultimate Quad-Model Pipeline (OpenRouter Llama 3.1 Edition)...");
  
  const providers = [
    { id: 'OpenRouter', active: !!OPENROUTER_API_KEY },
    { id: 'Groq', active: !!GROQ_API_KEY },
    { id: 'Cloudflare', active: !!CF_API_TOKEN && !!CF_ACCOUNT_ID },
    { id: 'Gemini', active: !!GEMINI_API_KEY }
  ];

  const startTime = Date.now();
  const MAX_RUNTIME = 330 * 60 * 1000; 

  const allFiles = fs.readdirSync(dataDir).filter(f => f.endsWith(".json")).sort().reverse();
  
  let consecutiveFails = 0;
  let haltPipeline = false;

  for (const file of allFiles) {
    if (haltPipeline) break;

    const filePath = path.join(dataDir, file);
    let data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    let modified = false;

    for (let item of data) {
      if (Date.now() - startTime > MAX_RUNTIME) {
        console.log("⏳ 5.5 Hour limit reached. Initiating graceful shutdown...");
        haltPipeline = true;
        break; 
      }
      if (haltPipeline) break;

      if (!item.fullText && item.summaryText) item.fullText = item.summaryText;

      const isPlaceholder = item.summaryText === item.fullText;
      const isBroken = item.summaryText && (item.summaryText.includes("<p>") || item.summaryText.length < 350);

      if ((!item.summaryText || isPlaceholder || isBroken) && item.fullText) {
        
        const noise = ["condoles", "grief", "tribute", "congratulates", "greets", "warm wishes", "passed away"];
        if (noise.some(word => item.headline?.toLowerCase().includes(word))) {
          item.summaryText = stripHtml(item.fullText).substring(0, 400) + "...";
          modified = true;
          continue;
        }

        console.log(`Summarizing: ${item.headline?.substring(0, 40)}...`);
        const summary = await getDeepSummary(item.fullText, item.headline || "", providers);
        
        if (summary) {
          item.summaryText = summary;
          modified = true;
          consecutiveFails = 0; 
        } else {
          consecutiveFails++;
          console.log(`❌ ALL Active Models Failed. Strike ${consecutiveFails}/4`);
          
          if (consecutiveFails >= 4) {
            console.error("🛑 CRITICAL: All API quotas are fully exhausted or blocked.");
            console.error("🛑 Tripping Circuit Breaker to save progress and exit.");
            haltPipeline = true;
          }
        }

        if (!haltPipeline) {
          await new Promise(r => setTimeout(r, 6000));
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`✅ Progress Saved: ${file}`);
    }
  }
  
  if (haltPipeline) {
    console.log("💤 Pipeline paused safely. GitHub Action will commit and upload data.");
  } else {
    console.log("🎉 All historical files completely summarized!");
  }
}

runSummarizer();
