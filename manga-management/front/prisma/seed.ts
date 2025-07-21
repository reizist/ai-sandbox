import { PrismaClient } from '@prisma/client'
import seedData from './seed-data.json'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 データベースシードを開始します...')

  // MangaSeriesを作成
  console.log('📚 漫画シリーズを作成中...')
  const mangaSeriesMap = new Map<string, string>()
  
  for (const series of seedData.mangaSeries) {
    const createdSeries = await prisma.mangaSeries.create({
      data: {
        name: series.name,
        description: series.description,
        genres: series.genres,
      },
    })
    mangaSeriesMap.set(series.name, createdSeries.id)
    console.log(`✅ シリーズ作成: ${series.name}`)
  }

  // Magazineを作成
  console.log('📖 雑誌を作成中...')
  const magazineMap = new Map<string, string>()
  
  for (const magazine of seedData.magazines) {
    const createdMagazine = await prisma.magazine.create({
      data: {
        name: magazine.name,
        publisher: magazine.publisher,
        frequency: magazine.frequency,
      },
    })
    magazineMap.set(magazine.name, createdMagazine.id)
    console.log(`✅ 雑誌作成: ${magazine.name}`)
  }

  // MagazineIssueを作成
  console.log('📰 雑誌号を作成中...')
  const magazineIssueMap = new Map<string, string>()
  
  for (const issue of seedData.magazineIssues) {
    const magazineId = magazineMap.get(issue.magazineName)
    if (!magazineId) {
      console.error(`❌ 雑誌が見つかりません: ${issue.magazineName}`)
      continue
    }

    const createdIssue = await prisma.magazineIssue.create({
      data: {
        magazineId,
        issueNumber: issue.issueNumber,
        publicationDate: new Date(issue.publicationDate),
        coverImage: issue.coverImage,
      },
    })
    
    const key = `${issue.magazineName}-${issue.issueNumber}`
    magazineIssueMap.set(key, createdIssue.id)
    console.log(`✅ 雑誌号作成: ${issue.magazineName} ${issue.issueNumber}`)
  }

  // Mangaを作成
  console.log('📕 漫画作品を作成中...')
  const mangaMap = new Map<string, string>()
  
  for (const manga of seedData.manga) {
    const seriesId = mangaSeriesMap.get(manga.seriesName)
    
    const createdManga = await prisma.manga.create({
      data: {
        seriesId,
        originalTitle: manga.originalTitle,
        englishTitle: manga.englishTitle,
        japaneseTitle: manga.japaneseTitle,
        authors: manga.authors,
        status: manga.status,
        startDate: manga.startDate ? new Date(manga.startDate) : null,
        endDate: manga.endDate ? new Date(manga.endDate) : null,
        coverImage: manga.coverImage,
      },
    })
    mangaMap.set(manga.originalTitle, createdManga.id)
    console.log(`✅ 漫画作品作成: ${manga.originalTitle}`)
  }

  // TankobonVolumeを作成
  console.log('📗 単行本を作成中...')
  const tankobonVolumeMap = new Map<string, string>()
  
  for (const volume of seedData.tankobonVolumes) {
    const mangaId = mangaMap.get(volume.mangaTitle)
    if (!mangaId) {
      console.error(`❌ 漫画作品が見つかりません: ${volume.mangaTitle}`)
      continue
    }

    const createdVolume = await prisma.tankobonVolume.create({
      data: {
        mangaId,
        volumeNumber: volume.volumeNumber,
        title: volume.title,
        isbn: volume.isbn,
        publicationDate: new Date(volume.publicationDate),
        price: volume.price,
        coverImage: volume.coverImage,
      },
    })
    
    const key = `${volume.mangaTitle}-${volume.volumeNumber}`
    tankobonVolumeMap.set(key, createdVolume.id)
    console.log(`✅ 単行本作成: ${volume.title}`)
  }

  // Episodeを作成
  console.log('📄 エピソードを作成中...')
  
  for (const episode of seedData.episodes) {
    const mangaId = mangaMap.get(episode.mangaTitle)
    if (!mangaId) {
      console.error(`❌ 漫画作品が見つかりません: ${episode.mangaTitle}`)
      continue
    }

    const issueKey = `${episode.magazineName}-${episode.issueNumber}`
    const magazineIssueId = magazineIssueMap.get(issueKey)

    await prisma.episode.create({
      data: {
        title: episode.title,
        episodeNumber: episode.episodeNumber,
        mangaId,
        magazineIssueId,
        pageStart: episode.pageStart,
        pageEnd: episode.pageEnd,
      },
    })
    console.log(`✅ エピソード作成: ${episode.title}`)
  }

  // AffiliateLinkを作成
  console.log('🔗 アフィリエイトリンクを作成中...')
  
  for (const link of seedData.affiliateLinks) {
    const volumeKey = `${link.mangaTitle}-${link.volumeNumber}`
    const tankobonVolumeId = tankobonVolumeMap.get(volumeKey)
    if (!tankobonVolumeId) {
      console.error(`❌ 単行本が見つかりません: ${link.mangaTitle} 第${link.volumeNumber}巻`)
      continue
    }

    await prisma.affiliateLink.create({
      data: {
        tankobonVolumeId,
        platform: link.platform,
        url: link.url,
        price: link.price,
        currency: link.currency,
        isActive: link.isActive,
      },
    })
    console.log(`✅ アフィリエイトリンク作成: ${link.platform} - ${link.mangaTitle}`)
  }

  console.log('🎉 データベースシードが完了しました！')
}

main()
  .catch((e) => {
    console.error('❌ シードエラー:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })