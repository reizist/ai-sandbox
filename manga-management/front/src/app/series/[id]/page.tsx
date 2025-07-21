'use client'

import { trpc } from '@/lib/trpc'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { useState } from 'react'

// カバー画像コンポーネント
function CoverImage({ src, alt, className }: { src?: string, alt: string, className?: string }) {
  const [hasError, setHasError] = useState(false)
  
  if (!src || hasError) {
    return (
      <div className={`bg-gradient-to-br from-slate-700 to-slate-600 rounded-xl flex items-center justify-center border-2 border-dashed border-slate-500 ${className}`}>
        <div className="text-center text-slate-400">
          <div className="relative">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-60" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">?</span>
            </div>
          </div>
          <p className="text-xs font-medium">画像なし</p>
        </div>
      </div>
    )
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

export default function SeriesDetailPage({ params }: { params: { id: string } }) {
  const { data: series, isLoading, error } = trpc.manga.getSeriesById.useQuery({ id: params.id })

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
          <p className="mt-6 text-slate-300 text-lg font-medium">シリーズ情報を読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error || !series) {
    return notFound()
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
          <div className="flex items-center py-4">
            <Link
              href="/"
              className="flex items-center text-slate-300 hover:text-purple-400 transition-colors mr-4"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              戻る
            </Link>
            <div className="flex items-center space-x-4">
              <div className="p-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl">
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                  Series Detail
                </h1>
                <p className="text-slate-400 text-sm">📂 シリーズ詳細情報</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Series Header */}
        <div className="bg-slate-800/80 backdrop-blur-sm border border-purple-500/30 rounded-2xl shadow-2xl p-8 mb-8">
          <div className="text-center mb-6">
            <h1 className="text-4xl font-bold text-white mb-4">
              {series.name}
            </h1>
            
            {/* Genres */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {(series.genres as string[]).map((genre) => (
                <span
                  key={genre}
                  className="px-3 py-1 bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-purple-200 text-sm rounded-full border border-purple-500/30 hover:from-purple-600/40 hover:to-pink-600/40 transition-all duration-200"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* Description */}
            {series.description && (
              <p className="text-slate-300 text-lg leading-relaxed max-w-3xl mx-auto">
                {series.description}
              </p>
            )}

            {/* Stats */}
            <div className="flex justify-center items-center mt-6 space-x-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-300">
                  {series.manga?.length || 0}
                </div>
                <div className="text-slate-400 text-sm">作品数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-pink-300">
                  {series.manga?.reduce((total, manga) => total + (manga.volumes?.length || 0), 0) || 0}
                </div>
                <div className="text-slate-400 text-sm">総巻数</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-300">
                  {series.manga?.reduce((total, manga) => total + (manga.episodes?.length || 0), 0) || 0}
                </div>
                <div className="text-slate-400 text-sm">総話数</div>
              </div>
            </div>
          </div>
        </div>

        {/* Series Manga */}
        {series.manga && series.manga.length > 0 && (
          <div className="bg-slate-800/80 backdrop-blur-sm border border-cyan-500/30 rounded-2xl shadow-2xl p-6">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <span className="mr-3">📖</span>
              このシリーズの作品
              <div className="ml-3 px-3 py-1 bg-cyan-600/20 text-cyan-300 text-sm rounded-full border border-cyan-500/30">
                {series.manga.length}作品
              </div>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {series.manga.map((manga) => (
                <Link
                  key={manga.id}
                  href={`/manga/${manga.id}`}
                  className="group bg-slate-700/50 rounded-xl p-4 border border-slate-600/50 hover:border-cyan-500/50 hover:bg-slate-700/70 transition-all duration-300"
                >
                  <div className="flex space-x-4">
                    {/* Cover */}
                    <div className="flex-shrink-0">
                      <CoverImage
                        src={manga.volumes?.[0]?.coverImage}
                        alt={`${manga.originalTitle} 表紙`}
                        className="w-16 h-20 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium mb-1 line-clamp-2 group-hover:text-cyan-300 transition-colors">
                        {manga.originalTitle}
                      </h3>
                      
                      {/* Status */}
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded-full font-medium mb-2 ${
                          manga.status === 'ongoing'
                            ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                            : 'bg-slate-600/20 text-slate-300 border border-slate-500/30'
                        }`}
                      >
                        {manga.status === 'ongoing' ? '📈 連載中' : '✅ 完結'}
                      </span>

                      {/* Authors */}
                      {(manga.authors as any[]).length > 0 && (
                        <p className="text-slate-400 text-sm mb-2">
                          ✍️ {(manga.authors as any[]).map(a => a.name).join(', ')}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center space-x-4 text-xs text-slate-400">
                        {manga.episodes && manga.episodes.length > 0 && (
                          <span>📄 {manga.episodes.length}話</span>
                        )}
                        {manga.volumes && manga.volumes.length > 0 && (
                          <span>📚 {manga.volumes.length}巻</span>
                        )}
                      </div>

                      {/* Dates */}
                      {manga.startDate && (
                        <p className="text-slate-500 text-xs mt-1">
                          📅 {new Date(manga.startDate).toLocaleDateString('ja-JP')}
                          {manga.endDate && ` - ${new Date(manga.endDate).toLocaleDateString('ja-JP')}`}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Hover Effect */}
                  <div className="mt-3 text-right">
                    <span className="text-cyan-400 text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      詳細を見る →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!series.manga || series.manga.length === 0) && (
          <div className="text-center py-16">
            <div className="bg-slate-800/60 backdrop-blur-sm border border-purple-500/20 rounded-2xl p-8 max-w-md mx-auto">
              <div className="text-6xl mb-4">📚</div>
              <p className="text-slate-300 text-lg mb-2">このシリーズに作品がありません</p>
              <p className="text-slate-500 text-sm">作品が追加されるまでお待ちください</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}