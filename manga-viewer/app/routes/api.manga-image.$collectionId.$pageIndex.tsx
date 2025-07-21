import type { LoaderFunctionArgs } from "@remix-run/node";
import { getMangaCollectionById, parsePageFilenames } from "~/models/manga.server";

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
    
    const pageFilenames = parsePageFilenames(collection.pageFilenames);
    if (pageNum >= pageFilenames.length) {
      return new Response("Page not found", { status: 404 });
    }
    
    // ZIPから動的抽出APIにリダイレクト
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `/api/extract-zip-image/${collectionId}/${pageNum}`,
        'Cache-Control': 'public, max-age=3600',
      },
    });
    
  } catch (error) {
    console.error('Error serving manga image:', error);
    return new Response("Internal server error", { status: 500 });
  }
}