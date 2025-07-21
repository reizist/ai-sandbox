import type { LoaderFunctionArgs } from "@remix-run/node";
import { getMangaCollectionById, parsePageFilenames } from "~/models/manga.server";
import { extractImageFromS3Zip } from "~/utils/s3ZipUpload.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { collectionId, pageIndex } = params;
  
  if (!collectionId || !pageIndex) {
    return new Response("Missing parameters", { status: 400 });
  }
  
  const pageNum = parseInt(pageIndex, 10);
  if (isNaN(pageNum) || pageNum < 0) {
    return new Response("Invalid page index", { status: 400 });
  }
  
  try {
    // データベースからコレクション情報を取得
    const collection = await getMangaCollectionById(collectionId);
    if (!collection) {
      return new Response("Collection not found", { status: 404 });
    }
    
    // ZIPモードでない場合はエラー（現在は全てZIPモード）
    if (collection.storageMode !== 'zip') {
      return new Response("Not a ZIP collection", { status: 400 });
    }
    
    const pageFilenames = parsePageFilenames(collection.pageFilenames);
    if (pageNum >= pageFilenames.length) {
      return new Response("Page not found", { status: 404 });
    }
    
    const pageFilename = pageFilenames[pageNum];
    
    // S3からZIPを取得して画像を抽出
    const imageBuffer = await extractImageFromS3Zip(collectionId, pageNum, pageFilename);
    
    if (!imageBuffer) {
      return new Response("Failed to extract image from ZIP", { status: 500 });
    }
    
    // MIME タイプを設定
    const extension = pageFilename.split('.').pop()?.toLowerCase();
    let contentType = 'image/jpeg'; // デフォルト
    
    switch (extension) {
      case 'png':
        contentType = 'image/png';
        break;
      case 'gif':
        contentType = 'image/gif';
        break;
      case 'bmp':
        contentType = 'image/bmp';
        break;
      case 'webp':
        contentType = 'image/webp';
        break;
    }
    
    // レスポンスを返す
    return new Response(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': imageBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // 1時間キャッシュ（ZIPから抽出するため短めに）
      },
    });
    
  } catch (error) {
    console.error('Error extracting image from ZIP:', error);
    return new Response("Internal server error", { status: 500 });
  }
}