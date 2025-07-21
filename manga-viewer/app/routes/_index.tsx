import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useState, useCallback } from "react";
import { useNavigate, useLoaderData } from "@remix-run/react";
import { getAllMangaCollections, getRecentlyReadMangaCollections } from "~/models/manga.server";

export const meta: MetaFunction = () => {
  return [
    { title: "漫画ビューワ" },
    { name: "description", content: "S3対応ZIP漫画ビューワ" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  const allCollections = await getAllMangaCollections();
  const recentlyRead = await getRecentlyReadMangaCollections(5);
  
  return json({
    collections: allCollections,
    recentlyRead,
  });
}

export default function Index() {
  const navigate = useNavigate();
  const { collections, recentlyRead } = useLoaderData<typeof loader>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log('Uploading files:', files.map(f => f.name));
      
      for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.zip')) continue;
        
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload-manga', {
          method: 'POST',
          body: formData,
        });
        
        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'アップロードに失敗しました');
        }
        
        console.log('Upload successful:', result);
        
        // 最初のファイルのアップロード完了後、ビューワに遷移
        if (result.success && result.collectionId) {
          navigate(`/viewer/${result.collectionId}`);
          return;
        }
      }
      
      // すべてアップロード完了後、ページをリロード
      window.location.reload();
      
    } catch (err) {
      console.error('Error uploading files:', err);
      setError(err instanceof Error ? err.message : 'ファイルのアップロード中にエラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  }, [navigate]);

  const handleFileInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    handleFileSelect(files);
  }, [handleFileSelect]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* ヘッダー */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            S3漫画ビューワ
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            ZIPファイルをS3に直接アップロード・管理・閲覧
          </p>
        </div>

        {/* アップロードエリア */}
        <div className="max-w-md mx-auto space-y-4">
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
            <div className="space-y-4">
              <div className="mx-auto w-12 h-12 text-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              
              <div>
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                    ZIPファイルを選択
                  </span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".zip"
                    onChange={handleFileInput}
                    disabled={isLoading}
                  />
                </label>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  漫画ZIPファイルをS3に直接アップロード
                </p>
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-2">アップロード中...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}
        </div>

        {/* 最近読んだ漫画 */}
        {recentlyRead.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">最近読んだ漫画</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {recentlyRead.map((collection) => (
                <MangaCard key={collection.id} collection={collection} />
              ))}
            </div>
          </div>
        )}

        {/* 全ての漫画 */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            全ての漫画 ({collections.length}冊)
          </h2>
          {collections.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                まだ漫画がアップロードされていません。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {collections.map((collection) => (
                <MangaCard key={collection.id} collection={collection} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 漫画カードコンポーネント
function MangaCard({ collection }: { collection: any }) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    navigate(`/viewer/${collection.id}`);
  };
  
  const progress = collection.totalPages > 0 
    ? Math.round((collection.lastPageRead / collection.totalPages) * 100) 
    : 0;
    
  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={handleClick}
    >
      <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-t-lg flex items-center justify-center">
        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      
      <div className="p-3">
        <h3 className="font-medium text-gray-900 dark:text-white truncate" title={collection.title}>
          {collection.title}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {collection.totalPages}ページ
        </p>
        
        {collection.lastPageRead > 0 && (
          <div className="mt-2">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>進捗: {progress}%</span>
              <span>{collection.lastPageRead}/{collection.totalPages}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
              <div 
                className="bg-blue-600 h-1 rounded-full" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        
        <p className="text-xs text-gray-400 mt-2">
          {new Date(collection.uploadDate).toLocaleDateString('ja-JP')}
        </p>
      </div>
    </div>
  );
}