// S3 helper using AWS SDK v3
import { fromEnv } from '@aws-sdk/credential-providers';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client;

function getS3Client() {
  if (!s3Client) {
    const region = process.env.AWS_REGION;
    if (!region) throw new Error('AWS_REGION not configured');
    s3Client = new S3Client({ region, credentials: fromEnv() });
  }
  return s3Client;
}

export async function createPresignedPutUrl({ key, contentType, expiresIn = 900 }) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET not configured');
  const client = getS3Client();
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}

export function buildPublicFileUrl(key) {
  // Prefer CDN domain if provided
  const base = process.env.AWS_PUBLIC_BASE_URL;
  if (base) return `${base.replace(/\/$/, '')}/${key}`;

  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION;
  if (!bucket || !region) return undefined;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function headObject(key) {
  const bucket = process.env.AWS_S3_BUCKET;
  const client = getS3Client();
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
}

export async function createPresignedGetUrl({ key, expiresIn = 900 }) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET not configured');
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

export async function deleteObjectFromS3(key) {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) throw new Error('AWS_S3_BUCKET not configured');
  const client = getS3Client();
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await client.send(command);
}
