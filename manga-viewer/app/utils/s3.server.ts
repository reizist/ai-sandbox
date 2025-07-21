import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// S3クライアントの初期化
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || '';

export interface S3UploadResult {
  key: string;
  url: string;
  size: number;
}

/**
 * ファイルをS3にアップロード
 */
export async function uploadFileToS3(
  buffer: Buffer,
  key: string,
  contentType: string = 'application/octet-stream'
): Promise<S3UploadResult> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  });

  await s3Client.send(command);

  const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
  
  return {
    key,
    url,
    size: buffer.length,
  };
}

/**
 * S3から署名付きURLを生成（プライベートファイル用）
 */
export async function generateSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * S3のファイル一覧を取得
 */
export async function listS3Objects(prefix: string = ''): Promise<Array<{key: string, lastModified: Date, size: number}>> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  
  return (response.Contents || []).map(item => ({
    key: item.Key || '',
    lastModified: item.LastModified || new Date(),
    size: item.Size || 0,
  }));
}

/**
 * S3からファイルを削除
 */
export async function deleteS3Object(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * 漫画コレクション用のS3キーを生成
 */
export function generateMangaS3Key(collectionId: string, filename: string): string {
  return `manga-collections/${collectionId}/pages/${filename}`;
}

/**
 * サムネイル用のS3キーを生成
 */
export function generateThumbnailS3Key(collectionId: string): string {
  return `manga-collections/${collectionId}/thumbnail.jpg`;
}

/**
 * メタデータ用のS3キーを生成
 */
export function generateMetadataS3Key(collectionId: string): string {
  return `manga-collections/${collectionId}/metadata.json`;
}

/**
 * 公開URL生成（CDN対応）
 */
export function getPublicUrl(key: string): string {
  const cdnUrl = process.env.CDN_BASE_URL;
  if (cdnUrl) {
    return `${cdnUrl}/${key}`;
  }
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}