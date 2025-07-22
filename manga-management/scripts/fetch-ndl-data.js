const fs = require('fs').promises;
const path = require('path');

/**
 * 国立国会図書館サーチAPIから漫画データを取得するスクリプト
 */

// 国立国会図書館サーチAPI ベースURL
const NDL_API_BASE = 'https://iss.ndl.go.jp/api/opensearch';

/**
 * 国立国会図書館サーチAPIからタイトル検索で書籍情報を取得
 * @param {string} title - 検索タイトル
 * @param {Object} options - 検索オプション
 * @returns {Promise<Object>} 検索結果
 */
async function searchBooks(title, options = {}) {
  const {
    mediatype = 1, // 図書（漫画含む）
    cnt = 20, // 取得件数（最大200）
    idx = 1, // 開始位置
    dpid = 'iss-ndl-opac' // データプロバイダ（国立国会図書館蔵書）
  } = options;

  const params = new URLSearchParams({
    title: title,
    mediatype: mediatype,
    cnt: cnt,
    idx: idx
  });
  
  // dpidを指定する場合のみ追加
  if (dpid) {
    params.set('dpid', dpid);
  }

  const url = `${NDL_API_BASE}?${params}`;
  
  console.log(`📡 Searching NDL for: "${title}"`);
  console.log(`🔗 URL: ${url}`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const xmlText = await response.text();
    console.log(`✅ Successfully fetched search results`);
    console.log(`🔍 Raw XML length: ${xmlText.length} characters`);
    
    // デバッグ用：XMLの最初の1000文字を表示
    console.log(`🔍 XML Preview:`, xmlText.substring(0, 1000));
    
    // XMLレスポンスをパース（簡単なパース）
    const items = parseNDLResponse(xmlText);
    console.log(`📚 Found ${items.length} items`);
    
    return {
      query: title,
      totalResults: items.length,
      items: items,
      rawXML: xmlText
    };
    
  } catch (error) {
    console.error('❌ Error searching NDL:', error);
    throw error;
  }
}

/**
 * NDL APIのXMLレスポンスをパースして書籍データを抽出
 * @param {string} xmlText - XML文字列
 * @returns {Array} パースされた書籍データ配列
 */
function parseNDLResponse(xmlText) {
  const items = [];
  
  // 簡単な正規表現でXMLをパース（本格的なパーサーなしで）
  const itemMatches = xmlText.match(/<item>([\s\S]*?)<\/item>/g);
  
  if (!itemMatches) return [];
  
  itemMatches.forEach(itemXml => {
    try {
      const item = {
        title: extractXmlTag(itemXml, 'title'),
        link: extractXmlTag(itemXml, 'link'),
        description: extractXmlTag(itemXml, 'description'),
        author: extractXmlTag(itemXml, 'dc:creator'),
        publisher: extractXmlTag(itemXml, 'dc:publisher'),
        date: extractXmlTag(itemXml, 'dc:date'),
        identifier: extractXmlTag(itemXml, 'dc:identifier'),
        subject: extractXmlTag(itemXml, 'dc:subject')
      };
      
      // ISBNを抽出
      if (item.identifier) {
        const isbnMatch = item.identifier.match(/978\d{10}/);
        item.isbn = isbnMatch ? isbnMatch[0] : null;
      }
      
      // 巻数を抽出
      const volumeMatch = item.title.match(/第?(\d+)巻|巻(\d+)|vol\.?(\d+)/i);
      item.volumeNumber = volumeMatch ? 
        parseInt(volumeMatch[1] || volumeMatch[2] || volumeMatch[3]) : null;
      
      items.push(item);
    } catch (error) {
      console.warn('⚠️  Error parsing item:', error);
    }
  });
  
  return items;
}

/**
 * XMLからタグの内容を抽出
 * @param {string} xml - XML文字列
 * @param {string} tag - タグ名
 * @returns {string} タグ内容
 */
function extractXmlTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * ワンピースの漫画データを検索・収集
 */
async function searchOnePieceManga() {
  console.log('🏴‍☠️ Searching One Piece manga data from NDL...\n');
  
  const searchConfigs = [
    { query: 'ワンピース', dpid: 'iss-ndl-opac' },
    { query: 'ONE PIECE', dpid: 'iss-ndl-opac' },
    { query: 'ワンピース', dpid: null }, // 全データプロバイダ
    { query: '尾田栄一郎', dpid: null }, // 作者名で検索
    { query: 'one piece', dpid: null }
  ];
  
  const allResults = [];
  
  try {
    for (const config of searchConfigs) {
      console.log(`\n🔍 Searching for: "${config.query}" (dpid: ${config.dpid || 'all'})`);
      
      const searchOptions = {
        cnt: 50, // より多くの結果を取得
        mediatype: 1 // 図書のみ
      };
      
      if (config.dpid) {
        searchOptions.dpid = config.dpid;
      }
      
      const result = await searchBooks(config.query, searchOptions);
      
      // ワンピース関連のみフィルタリング
      const filteredItems = result.items.filter(item => 
        item.title.toLowerCase().includes('one piece') ||
        item.title.includes('ワンピース') ||
        (item.title.includes('piece') && item.author.includes('尾田'))
      );
      
      console.log(`📖 Found ${filteredItems.length} One Piece related items`);
      
      allResults.push({
        query: config.query,
        dpid: config.dpid,
        results: filteredItems
      });
      
      // APIレート制限対策で少し待機
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 重複排除とソート
    const uniqueItems = [];
    const seenTitles = new Set();
    
    allResults.forEach(queryResult => {
      queryResult.results.forEach(item => {
        const key = `${item.title}-${item.identifier}`;
        if (!seenTitles.has(key)) {
          seenTitles.add(key);
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
      console.log(`   👤 著者: ${item.author || 'N/A'}`);
      console.log(`   🏢 出版社: ${item.publisher || 'N/A'}`);
      console.log(`   📅 出版年: ${item.date || 'N/A'}`);
      console.log(`   📖 ISBN: ${item.isbn || 'N/A'}`);
      if (item.volumeNumber) {
        console.log(`   📊 巻数: ${item.volumeNumber}`);
      }
      console.log('');
    });
    
    return {
      series: 'ワンピース',
      totalVolumes: uniqueItems.length,
      volumes: uniqueItems,
      searchConfigs: searchConfigs,
      fetchedAt: new Date().toISOString(),
      source: 'National Diet Library Search API'
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
    console.log('🚀 Starting NDL manga data collection...\n');
    
    // ワンピースデータを検索
    const onePieceData = await searchOnePieceManga();
    
    // JSONファイルに保存
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `onepiece-ndl-${timestamp}.json`;
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
  parseNDLResponse,
  searchOnePieceManga,
  saveToJSON
};