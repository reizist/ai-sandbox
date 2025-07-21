import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      {/* Animated background pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -inset-10 opacity-20">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
          <div className="absolute top-0 right-1/4 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000"></div>
          <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-500"></div>
        </div>
      </div>

      <div className="relative text-center max-w-md mx-auto p-8">
        <div className="bg-slate-800/80 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-8">
          {/* 404 Animation */}
          <div className="mb-6">
            <div className="text-8xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent mb-2">
              404
            </div>
            <div className="text-4xl mb-4">😅</div>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">
            ページが見つかりません
          </h1>
          <p className="text-slate-300 mb-6">
            お探しのページは存在しないか、移動された可能性があります
          </p>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              href="/"
              className="inline-block w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-105 transition-all duration-200 shadow-lg"
            >
              🏠 ホームに戻る
            </Link>
            
            <button
              onClick={() => window.history.back()}
              className="inline-block w-full px-6 py-3 bg-slate-700 text-slate-300 font-medium rounded-lg hover:bg-slate-600 hover:text-white transition-all duration-200"
            >
              ⬅️ 前のページに戻る
            </button>
          </div>

          {/* Fun fact */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <p className="text-slate-400 text-sm">
              💡 ヒント: 漫画のタイトルで検索してみてください
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}