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
            <svg className="w-16 h-16 mx-auto mb-3 opacity-60" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">?</span>
            </div>
          </div>
          <p className="text-sm font-medium">表紙画像なし</p>
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

export default function MangaDetailPage({ params }: { params: { id: string } }) {
  const { data: manga, isLoading, error } = trpc.manga.getById.useQuery({ id: params.id })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-32 w-32 border-4 border-slate-600 border-t-purple-500 mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">📖</span>
            </div>
          </div>
          <p className="mt-6 text-slate-300 text-lg font-medium">漫画詳細を読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error || !manga) {
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
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
                  Manga Detail
                </h1>
                <p className="text-slate-400 text-sm">📚 漫画詳細情報</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Cover & Basic Info */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/80 backdrop-blur-sm border border-purple-500/30 rounded-2xl shadow-2xl p-6 sticky top-8">
              {/* Cover Image */}
              <div className="mb-6">
                <CoverImage
                  src={manga.volumes[0]?.coverImage}
                  alt={`${manga.originalTitle} 表紙`}
                  className="w-full h-80 object-cover rounded-xl shadow-lg"
                />
              </div>

              {/* Basic Info */}
              <div className="space-y-4">
                {/* Status */}
                <div className="flex justify-center">
                  <span
                    className={`px-4 py-2 rounded-full font-medium text-sm ${
                      manga.status === 'ongoing'
                        ? 'bg-green-600/20 text-green-300 border border-green-500/30'
                        : 'bg-slate-600/20 text-slate-300 border border-slate-500/30'
                    }`}
                  >
                    {manga.status === 'ongoing' ? '📈 連載中' : '✅ 完結'}
                  </span>
                </div>

                {/* Authors */}
                {(manga.authors as any[]).length > 0 && (
                  <div className="text-center">
                    <h3 className="text-slate-400 text-sm mb-2">✍️ 作者</h3>
                    <div className="space-y-1">
                      {(manga.authors as any[]).map((author, index) => (
                        <div key={index} className="text-pink-300 font-medium">
                          {author.name}
                          {author.role && (
                            <span className="text-slate-400 text-sm ml-2">({author.role})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4 text-center">
                  {manga.startDate && (
                    <div>
                      <h3 className="text-slate-400 text-xs mb-1">開始日</h3>
                      <p className="text-cyan-300 text-sm font-medium">
                        {new Date(manga.startDate).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  )}
                  {manga.endDate && (
                    <div>
                      <h3 className="text-slate-400 text-xs mb-1">終了日</h3>
                      <p className="text-cyan-300 text-sm font-medium">
                        {new Date(manga.endDate).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  )}
                </div>

                {/* Series Link */}
                {manga.series && (
                  <div className="text-center pt-4 border-t border-slate-700">
                    <Link
                      href={`/series/${manga.series.id}`}
                      className="inline-block px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
                    >
                      📚 シリーズ: {manga.series.name}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Detailed Info */}
          <div className="lg:col-span-2 space-y-8">
            {/* Title Section */}
            <div className="bg-slate-800/80 backdrop-blur-sm border border-purple-500/30 rounded-2xl shadow-2xl p-6">
              <h1 className="text-3xl font-bold text-white mb-4">
                {manga.originalTitle}
              </h1>
              
              {/* Alternative Titles */}
              <div className="space-y-2">
                {manga.englishTitle && (
                  <p className="text-slate-300">
                    <span className="text-slate-400">🇺🇸 English:</span> {manga.englishTitle}
                  </p>
                )}
                {manga.japaneseTitle && manga.japaneseTitle !== manga.originalTitle && (
                  <p className="text-slate-300">
                    <span className="text-slate-400">🇯🇵 Japanese:</span> {manga.japaneseTitle}
                  </p>
                )}
              </div>
            </div>

            {/* Episodes Section */}
            {manga.episodes && manga.episodes.length > 0 && (
              <div className="bg-slate-800/80 backdrop-blur-sm border border-cyan-500/30 rounded-2xl shadow-2xl p-6">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <span className="mr-3">📄</span>
                  エピソード
                  <div className="ml-3 px-3 py-1 bg-cyan-600/20 text-cyan-300 text-sm rounded-full border border-cyan-500/30">
                    {manga.episodes.length}話
                  </div>
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto custom-scrollbar">
                  {manga.episodes.map((episode) => (
                    <div key={episode.id} className="bg-slate-700/50 rounded-xl p-4 border border-slate-600/50 hover:border-cyan-500/50 transition-all duration-200">
                      <div className="flex items-start justify-between mb-2">
                        <span className="text-cyan-300 font-semibold text-sm">
                          第{episode.episodeNumber}話
                        </span>
                        {episode.magazineIssue && (
                          <span className="text-slate-400 text-xs bg-slate-600/50 px-2 py-1 rounded">
                            {episode.magazineIssue.magazine?.name}
                          </span>
                        )}
                      </div>
                      <h3 className="text-white font-medium text-sm mb-2 line-clamp-2">
                        {episode.title}
                      </h3>
                      {episode.pageStart && episode.pageEnd && (
                        <p className="text-slate-400 text-xs">
                          📖 {episode.pageStart}-{episode.pageEnd}ページ
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Volumes Section */}
            {manga.volumes && manga.volumes.length > 0 && (
              <div className="bg-slate-800/80 backdrop-blur-sm border border-pink-500/30 rounded-2xl shadow-2xl p-6">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                  <span className="mr-3">📚</span>
                  単行本
                  <div className="ml-3 px-3 py-1 bg-pink-600/20 text-pink-300 text-sm rounded-full border border-pink-500/30">
                    {manga.volumes.length}巻
                  </div>
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {manga.volumes.map((volume) => (
                    <div key={volume.id} className="bg-slate-700/50 rounded-xl p-4 border border-slate-600/50 hover:border-pink-500/50 transition-all duration-200">
                      <div className="flex items-start space-x-4">
                        {/* Volume Cover */}
                        <div className="flex-shrink-0">
                          <CoverImage
                            src={volume.coverImage}
                            alt={`${volume.title} 表紙`}
                            className="w-16 h-20 object-cover rounded-lg"
                          />
                        </div>
                        
                        {/* Volume Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium mb-1 line-clamp-2">
                            第{volume.volumeNumber}巻
                          </h3>
                          <p className="text-slate-300 text-sm mb-2 line-clamp-1">
                            {volume.title}
                          </p>
                          
                          {volume.publicationDate && (
                            <p className="text-slate-400 text-xs mb-2">
                              📅 {new Date(volume.publicationDate).toLocaleDateString('ja-JP')}
                            </p>
                          )}
                          
                          {volume.isbn && (
                            <p className="text-slate-400 text-xs mb-3">
                              📖 ISBN: {volume.isbn}
                            </p>
                          )}
                          
                          {/* Affiliate Links */}
                          {volume.affiliateLinks && volume.affiliateLinks.length > 0 && (
                            <div className="space-y-2">
                              {volume.affiliateLinks.map((link) => (
                                <a
                                  key={link.id}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-green-600 to-blue-600 text-white text-xs font-medium rounded-lg hover:from-green-700 hover:to-blue-700 transition-all duration-200 shadow-sm mr-2"
                                >
                                  🛒 {link.platform}
                                  {link.price && (
                                    <span className="ml-1">¥{link.price}</span>
                                  )}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(51, 65, 85, 0.5);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.5);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.7);
        }
      `}</style>
    </div>
  )
}