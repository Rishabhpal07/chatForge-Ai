/** S3-compatible storage (MinIO locally, R2/S3 in prod). Presigned uploads. */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucket = process.env.S3_BUCKET ?? "chatforge-uploads";

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
});

/** Build a tenant-namespaced storage key. */
export function buildStorageKey(parts: {
  tenantId: string;
  botId: string;
  sourceId: string;
  filename: string;
}): string {
  const safe = parts.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${parts.tenantId}/${parts.botId}/${parts.sourceId}/${safe}`;
}

export async function presignUpload(
  storageKey: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ContentType: contentType,
  });
  return getSignedUrl(client, cmd, { expiresIn });
}
