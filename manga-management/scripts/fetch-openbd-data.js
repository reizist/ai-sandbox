const fs = require('fs').promises;
const path = require('path');

/**
 * OpenBD APIから書籍情報を取得するスクリプト
 */

// OpenBD APIベースURL
const OPENBD_API_BASE = 'https://api.openbd.jp/v1';

/**
 * 指定されたISBNの書籍情報をOpenBD APIから取得
 * @param {string|string[]} isbn - ISBN（文字列または配列）
 * @returns {Promise<Object[]>} 書籍情報の配列
 */
async function fetchBookInfo(isbn) {
  const isbnParam = Array.isArray(isbn) ? isbn.join(',') : isbn;
  const url = `${OPENBD_API_BASE}/get?isbn=${isbnParam}`;
  
  console.log(`📡 Fetching data from: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`✅ Successfully fetched ${data.length} books`);
    
    return data;
  } catch (error) {
    console.error('❌ Error fetching book data:', error);
    throw error;
  }
}

/**
 * 書籍データを整形してマンガ管理システム用の形式に変換
 * @param {Object} bookData - OpenBD APIからの生データ
 * @returns {Object} 整形されたデータ
 */
function formatBookData(bookData) {
  if (!bookData) return null;
  
  const { onix, summary, hanmoto } = bookData;
  
  // 基本情報の抽出
  const isbn = summary?.isbn || '';
  const title = summary?.title || '';
  const author = summary?.author || '';
  const publisher = summary?.publisher || '';
  const pubdate = summary?.pubdate || hanmoto?.dateshuppan || '';
  const price = onix?.ProductSupply?.SupplyDetail?.Price?.[0]?.PriceAmount || '';
  const series = summary?.series || '';
  
  // タイトルから巻数を抽出（例：「One piece 巻1」から「1」を抽出）
  const volumeMatch = title.match(/巻(\d+)|第(\d+)巻|vol\.?(\d+)/i);
  const volumeNumber = volumeMatch ? 
    parseInt(volumeMatch[1] || volumeMatch[2] || volumeMatch[3]) : null;
  
  // サブタイトルの抽出
  const subtitle = onix?.CollateralDetail?.TextContent?.[0]?.Text || '';
  
  return {
    // 基本情報
    isbn: isbn,
    title: title,
    originalTitle: title,
    subtitle: subtitle,
    volumeNumber: volumeNumber,
    
    // 作者情報
    authors: author ? [{
      name: author.replace(/,\s*\d{4}-?/, '').replace(/,/g, ''),
      role: '作者'
    }] : [],
    
    // 出版情報
    publisher: publisher,
    series: series,
    publicationDate: pubdate,
    price: price ? parseFloat(price) : null,
    
    // OpenBD生データ（デバッグ用）
    rawData: bookData
  };
}

/**
 * ワンピースの複数巻の情報を取得
 */
async function fetchOnePieceVolumes() {
  console.log('🏴‍☠️ Fetching One Piece manga data...\n');
  
  // ワンピースの既知のISBN（1-5巻）- 正しいISBNに修正
  const onePieceISBNs = [
    '9784088725093', // 1巻 - ROMANCE DAWN -冒険の夜明け-
    '9784088725441', // 2巻 - VERSUS!! バギー海賊団
    '9784088725697', // 3巻 - 偽れぬもの
    '9784088725948', // 4巻 - 三日月
    '9784088726197', // 5巻 - 誰が為に鐘は鳴る
  ];
  
  try {
    // APIから複数巻の情報を一括取得
    const booksData = await fetchBookInfo(onePieceISBNs);
    
    // データを整形
    const formattedBooks = booksData
      .filter(book => book !== null) // null要素を除外
      .map(formatBookData)
      .filter(book => book !== null); // 整形に失敗したものを除外
    
    console.log(`\n📚 Successfully processed ${formattedBooks.length} volumes:\n`);
    
    formattedBooks.forEach(book => {
      console.log(`  📖 ${book.title} (${book.isbn})`);
      console.log(`     💰 価格: ¥${book.price || 'N/A'}`);
      console.log(`     📅 発行日: ${book.publicationDate || 'N/A'}`);
      console.log('');
    });
    
    return {
      series: 'ワンピース',
      totalVolumes: formattedBooks.length,
      volumes: formattedBooks,
      fetchedAt: new Date().toISOString(),
      source: 'OpenBD API'
    };
    
  } catch (error) {
    console.error('❌ Failed to fetch One Piece data:', error);
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
    console.log('🚀 Starting OpenBD data collection...\n');
    
    // ワンピースデータを取得
    const onePieceData = await fetchOnePieceVolumes();
    
    // JSONファイルに保存
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `onepiece-openbd-${timestamp}.json`;
    await saveToJSON(onePieceData, filename);
    
    console.log('\n🎉 Data collection completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Series: ${onePieceData.series}`);
    console.log(`   - Volumes collected: ${onePieceData.totalVolumes}`);
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
  fetchBookInfo,
  formatBookData,
  fetchOnePieceVolumes,
  saveToJSON
};