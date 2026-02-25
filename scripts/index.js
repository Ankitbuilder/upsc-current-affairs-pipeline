import fs from "fs";

async function run() {
  console.log("UPSC Pipeline Started...");

  const today = new Date().toISOString().split("T")[0];

  if (!fs.existsSync("./data")) {
    fs.mkdirSync("./data");
  }

  const sample = [
    {
      title: "Pipeline Setup Test",
      source: "System",
      publishedAt: today,
      whyInNews: "Testing pipeline initialization.",
      background: "Initial setup validation.",
      keyHighlights: ["Structure ready", "JSON format validated"],
      constitutionalProvisions: "N/A",
      significance: "Ensures backend works.",
      challenges: "None",
      wayForward: "Proceed with next build steps.",
      prelimsFacts: ["Automation enabled"],
      gsPaper: "GS2",
      mcqs: [
        {
          question: "What is being tested?",
          options: [
            "A. Flutter UI",
            "B. Backend pipeline",
            "C. Database migration",
            "D. Hosting server"
          ],
          answer: "B"
        }
      ]
    }
  ];

  fs.writeFileSync(`./data/${today}.json`, JSON.stringify(sample, null, 2));
  fs.writeFileSync("./data/dates.json", JSON.stringify([today], null, 2));

  console.log("Test JSON generated successfully.");
}

run();
