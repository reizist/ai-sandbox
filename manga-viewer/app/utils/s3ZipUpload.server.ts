import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { createMangaCollection, findMangaCollectionByHash } from '~/models/manga.server';
import { uploadFileToS3, generateSignedUrl } from '~/utils/s3.server';
import type { CreateMangaCollectionData } from '~/models/manga.server';

const SUPPORTED_IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];

// ファイルが有効な画像かチェック
function isValidImageFile(filename: string): boolean {
  if (filename.includes('__MACOSX/')) return false;
  if (filename.includes('/._')) return false;
  if (filename.startsWith('._')) return false;
  if (filename.includes('/.DS_Store')) return false;
  if (filename === '.DS_Store') return false;
  
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension ? SUPPORTED_IMAGE_TYPES.includes(extension) : false;
}

// 自然ソート関数
function naturalSort(a: string, b: string): number {
  const regex = /(\d+|\D+)/g;
  const aParts = a.match(regex) || [];
  const bParts = b.match(regex) || [];

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || '';
    const bPart = bParts[i] || '';

    if (/^\d+$/.test(aPart) && /^\d+$/.test(bPart)) {
      const diff = parseInt(aPart, 10) - parseInt(bPart, 10);
      if (diff !== 0) return diff;
    } else {
      if (aPart !== bPart) return aPart.localeCompare(bPart);
    }
  }
  return 0;
}

// ファイルハッシュを計算
function calculateFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

// ZIP の S3 キーを生成
function generateZipS3Key(collectionId: string, filename: string): string {
  return `manga-collections/${collectionId}/${filename}`;
}

// メタデータの S3 キーを生成
function generateMetadataS3Key(collectionId: string): string {
  return `manga-collections/${collectionId}/metadata.json`;
}

// サムネイル用の最初のページを取得してアップロード
async function uploadThumbnailFromZip(zip: JSZip, collectionId: string, imageFiles: string[]): Promise<string | undefined> {
  if (imageFiles.length === 0) return undefined;
  
  try {
    const firstImageFile = imageFiles[0];
    const zipFile = zip.files[firstImageFile];
    const imageBuffer = await zipFile.async('nodebuffer');
    
    const extension = firstImageFile.split('.').pop()?.toLowerCase() || 'jpg';
    const thumbnailKey = `manga-collections/${collectionId}/thumbnail.${extension}`;
    
    const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
    await uploadFileToS3(imageBuffer, thumbnailKey, mimeType);
    
    return thumbnailKey;
  } catch (error) {
    console.error('Error uploading thumbnail:', error);
    return undefined;
  }
}

