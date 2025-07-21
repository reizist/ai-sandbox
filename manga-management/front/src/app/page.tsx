'use client'

import { trpc } from '@/lib/trpc'
import Link from 'next/link'
import { useState } from 'react'

// プレースホルダーコンポーネント
function CoverImagePlaceholder() {
  return (
    <div className="w-full h-48 bg-gradient-to-br from-slate-700 to-slate-600 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-500">
      <div className="text-center text-slate-400">
        <div className="relative">
          <svg className="w-16 h-16 mx-auto mb-3 opacity-60" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs">?</span>
          </div>
        </div>
        <p className="text-sm font-medium">表紙画像なし</p>
        <p className="text-xs text-slate-500 mt-1">No Cover Available</p>
      </div>
    </div>
  )
}

// カバー画像コンポーネント
function CoverImage({ src, alt, className }: { src?: string, alt: string, className?: string }) {
  const [hasError, setHasError] = useState(false)
  
  if (!src || hasError) {
    return <CoverImagePlaceholder />
  }
  
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  )
}

export default function HomePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])

  const { data: mangaList, isLoading, error } = trpc.manga.search.useQuery({
    query: activeQuery || undefined,
    genres: selectedGenres.length > 0 ? selectedGenres : undefined,
    limit: 20,
    offset: 0,
  })

  const handleSearch = () => {
    setActiveQuery(searchQuery)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const { data: seriesList } = trpc.manga.getSeries.useQuery()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-32 w-32 border-4 border-slate-600 border-t-purple-500 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">📚</span>
            </div>
          </div>
          <p className="mt-6 text-slate-300 text-lg font-medium">データを読み込み中...</p>
          <p className="mt-2 text-slate-500 text-sm">漫画データベースを準備しています</p>
          <div className="flex justify-center mt-4 space-x-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce delay-100"></div>
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce delay-200"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="bg-slate-800/80 backdrop-blur-sm border border-red-500/30 rounded-2xl p-8">
            <div className="text-6xl mb-4">💀</div>
            <h2 className="text-xl font-bold text-red-400 mb-2">エラーが発生しました</h2>
            <p className="text-slate-300 mb-4">システムに問題が発生しています</p>
            <div className="bg-slate-900/50 rounded-lg p-3 mb-4">
              <p className="text-red-300 text-sm font-mono">{error.message}</p>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-2 bg-gradient-to-r from-red-600 to-pink-600 text-white font-medium rounded-lg hover:from-red-700 hover:to-pink-700 transition-all duration-200"
            >
              🔄 リロード
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-10 opacity-20">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
          <div className="absolute top-0 right-1/4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
          <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-500"></div>
        </div>
      </div>
      
      {/* Header */}
      <header className="relative bg-slate-800/90 backdrop-blur-sm border-b border-purple-500/20 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                  Manga Database
                </h1>
                <p className="text-slate-300 text-sm mt-1">🎌 オタクのための漫画情報データベース</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-2">
              <span className="text-slate-400 text-sm">v1.0</span>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Search Section */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-slate-800/80 backdrop-blur-sm border border-purple-500/30 rounded-2xl shadow-2xl p-6 mb-8">
          <div className="flex items-center mb-4">
            <h2 className="text-xl font-semibold text-white flex items-center">
              <span className="mr-2">🔍</span>
              検索
            </h2>
            <div className="ml-auto flex space-x-1">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="漫画タイトルを検索... (例: ジョジョ, ワンピース)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-4 py-3 bg-slate-700 border-2 border-slate-600 text-white placeholder-slate-400 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/20 transition-all duration-300"
              />
              <div className="absolute right-3 top-3 text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <button 
              onClick={handleSearch}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 focus:outline-none focus:ring-4 focus:ring-purple-500/50 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              <span className="flex items-center">
                ⚡ 検索
              </span>
            </button>
          </div>
        </div>

        {/* Series Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
            <span className="mr-3">📚</span>
            漫画シリーズ
            <div className="ml-3 px-3 py-1 bg-purple-600/20 text-purple-300 text-sm rounded-full border border-purple-500/30">
              {seriesList?.length || 0}シリーズ
            </div>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {seriesList?.map((series) => (
              <div key={series.id} className="group bg-slate-800/60 backdrop-blur-sm border border-purple-500/20 rounded-2xl shadow-xl hover:shadow-2xl hover:border-purple-400/40 transition-all duration-300 overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xl font-semibold text-white group-hover:text-purple-300 transition-colors">
                      {series.name}
                    </h3>
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                      <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                      <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                    </div>
                  </div>
                  <p className="text-slate-300 mb-4 line-clamp-3 text-sm leading-relaxed">
                    {series.description}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(series.genres as string[]).map((genre) => (
                      <span
                        key={genre}
                        className="px-3 py-1 bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-200 text-xs rounded-full border border-purple-500/30 hover:from-purple-600/40 hover:to-pink-600/40 transition-all duration-200"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-400">
                      📖 作品数: <span className="text-cyan-300 font-semibold">{series.manga.length}</span>件
                    </div>
                    <Link
                      href={`/series/${series.id}`}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
                    >
                      詳細 →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manga List Section */}
        <div>
          <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
            <span className="mr-3">🎌</span>
            漫画作品
            {mangaList?.total && (
              <div className="ml-3 px-3 py-1 bg-cyan-600/20 text-cyan-300 text-sm rounded-full border border-cyan-500/30">
                {mangaList.total}作品
              </div>
            )}
          </h2>
          {mangaList?.results && mangaList.results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {mangaList.results.map((manga) => (
                <div key={manga.id} className="group bg-slate-800/60 backdrop-blur-sm border border-cyan-500/20 rounded-2xl shadow-xl hover:shadow-2xl hover:border-cyan-400/40 transition-all duration-300 overflow-hidden">
                  <div className="p-4">
                    <div className="mb-4 relative overflow-hidden rounded-xl">
                      <CoverImage
                        src={manga.volumes[0]?.coverImage}
                        alt={`${manga.originalTitle} 表紙`}
                        className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                    
                    <h3 className="text-lg font-semibold mb-2 text-white line-clamp-2 group-hover:text-cyan-300 transition-colors">
                      {manga.originalTitle}
                    </h3>
                    
                    {manga.series && (
                      <p className="text-sm text-slate-400 mb-2 flex items-center">
                        <span className="mr-1">📗</span>
                        シリーズ: <span className="text-purple-300 ml-1">{manga.series.name}</span>
                      </p>
                    )}
                    
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`px-3 py-1 text-xs rounded-full font-medium ${
                          manga.status === 'ongoing'
                            ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                            : 'bg-slate-600/20 text-slate-300 border border-slate-500/30'
                        }`}
                      >
                        {manga.status === 'ongoing' ? '📈 連載中' : '✅ 完結'}
                      </span>
                    </div>
                    
                    {(manga.authors as any[]).length > 0 && (
                      <p className="text-sm text-slate-400 mb-3 flex items-center">
                        <span className="mr-1">✍️</span>
                        <span className="text-pink-300">
                          {(manga.authors as any[]).map(a => a.name).join(', ')}
                        </span>
                      </p>
                    )}
                    
                    <Link
                      href={`/manga/${manga.id}`}
                      className="inline-block w-full text-center px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-cyan-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
                    >
                      📖 詳細を見る
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="bg-slate-800/60 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-8 max-w-md mx-auto">
                <div className="text-6xl mb-4">🔍</div>
                <p className="text-slate-300 text-lg mb-2">漫画作品が見つかりませんでした</p>
                <p className="text-slate-500 text-sm">検索キーワードを変更してお試しください</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}