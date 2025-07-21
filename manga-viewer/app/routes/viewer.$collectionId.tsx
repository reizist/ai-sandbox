import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, Link } from "@remix-run/react";
import { useState, useEffect, useCallback } from "react";
import { getMangaCollectionById, updateReadingProgress } from "~/models/manga.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data?.collection?.title ? `${data.collection.title} - 漫画ビューワ` : "漫画ビューワ" },
    { name: "description", content: "S3対応ZIP漫画ビューワ" },
  ];
};

export async function loader({ params }: LoaderFunctionArgs) {
  const { collectionId } = params;
  
  if (!collectionId) {
    throw new Response("Collection ID is required", { status: 400 });
  }
  
  const collection = await getMangaCollectionById(collectionId);
  
  if (!collection) {
    throw new Response("Manga collection not found", { status: 404 });
  }
  
  return json({ collection });
}

export default function Viewer() {
  const navigate = useNavigate();
  const { collection } = useLoaderData<typeof loader>();
  const [currentPage, setCurrentPage] = useState(collection.lastPageRead || 0);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // キーボードナビゲーション
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          goToPreviousPage();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
        case ' ':
          event.preventDefault();
          goToNextPage();
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          toggleFullscreen();
          break;
        case 'Escape':
          if (isFullscreen) {
            setIsFullscreen(false);
          } else {
            navigate('/');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentPage, collection.totalPages, isFullscreen, navigate]);

  // 読書進捗の更新
  useEffect(() => {
    const updateProgress = async () => {
      try {
        await fetch(`/api/update-progress`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            collectionId: collection.id,
            pageNumber: currentPage,
          }),
        });
      } catch (error) {
        console.error('Failed to update reading progress:', error);
      }
    };

    if (currentPage > collection.lastPageRead) {
      updateProgress();
    }
  }, [currentPage, collection.id, collection.lastPageRead]);

  const goToNextPage = useCallback(() => {
    if (currentPage < collection.totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  }, [currentPage, collection.totalPages]);

  const goToPreviousPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  }, [currentPage]);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const handleImageLoad = () => {
    setIsImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setIsImageLoading(false);
    setImageError(true);
  };

  const handleImageClick = (event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const isRightHalf = clickX > rect.width / 2;
    
    if (isRightHalf) {
      goToNextPage();
    } else {
      goToPreviousPage();
    }
  };

  const progress = collection.totalPages > 0 
    ? Math.round(((currentPage + 1) / collection.totalPages) * 100) 
    : 0;

  return (
    <div className={`min-h-screen bg-black text-white ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* ヘッダー (フルスクリーン時は非表示) */}
      {!isFullscreen && (
        <div className="bg-gray-900 border-b border-gray-700 p-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                to="/"
                className="text-blue-400 hover:text-blue-300 flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                ライブラリに戻る
              </Link>
              <h1 className="text-xl font-semibold truncate">{collection.title}</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">
                {currentPage + 1} / {collection.totalPages} ({progress}%)
              </span>
              <button
                onClick={toggleFullscreen}
                className="p-2 text-gray-400 hover:text-white"
                title="フルスクリーン (F)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>
          
          {/* プログレスバー */}
          <div className="max-w-6xl mx-auto mt-2">
            <div className="w-full bg-gray-700 rounded-full h-1">
              <div 
                className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* メイン画像表示エリア */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative max-w-full max-h-full">
          {/* ローディング表示 */}
          {isImageLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-lg">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
          
          {/* エラー表示 */}
          {imageError && (
            <div className="bg-gray-800 rounded-lg p-8 text-center">
              <p className="text-red-400 mb-4">画像の読み込みに失敗しました</p>
              <button 
                onClick={() => {
                  setImageError(false);
                  setIsImageLoading(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
              >
                再試行
              </button>
            </div>
          )}
          
          {/* 画像 */}
          {!imageError && (
            <img
              src={`/api/extract-zip-image/${collection.id}/${currentPage}`}
              alt={`${collection.title} - ページ ${currentPage + 1}`}
              className="max-w-full max-h-[80vh] object-contain cursor-pointer select-none"
              onLoad={handleImageLoad}
              onError={handleImageError}
              onClick={handleImageClick}
              draggable={false}
            />
          )}
        </div>
      </div>

      {/* ナビゲーションボタン (フルスクリーン時のみ表示) */}
      {isFullscreen && (
        <>
          {/* 左矢印 */}
          {currentPage > 0 && (
            <button
              onClick={goToPreviousPage}
              className="fixed left-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 p-3 rounded-full"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          
          {/* 右矢印 */}
          {currentPage < collection.totalPages - 1 && (
            <button
              onClick={goToNextPage}
              className="fixed right-4 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-75 p-3 rounded-full"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          
          {/* フルスクリーン終了 */}
          <button
            onClick={() => setIsFullscreen(false)}
            className="fixed top-4 right-4 bg-black bg-opacity-50 hover:bg-opacity-75 p-2 rounded"
            title="フルスクリーン終了 (ESC)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          {/* ページ情報表示 */}
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 px-4 py-2 rounded">
            {currentPage + 1} / {collection.totalPages}
          </div>
        </>
      )}

      {/* 下部ナビゲーション (フルスクリーン時は非表示) */}
      {!isFullscreen && (
        <div className="bg-gray-900 border-t border-gray-700 p-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 0}
              className="flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 rounded"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              前のページ
            </button>
            
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-1">
                キーボードショートカット: ← → (ナビゲーション), F (フルスクリーン), ESC (戻る)
              </p>
              <p className="text-sm text-gray-400">
                画像クリック: 左半分 (前へ), 右半分 (次へ)
              </p>
            </div>
            
            <button
              onClick={goToNextPage}
              disabled={currentPage === collection.totalPages - 1}
              className="flex items-center px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 rounded"
            >
              次のページ
              <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}