// ZIPファイルをそのままS3にアップロードしてDBに登録
export async function processAndStoreZipFileToS3(
  file: File
): Promise<{ success: true; collectionId: string } | { success: false; error: string }> {
  try {
    console.log(`Processing ZIP file for S3 storage: ${file.name}`);
    
    // ファイルを Buffer に変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // ファイルハッシュを計算
    const fileHash = calculateFileHash(buffer);
    console.log(`File hash: ${fileHash}`);
    
    // 重複チェック
    const existingCollection = await findMangaCollectionByHash(fileHash);
    if (existingCollection) {
      console.log('Duplicate file detected');
      return { success: false, error: 'この漫画は既にアップロード済みです。' };
    }
    
    // ZIP の中身を事前に確認（ページ数とファイル名取得のため）
    const zip = new JSZip();
    const zipData = await zip.loadAsync(buffer);
    
    // 画像ファイルを取得してソート
    const allFiles = Object.keys(zipData.files).filter(filename => !zipData.files[filename].dir);
    const imageFiles = allFiles.filter(isValidImageFile).sort(naturalSort);
    
    console.log(`Found ${imageFiles.length} image files in ZIP`);
    
    if (imageFiles.length === 0) {
      return { success: false, error: 'ZIPファイル内に有効な画像ファイルが見つかりませんでした。' };
    }
    
    // コレクションIDを生成
    const collectionId = crypto.randomUUID();
    const s3KeyPrefix = `manga-collections/${collectionId}/`;
    
    console.log(`Created collection ID: ${collectionId}`);
    
    // ZIPファイル自体をS3にアップロード
    const zipS3Key = generateZipS3Key(collectionId, file.name);
    await uploadFileToS3(buffer, zipS3Key, 'application/zip');
    console.log(`Uploaded ZIP file: ${zipS3Key}`);
    
    // サムネイルをアップロード
    const thumbnailS3Key = await uploadThumbnailFromZip(zipData, collectionId, imageFiles);
    console.log(`Uploaded thumbnail: ${thumbnailS3Key}`);
    
    // ページファイル名のリストを生成（実際のファイル名を保存）
    const pageFilenames: string[] = imageFiles.map((filename, index) => {
      // パスを除去してファイル名のみを取得
      const basename = filename.split('/').pop() || filename;
      return basename;
    });
    
    // タイトルを生成（ZIPファイル名から拡張子を除去）
    const title = file.name.replace(/\.zip$/i, '');
    
    // S3メタデータを作成
    const s3Metadata = {
      collectionId,
      title,
      originalFilename: file.name,
      fileHash,
      fileSize: buffer.length,
      totalPages: pageFilenames.length,
      pageFilenames,
      uploadDate: new Date().toISOString(),
      s3KeyPrefix,
      zipS3Key, // ZIPファイルのS3キー
      thumbnailS3Key,
      storageMode: 'zip', // ZIP固定
    };
    
    const metadataKey = generateMetadataS3Key(collectionId);
    await uploadFileToS3(
      Buffer.from(JSON.stringify(s3Metadata, null, 2)),
      metadataKey,
      'application/json'
    );
    
    console.log(`Uploaded metadata: ${metadataKey}`);
    
    // データベースに登録
    const collectionData: CreateMangaCollectionData = {
      title,
      originalFilename: file.name,
      fileHash,
      fileSize: buffer.length,
      totalPages: pageFilenames.length,
      pageFilenames,
      storageType: 's3',
      storageMode: 'zip',
      s3BucketName: process.env.S3_BUCKET_NAME,
      s3KeyPrefix,
      zipS3Key,
      thumbnailS3Key,
    };
    
    const collection = await createMangaCollection(collectionData);
    console.log(`Created S3 ZIP collection: ${collection.id}`);
    
    return { success: true, collectionId: collection.id };
    
  } catch (error) {
    console.error('Error processing ZIP file for S3:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'ファイルの処理中にエラーが発生しました。' 
    };
  }
}

// S3からZIPファイルをダウンロードして画像を抽出
export async function extractImageFromS3Zip(
  collectionId: string, 
  pageIndex: number, 
  pageFilename: string
): Promise<Buffer | null> {
  try {
    // データベースからコレクション情報を取得してZIPキーを確認
    const { getMangaCollectionById } = await import('~/models/manga.server');
    const collection = await getMangaCollectionById(collectionId);
    
    if (!collection || !collection.zipS3Key) {
      console.error('Collection or ZIP S3 key not found');
      return null;
    }
    
    const zipS3Key = collection.zipS3Key;
    
    // 署名付きURLを生成してZIPファイルをダウンロード
    const signedUrl = await generateSignedUrl(zipS3Key, 300); // 5分間有効
    const zipResponse = await fetch(signedUrl);
    
    if (!zipResponse.ok) {
      console.error('Failed to download ZIP from S3');
      return null;
    }
    
    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
    
    // ZIPを展開して目的の画像を取得
    const zip = new JSZip();
    const zipData = await zip.loadAsync(zipBuffer);
    
    // ページファイル名で検索
    const allFiles = Object.keys(zipData.files).filter(filename => !zipData.files[filename].dir);
    const imageFiles = allFiles.filter(isValidImageFile).sort(naturalSort);
    
    if (pageIndex >= imageFiles.length) {
      return null;
    }
    
    const targetFile = imageFiles[pageIndex];
    const zipFile = zipData.files[targetFile];
    
    if (!zipFile) {
      return null;
    }
    
    const imageBuffer = await zipFile.async('nodebuffer');
    return imageBuffer;
    
  } catch (error) {
    console.error('Error extracting image from S3 ZIP:', error);
    return null;
  }
}