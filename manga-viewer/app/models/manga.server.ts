import { prisma } from '~/lib/db.server';
import type { MangaCollection } from '@prisma/client';

export type { MangaCollection };
export { prisma };

// ページファイル名配列の型定義
export type PageFilenames = string[];

// 漫画コレクション作成用の型
export interface CreateMangaCollectionData {
  title: string;
  originalFilename: string;
  fileHash: string;
  fileSize: number;
  totalPages: number;
  pageFilenames: PageFilenames;
  coverImagePath?: string;
  tags?: string[];
  description?: string;
  // S3関連フィールド
  storageType?: 's3';
  s3BucketName?: string;
  s3KeyPrefix?: string;
  thumbnailS3Key?: string;
  zipS3Key?: string; // ZIPファイルのS3キー
  storageMode?: 'zip'; // ZIPファイル固定
}

// 漫画コレクションを作成
export async function createMangaCollection(data: CreateMangaCollectionData): Promise<MangaCollection> {
  return prisma.mangaCollection.create({
    data: {
      title: data.title,
      originalFilename: data.originalFilename,
      fileHash: data.fileHash,
      fileSize: data.fileSize,
      totalPages: data.totalPages,
      pageFilenames: JSON.stringify(data.pageFilenames),
      coverImagePath: data.coverImagePath,
      tags: data.tags ? JSON.stringify(data.tags) : null,
      description: data.description,
      storageType: 's3',
      storageMode: 'zip',
      s3BucketName: data.s3BucketName,
      s3KeyPrefix: data.s3KeyPrefix,
      zipS3Key: data.zipS3Key,
      thumbnailS3Key: data.thumbnailS3Key,
      isSynced: true,
      lastSyncDate: new Date(),
    },
  });
}

// すべての漫画コレクションを取得（最新順）
export async function getAllMangaCollections(): Promise<MangaCollection[]> {
  return prisma.mangaCollection.findMany({
    orderBy: { uploadDate: 'desc' },
  });
}

// IDで漫画コレクションを取得
export async function getMangaCollectionById(id: string): Promise<MangaCollection | null> {
  return prisma.mangaCollection.findUnique({
    where: { id },
  });
}

// ファイルハッシュで漫画コレクションを検索（重複チェック用）
export async function findMangaCollectionByHash(fileHash: string): Promise<MangaCollection | null> {
  return prisma.mangaCollection.findUnique({
    where: { fileHash },
  });
}

// ファイルハッシュで漫画コレクションを検索（S3 sync用）
export async function getMangaCollectionByFileHash(fileHash: string): Promise<MangaCollection | null> {
  return prisma.mangaCollection.findUnique({
    where: { fileHash },
  });
}

// 読書進捗を更新
export async function updateReadingProgress(
  id: string,
  lastPageRead: number,
  lastReadDate: Date = new Date()
): Promise<MangaCollection> {
  return prisma.mangaCollection.update({
    where: { id },
    data: {
      lastPageRead,
      lastReadDate,
      updatedAt: new Date(),
    },
  });
}

// 漫画コレクションを削除
export async function deleteMangaCollection(id: string): Promise<MangaCollection> {
  return prisma.mangaCollection.delete({
    where: { id },
  });
}

// タイトルで検索
export async function searchMangaCollectionsByTitle(query: string): Promise<MangaCollection[]> {
  return prisma.mangaCollection.findMany({
    where: {
      title: {
        contains: query,
      },
    },
    orderBy: { uploadDate: 'desc' },
  });
}

// 読みかけの漫画を取得
export async function getInProgressMangaCollections(): Promise<MangaCollection[]> {
  return prisma.mangaCollection.findMany({
    where: {
      AND: [
        { lastPageRead: { gt: 0 } },
        { lastPageRead: { lt: prisma.mangaCollection.fields.totalPages } },
      ],
    },
    orderBy: { lastReadDate: 'desc' },
  });
}

// 最近読んだ漫画を取得
export async function getRecentlyReadMangaCollections(limit: number = 10): Promise<MangaCollection[]> {
  return prisma.mangaCollection.findMany({
    where: {
      lastReadDate: { not: null },
    },
    orderBy: { lastReadDate: 'desc' },
    take: limit,
  });
}

// ページファイル名配列をパース
export function parsePageFilenames(pageFilenames: string): PageFilenames {
  try {
    return JSON.parse(pageFilenames);
  } catch {
    return [];
  }
}

// タグ配列をパース
export function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

// S3メタデータから漫画コレクションを作成
export async function createMangaCollectionFromS3(s3Metadata: any): Promise<MangaCollection> {
  return prisma.mangaCollection.create({
    data: {
      id: s3Metadata.collectionId,
      title: s3Metadata.title,
      originalFilename: s3Metadata.originalFilename,
      fileHash: s3Metadata.fileHash,
      fileSize: s3Metadata.fileSize,
      totalPages: s3Metadata.totalPages,
      pageFilenames: JSON.stringify(s3Metadata.pageFilenames),
      uploadDate: new Date(s3Metadata.uploadDate),
      storageType: 's3',
      storageMode: 'zip',
      s3BucketName: process.env.S3_BUCKET_NAME,
      s3KeyPrefix: s3Metadata.s3KeyPrefix,
      zipS3Key: s3Metadata.zipS3Key,
      thumbnailS3Key: s3Metadata.thumbnailS3Key,
      isSynced: true,
      lastSyncDate: new Date(),
    },
  });
}