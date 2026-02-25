// scripts/uploadToR2.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Needed for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate environment variables
const requiredEnv = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Create R2 client
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Upload single file
async function uploadFile(localPath, remoteKey) {
  const fileContent = fs.readFileSync(localPath);

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: remoteKey,
    Body: fileContent,
    ContentType: "application/json",
  });

  await r2.send(command);
  console.log(`✅ Uploaded: ${remoteKey}`);
}

// Upload all JSON files in /data
export async function uploadAllData() {
  const dataDir = path.join(__dirname, "../data");

  if (!fs.existsSync(dataDir)) {
    throw new Error("Data directory does not exist.");
  }

  const files = fs.readdirSync(dataDir);

  for (const file of files) {
    if (file.endsWith(".json")) {
      const fullPath = path.join(dataDir, file);
      await uploadFile(fullPath, file);
    }
  }

  console.log("🎉 All files uploaded to R2 successfully.");
}
