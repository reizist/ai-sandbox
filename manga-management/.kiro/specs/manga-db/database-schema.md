# データベーススキーマ - ER図

## Mermaid ER図

```mermaid
erDiagram
    MangaSeries {
        string id PK
        string name "シリーズ名"
        string description "シリーズ説明"
        json genres "JSON配列"
        datetime createdAt
        datetime updatedAt
    }

    Manga {
        string id PK
        string seriesId FK
        string originalTitle
        string englishTitle
        string japaneseTitle
        json authors "JSON配列"
        string status "連載状況"
        datetime startDate
        datetime endDate
        string coverImage
        datetime createdAt
        datetime updatedAt
    }

    Episode {
        string id PK
        string title
        int episodeNumber
        string mangaId FK
        string magazineIssueId FK
        string tankobonVolumeId FK
        int pageStart
        int pageEnd
        datetime createdAt
        datetime updatedAt
    }

    Magazine {
        string id PK
        string name
        string publisher
        string frequency "刊行頻度"
        datetime createdAt
        datetime updatedAt
    }

    MagazineIssue {
        string id PK
        string magazineId FK
        string issueNumber "号数"
        datetime publicationDate
        string coverImage
        datetime createdAt
        datetime updatedAt
    }

    TankobonVolume {
        string id PK
        string mangaId FK
        int volumeNumber
        string title
        string isbn
        datetime publicationDate
        decimal price
        string coverImage
        datetime createdAt
        datetime updatedAt
    }

    AffiliateLink {
        string id PK
        string tankobonVolumeId FK
        string platform "Amazon/BookWalker等"
        string url
        decimal price
        string currency
        boolean isActive
        datetime createdAt
        datetime updatedAt
    }

    %% リレーション
    MangaSeries ||--o{ Manga : "contains manga works"
    Manga ||--o{ Episode : "has episodes"
    Manga ||--o{ TankobonVolume : "has volumes"
    
    Magazine ||--o{ MagazineIssue : "has issues"
    MagazineIssue ||--o{ Episode : "contains episodes"
    
    TankobonVolume ||--o{ Episode : "collects episodes"
    TankobonVolume ||--o{ AffiliateLink : "has affiliate links"
```

## データフロー図

```mermaid
flowchart TD
    A[漫画シリーズ<br/>MangaSeries] --> B[漫画作品<br/>Manga]
    B --> C[エピソード<br/>Episode]
    D[雑誌<br/>Magazine] --> E[雑誌号<br/>MagazineIssue]
    E --> C
    B --> F[単行本巻<br/>TankobonVolume]
    C --> F
    F --> G[アフィリエイトリンク<br/>AffiliateLink]
    
    %% スタイリング
    classDef series fill:#e1f5fe
    classDef manga fill:#f8bbd9
    classDef episode fill:#f3e5f5
    classDef magazine fill:#e8f5e8
    classDef tankobon fill:#fff3e0
    classDef affiliate fill:#fce4ec
    
    class A series
    class B manga
    class C episode
    class D,E magazine
    class F tankobon
    class G affiliate
```

## 主要なデータ関係

### 1. 漫画情報の流れ
```
漫画シリーズ → 漫画作品 → エピソード → 雑誌掲載 → 単行本収録 → アフィリエイト
```

### 2. 検索の観点
- **シリーズ検索**: MangaSeries.name
- **作者検索**: Manga.authors (JSON配列)
- **ジャンル検索**: MangaSeries.genres (JSON配列)  
- **年代検索**: Manga.startDate
- **雑誌検索**: Magazine.name → MagazineIssue → Episode

### 3. アフィリエイト収益
- TankobonVolume → AffiliateLink（複数プラットフォーム対応）

## JSON フィールド構造例

### MangaSeries.authors
```json
[
  {
    "name": "尾田栄一郎",
    "role": "作者"
  },
  {
    "name": "田中真弓", 
    "role": "作画協力"
  }
]
```

### MangaSeries.genres
```json
[
  "少年漫画",
  "冒険", 
  "バトル",
  "コメディ"
]
```

## インデックス設計

```sql
-- 検索最適化
CREATE GIN INDEX idx_manga_series_genres ON MangaSeries USING gin(genres);
CREATE INDEX idx_manga_status ON Manga(status);
CREATE INDEX idx_manga_start_date ON Manga(startDate);
CREATE GIN INDEX idx_manga_authors ON Manga USING gin(authors);

-- 関係性最適化
CREATE INDEX idx_manga_series ON Manga(seriesId);
CREATE INDEX idx_episode_manga ON Episode(mangaId, episodeNumber);
CREATE INDEX idx_episode_magazine_issue ON Episode(magazineIssueId);
CREATE INDEX idx_tankobon_manga ON TankobonVolume(mangaId, volumeNumber);
CREATE INDEX idx_affiliate_tankobon ON AffiliateLink(tankobonVolumeId);
```

## テーブル作成例 (Prisma Schema)

```prisma
model MangaSeries {
  id              String    @id @default(cuid())
  name            String
  description     String?
  genres          Json      // JSON配列
  
  manga           Manga[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Manga {
  id              String    @id @default(cuid())
  seriesId        String?
  originalTitle   String
  englishTitle    String?
  japaneseTitle   String?
  authors         Json      // JSON配列
  status          String    @default("ongoing")
  startDate       DateTime?
  endDate         DateTime?
  coverImage      String?
  
  series          MangaSeries? @relation(fields: [seriesId], references: [id])
  episodes        Episode[]
  volumes         TankobonVolume[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([seriesId])
  @@index([status])
  @@index([startDate])
}

model Episode {
  id              String    @id @default(cuid())
  title           String
  episodeNumber   Int
  mangaId         String
  magazineIssueId String?
  tankobonVolumeId String?
  pageStart       Int?
  pageEnd         Int?
  
  manga           Manga          @relation(fields: [mangaId], references: [id], onDelete: Cascade)
  magazineIssue   MagazineIssue? @relation(fields: [magazineIssueId], references: [id])
  tankobonVolume  TankobonVolume? @relation(fields: [tankobonVolumeId], references: [id])
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([mangaId, episodeNumber])
  @@index([magazineIssueId])
  @@index([tankobonVolumeId])
}
```