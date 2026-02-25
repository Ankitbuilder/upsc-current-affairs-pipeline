// scripts/uploadToR2.js

const fs = require("fs");
const path = require("path");
const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

// ==============================
// Validate Required Environment Variables
// ==============================

const requiredEnv = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

// ==============================
// Create R2 Client
// ==============================

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ==============================
// Upload Function
// ==============================

async function uploadFileToR2(localFilePath, remoteKey) {
  try {
    const fileContent = fs.readFileSync(localFilePath);

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: remoteKey,
      Body: fileContent,
      ContentType: "application/json",
    });

    await r2.send(command);

    console.log(`✅ Uploaded: ${remoteKey}`);
  } catch (error) {
    console.error(`❌ Failed uploading ${remoteKey}`);
    console.error(error);
    throw error;
  }
}

// ==============================
// Upload All Data Files
// ==============================

async function uploadAllData() {
  const dataDir = path.join(__dirname, "../data");

  if (!fs.existsSync(dataDir)) {
    throw new Error("Data directory does not exist.");
  }

  const files = fs.readdirSync(dataDir);

  for (const file of files) {
    if (file.endsWith(".json")) {
      const localPath = path.join(dataDir, file);
      await uploadFileToR2(localPath, file);
    }
  }

  console.log("🎉 All files uploaded to R2 successfully.");
}

module.exports = {
  uploadAllData,
};
