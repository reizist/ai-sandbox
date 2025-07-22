const fs = require('fs').promises;
const path = require('path');

/**
 * Google Books APIから漫画データを取得するスクリプト
 */

// Google Books API ベースURL
const GOOGLE_BOOKS_API_BASE = 'https://www.googleapis.com/books/v1/volumes';

/**
 * Google Books APIから書籍情報を検索
 * @param {string} query - 検索クエリ
 * @param {Object} options - 検索オプション
 * @returns {Promise<Object>} 検索結果
 */
async function searchBooks(query, options = {}) {
  const {
    maxResults = 40, // 取得件数（最大40）
    startIndex = 0, // 開始位置
    langRestrict = 'ja', // 言語制限
    printType = 'books', // 書籍のみ
    orderBy = 'relevance' // 関連度順
  } = options;

  const params = new URLSearchParams({
    q: query,
    maxResults: maxResults,
    startIndex: startIndex,
    langRestrict: langRestrict,
    printType: printType,
    orderBy: orderBy
  });

  const url = `${GOOGLE_BOOKS_API_BASE}?${params}`;
  
  console.log(`📡 Searching Google Books for: "${query}"`);
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ Successfully fetched search results`);
    console.log(`📚 Total items found: ${data.totalItems || 0}`);
    console.log(`📖 Items in this batch: ${data.items?.length || 0}`);
    
    // データを整形
    const items = data.items ? data.items.map(formatGoogleBooksData) : [];
    
    return {
      query: query,
      totalResults: data.totalItems || 0,
      items: items,
      rawResponse: data
    };
    
  } catch (error) {
    console.error('❌ Error searching Google Books:', error);
    throw error;
  }
}

/**
 * Google Books APIのレスポンスを整形
 * @param {Object} bookData - Google Books APIからの生データ
 * @returns {Object} 整形されたデータ
 */
function formatGoogleBooksData(bookData) {
  const { volumeInfo } = bookData;
  
  if (!volumeInfo) return null;
  
  // 基本情報の抽出
  const title = volumeInfo.title || '';
  const subtitle = volumeInfo.subtitle || '';
  const authors = volumeInfo.authors || [];
  const publisher = volumeInfo.publisher || '';
  const publishedDate = volumeInfo.publishedDate || '';
  const description = volumeInfo.description || '';
  const categories = volumeInfo.categories || [];
  const pageCount = volumeInfo.pageCount || null;
  const imageLinks = volumeInfo.imageLinks || {};
  const industryIdentifiers = volumeInfo.industryIdentifiers || [];
  
  // ISBN抽出
  const isbn13 = industryIdentifiers.find(id => id.type === 'ISBN_13')?.identifier;
  const isbn10 = industryIdentifiers.find(id => id.type === 'ISBN_10')?.identifier;
  
  // 巻数を抽出
  const volumeMatch = title.match(/第?(\d+)巻|巻(\d+)|vol\.?(\d+)/i);
  const volumeNumber = volumeMatch ? 
    parseInt(volumeMatch[1] || volumeMatch[2] || volumeMatch[3]) : null;
  
  return {
    // 基本情報
    id: bookData.id,
    title: title,
    subtitle: subtitle,
    fullTitle: subtitle ? `${title} ${subtitle}` : title,
    volumeNumber: volumeNumber,
    
    // 作者情報
    authors: authors.map(author => ({
      name: author,
      role: '作者'
    })),
    
    // 出版情報
    publisher: publisher,
    publishedDate: publishedDate,
    pageCount: pageCount,
    
    // カテゴリ・ジャンル
    categories: categories,
    
    // ISBN
    isbn: isbn13 || isbn10,
    isbn13: isbn13,
    isbn10: isbn10,
    
    // 画像
    thumbnail: imageLinks.thumbnail || imageLinks.smallThumbnail,
    images: imageLinks,
    
    // その他
    description: description,
    webReaderLink: volumeInfo.canonicalVolumeLink,
    
    // Google Books生データ（デバッグ用）
    rawData: bookData
  };
}

/**
 * ワンピースの漫画データを検索・収集
 */
async function searchOnePieceManga() {
  console.log('🏴‍☠️ Searching One Piece manga data from Google Books...\n');
  
  const searchQueries = [
    'ONE PIECE 尾田栄一郎',
    'ワンピース 尾田栄一郎',
    'ONE PIECE 集英社',
    'ワンピース 集英社',
    'ONE PIECE manga',
    'ワンピース 漫画'
  ];
  
  const allResults = [];
  
  try {
    for (const query of searchQueries) {
      console.log(`\n🔍 Searching for: "${query}"`);
      
      const result = await searchBooks(query, {
        maxResults: 40, // より多くの結果を取得
        langRestrict: 'ja' // 日本語に限定
      });
      
      // ワンピース関連のみフィルタリング
      const filteredItems = result.items.filter(item => {
        if (!item) return false;
        
        const titleLower = item.title.toLowerCase();
        const fullTitleLower = item.fullTitle.toLowerCase();
        const hasAuthor = item.authors.some(a => 
          a.name.includes('尾田') || a.name.includes('栄一郎')
        );
        
        return (
          titleLower.includes('one piece') ||
          titleLower.includes('ワンピース') ||
          fullTitleLower.includes('one piece') ||
          fullTitleLower.includes('ワンピース')
        ) && (hasAuthor || item.publisher.includes('集英社'));
      });
      
      console.log(`📖 Found ${filteredItems.length} One Piece related items`);
      
      allResults.push({
        query: query,
        results: filteredItems
      });
      
      // APIレート制限対策で少し待機
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 重複排除とソート
    const uniqueItems = [];
    const seenIds = new Set();
    
    allResults.forEach(queryResult => {
      queryResult.results.forEach(item => {
        const key = item.isbn || item.id || `${item.title}-${item.publishedDate}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          uniqueItems.push(item);
        }
      });
    });
    
    // 巻数でソート
    uniqueItems.sort((a, b) => {
      if (a.volumeNumber && b.volumeNumber) {
        return a.volumeNumber - b.volumeNumber;
      }
      return a.title.localeCompare(b.title);
    });
    
    console.log(`\n📚 Total unique One Piece volumes found: ${uniqueItems.length}\n`);
    
    uniqueItems.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`);
      if (item.subtitle) {
        console.log(`   📝 副題: ${item.subtitle}`);
      }
      console.log(`   👤 著者: ${item.authors.map(a => a.name).join(', ') || 'N/A'}`);
      console.log(`   🏢 出版社: ${item.publisher || 'N/A'}`);
      console.log(`   📅 出版年: ${item.publishedDate || 'N/A'}`);
      console.log(`   📖 ISBN: ${item.isbn || 'N/A'}`);
      if (item.volumeNumber) {
        console.log(`   📊 巻数: ${item.volumeNumber}`);
      }
      if (item.pageCount) {
        console.log(`   📄 ページ数: ${item.pageCount}`);
      }
      console.log('');
    });
    
    return {
      series: 'ワンピース',
      totalVolumes: uniqueItems.length,
      volumes: uniqueItems,
      searchQueries: searchQueries,
      fetchedAt: new Date().toISOString(),
      source: 'Google Books API'
    };
    
  } catch (error) {
    console.error('❌ Failed to search One Piece data:', error);
    throw error;
  }
}

/**
 * データをJSONファイルに保存
 */
async function saveToJSON(data, filename) {
  try {
    // dataディレクトリを作成
    const dataDir = path.join(__dirname, '../data');
    await fs.mkdir(dataDir, { recursive: true });
    
    const filePath = path.join(dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    console.log(`💾 Data saved to: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error('❌ Error saving data:', error);
    throw error;
  }
}

/**
 * メイン実行関数
 */
async function main() {
  try {
    console.log('🚀 Starting Google Books manga data collection...\n');
    
    // ワンピースデータを検索
    const onePieceData = await searchOnePieceManga();
    
    // JSONファイルに保存
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `onepiece-googlebooks-${timestamp}.json`;
    await saveToJSON(onePieceData, filename);
    
    console.log('\n🎉 Data collection completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Series: ${onePieceData.series}`);
    console.log(`   - Volumes found: ${onePieceData.totalVolumes}`);
    console.log(`   - Source: ${onePieceData.source}`);
    console.log(`   - File: ${filename}`);
    
  } catch (error) {
    console.error('\n💥 Data collection failed:', error);
    process.exit(1);
  }
}

// スクリプトが直接実行された場合のみmainを実行
if (require.main === module) {
  main();
}

module.exports = {
  searchBooks,
  formatGoogleBooksData,
  searchOnePieceManga,
  saveToJSON
};