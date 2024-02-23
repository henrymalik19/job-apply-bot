import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3 } from "aws-sdk";
import cronParser from "cron-parser";
import crypto from "node:crypto";
import fs from "node:fs";

import {
  AWS_S3_ACCESS_KEY_ID,
  AWS_S3_ENDPOINT,
  AWS_S3_REGION,
  AWS_S3_SECRET_ACCESS_KEY,
  ENCRYPTION,
} from "./constants";

async function scrollToBottom(el: SVGElement | HTMLElement) {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < el.scrollHeight; i += 100) {
    el.scrollTo(0, i);
    await delay(100);
  }
}

function getNextDateFromCron(cronExpression) {
  try {
    const interval = cronParser.parseExpression(cronExpression);
    return interval.next().toDate();
  } catch (err) {
    console.error("Error parsing cron expression:", err);
  }
}

async function getStorageStateContents(platformName: string, userId: number) {
  try {
    const s3client = new S3Client({
      forcePathStyle: true,
      region: AWS_S3_REGION,
      endpoint: AWS_S3_ENDPOINT,
      credentials: {
        accessKeyId: AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: AWS_S3_SECRET_ACCESS_KEY,
      },
    });
    const res = await s3client.send(
      new GetObjectCommand({
        Bucket: "storage-states",
        Key: `${platformName}/${userId}-storage-state.json`,
      }),
    );

    const storageStateString = await res.Body?.transformToString();

    return storageStateString ? storageStateString : null;
  } catch {
    return null;
  }
}

async function getStorageStatePresignedUrl(
  platformName: string,
  userId: number,
) {
  const s3client = new S3Client({
    forcePathStyle: true,
    region: AWS_S3_REGION,
    endpoint: AWS_S3_ENDPOINT,
    credentials: {
      accessKeyId: AWS_S3_ACCESS_KEY_ID,
      secretAccessKey: AWS_S3_SECRET_ACCESS_KEY,
    },
  });

  const command = new PutObjectCommand({
    Bucket: "storage-states",
    Key: `${platformName}/2-storage-state.json`,
  });
  const url = await getSignedUrl(s3client, command, { expiresIn: 3600 });

  return url;
}

function encrypt(text) {
  let cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION.KEY),
    ENCRYPTION.IV,
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return {
    iv: ENCRYPTION.IV.toString("hex"),
    encryptedData: encrypted.toString("hex"),
  };
}

function decrypt(text: string) {
  let encryptedText = Buffer.from(text, "hex");
  let decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION.KEY),
    ENCRYPTION.IV,
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

async function uploadFile(filePath: string) {
  const s3 = new S3({
    credentials: {
      accessKeyId: AWS_S3_ACCESS_KEY_ID,
      secretAccessKey: AWS_S3_SECRET_ACCESS_KEY,
    },
  });

  const fileName = filePath.split("/").slice(-1)[0];
  const params = {
    Bucket: "storage-states",
    Key: fileName,
    Body: fs.createReadStream(filePath),
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.info("[error] Error uploading storageState:", err);
    } else {
      console.info(
        "[info] StorageState uploaded successfully. File location:",
        data.Location,
      );
    }
  });
}

export {
  getNextDateFromCron,
  scrollToBottom,
  getStorageStateContents,
  getStorageStatePresignedUrl,
  encrypt,
  decrypt,
  uploadFile,
};
