# 技術設計書 - 漫画データベース情報システム

## 1. システムアーキテクチャ概要

### 1.1 アーキテクチャパターン
本システムは、情報管理に特化した以下の3層アーキテクチャを採用します：

```
┌─────────────────────────────────────────┐
│           フロントエンド層               │
│    Next.js + React + TypeScript         │
│         Tailwind CSS                    │
└─────────────────────────────────────────┘
           │
           │ API Route / tRPC
           ▼
┌─────────────────────────────────────────┐
│           アプリケーション層             │
│    Next.js API Routes / tRPC            │
│    Zod バリデーション                   │
└─────────────────────────────────────────┘
           │
           │ Prisma ORM
           ▼
┌─────────────────────────────────────────┐
│            データ層                     │
│    PostgreSQL データベース              │
│    S3 画像ストレージ                    │
└─────────────────────────────────────────┘
```

### 1.2 技術スタック選定理由

**フロントエンド**
- **Next.js 14**: App Router使用でSSRサポート、SEO最適化、ファイルベースルーティング
- **React 18**: コンポーネントベース開発、Server Components活用
- **TypeScript**: 型安全性による開発効率向上とバグ削減
- **Tailwind CSS**: ユーティリティファーストによる高速UI開発

**バックエンド**
- **tRPC**: 型安全なAPI開発、クライアント・サーバー間の型共有
- **Prisma ORM**: 型安全なデータベースアクセス、マイグレーション管理
- **Zod**: ランタイム型バリデーション

**データベース**
- **PostgreSQL**: JSON型、ACID準拠、複雑なリレーション対応

## 2. データベース設計（簡略化）

### 2.1 コアデータモデル設計

```typescript
// Prisma スキーマ設計 - 簡略化版

// 漫画シリーズ（作品全体） - 最上位エンティティ
model MangaSeries {
  id              String    @id @default(cuid())
  title           String    // シリーズタイトル（例: "JoJo's Bizarre Adventure"）
  description     String?   // シリーズ概要
  
  // 関係性
  manga           Manga[]   // シリーズに属する個別作品
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// 漫画（個別作品） - シリーズ内の具体的な作品
model Manga {
  id              String    @id @default(cuid())
  title           String    // 作品タイトル（例: "Part 1: Phantom Blood"）
  authors         Json      // 作者配列 ["荒木飛呂彦"] 
  genres          Json      // ジャンル配列 ["少年", "アクション", "サスペンス"]
  status          MangaStatus // 連載状況
  startDate       DateTime? // 連載開始日
  endDate         DateTime? // 連載終了日
  
  // シリーズ関連
  seriesId        String
  series          MangaSeries @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  
  // 関係性
  episodes        Episode[]
  tankobonVolumes TankobonVolume[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([seriesId])
}

// エピソード（章・話）情報
model Episode {
  id              String    @id @default(cuid())
  title           String    // エピソードタイトル
  episodeNumber   Int       // 話数
  
  // 漫画関連
  mangaId         String
  manga           Manga @relation(fields: [mangaId], references: [id], onDelete: Cascade)
  
  // 雑誌掲載情報
  magazineIssueId String?
  magazineIssue   MagazineIssue? @relation(fields: [magazineIssueId], references: [id])
  
  // 単行本収録情報
  tankobonVolumeId String?
  tankobonVolume   TankobonVolume? @relation(fields: [tankobonVolumeId], references: [id])
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([mangaId, episodeNumber])
  @@index([magazineIssueId])
  @@index([tankobonVolumeId])
}

// 雑誌情報
model Magazine {
  id              String    @id @default(cuid())
  name            String    // 雑誌名（例：週刊少年ジャンプ）
  publisher       String    // 出版社（例：集英社）
  
  // 関係性
  issues          MagazineIssue[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([name, publisher])
}

// 雑誌号情報
model MagazineIssue {
  id              String    @id @default(cuid())
  magazineId      String
  issueNumber     String    // 号数（例：「2024年1号」）
  publicationDate DateTime  // 発売日
  
  // 関係性
  magazine        Magazine  @relation(fields: [magazineId], references: [id], onDelete: Cascade)
  episodes        Episode[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([magazineId, issueNumber])
  @@index([publicationDate])
}

// 単行本巻情報
model TankobonVolume {
  id              String    @id @default(cuid())
  volumeNumber    Int       // 巻数
  isbn            String?   // ISBN
  
  // 漫画関連
  mangaId         String
  manga           Manga @relation(fields: [mangaId], references: [id], onDelete: Cascade)
  
  // 収録エピソード
  episodes        Episode[]
  
  // アフィリエイトリンク
  affiliateLinks  AffiliateLink[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([mangaId, volumeNumber])
}

// アフィリエイトリンク
model AffiliateLink {
  id               String    @id @default(cuid())
  tankobonVolumeId String
  platform         String    // "amazon", "bookwalker", etc.
  url              String
  
  tankobonVolume   TankobonVolume @relation(fields: [tankobonVolumeId], references: [id], onDelete: Cascade)
  
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  
  @@unique([tankobonVolumeId, platform])
}

// 基本的なenum
enum MangaStatus {
  ONGOING
  COMPLETED
  HIATUS
  CANCELLED
}
```

### 2.2 データベース最適化設計

**基本インデックス**
```sql
-- 基本検索用インデックス
CREATE INDEX manga_series_title_idx ON "MangaSeries" ("title");
CREATE INDEX manga_status_idx ON "Manga" ("status");
CREATE INDEX manga_date_idx ON "Manga" ("startDate", "endDate");
CREATE INDEX manga_series_idx ON "Manga" ("seriesId");
CREATE INDEX tankobon_volume_manga_idx ON "TankobonVolume" ("mangaId", "volumeNumber");
CREATE INDEX magazine_issue_publication_idx ON "MagazineIssue" ("publicationDate", "magazineId");
CREATE INDEX episode_manga_idx ON "Episode" ("mangaId", "episodeNumber");

-- JSON検索用インデックス（PostgreSQL）
CREATE INDEX manga_authors_gin ON "Manga" USING GIN (authors);
CREATE INDEX manga_genres_gin ON "Manga" USING GIN (genres);
```

**検索性能最適化**
- タイトル・JSON配列内の作者/ジャンルでのシンプル検索
- ページネーション最適化（カーソルベース）
- GINインデックスによるJSON配列検索の高速化

## 3. API設計（簡略化）

### 3.1 tRPC Router構成

```typescript
// router/manga-series.ts
export const mangaSeriesRouter = createTRPCRouter({
  // シリーズ検索・一覧
  search: publicProcedure
    .input(
      z.object({
        query: z.string().optional(),       // シリーズタイトル検索
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // 漫画シリーズ検索ロジック実装
    }),

  // シリーズ詳細取得
  getById: publicProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      // シリーズ詳細取得（所属する漫画作品一覧含む）
    }),
});

// router/manga.ts
export const mangaRouter = createTRPCRouter({
  // 漫画作品検索・一覧
  search: publicProcedure
    .input(
      z.object({
        query: z.string().optional(),       // 作品タイトル検索
        authors: z.array(z.string()).optional(), // 作者検索（JSON内検索）
        genres: z.array(z.string()).optional(),  // ジャンル検索（JSON内検索）
        status: z.nativeEnum(MangaStatus).optional(),
        seriesId: z.string().optional(),    // 特定シリーズの作品のみ
        sortBy: z.enum(['title', 'startDate']).default('title'),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // 漫画作品検索ロジック実装
    }),

  // 漫画作品詳細取得
  getById: publicProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      // 作品詳細取得（単行本巻、エピソード含む）
    }),

  // シリーズ別作品一覧
  listBySeries: publicProcedure
    .input(z.string()) // seriesId
    .query(async ({ input, ctx }) => {
      // 特定シリーズの作品一覧取得
    }),
});

// router/episode.ts
export const episodeRouter = createTRPCRouter({
  // エピソード一覧
  list: publicProcedure
    .input(
      z.object({
        mangaId: z.string().optional(),     // 特定作品のエピソード
        seriesId: z.string().optional(),   // 特定シリーズの全エピソード
        magazineId: z.string().optional(),
        title: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // エピソード一覧取得
    }),

  // 作品別エピソード一覧
  listByManga: publicProcedure
    .input(z.string()) // mangaId
    .query(async ({ input, ctx }) => {
      // 特定作品のエピソード一覧取得
    }),

  // シリーズ別エピソード一覧
  listBySeries: publicProcedure
    .input(z.string()) // seriesId
    .query(async ({ input, ctx }) => {
      // 特定シリーズの全エピソード一覧取得
    }),

  // エピソード詳細
  getById: publicProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      // エピソード詳細
    }),
});

// router/magazine.ts
export const magazineRouter = createTRPCRouter({
  // 雑誌一覧
  list: publicProcedure
    .input(
      z.object({
        publisher: z.string().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input, ctx }) => {
      // 雑誌一覧取得
    }),

  // 雑誌詳細
  getById: publicProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      // 雑誌詳細と発行号一覧
    }),
});

// router/tankobon.ts
export const tankobonRouter = createTRPCRouter({
  // 単行本詳細
  getById: publicProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      // 単行本詳細（収録エピソード、アフィリエイトリンク含む）
    }),

  // 作品別単行本一覧
  listByManga: publicProcedure
    .input(z.string()) // mangaId
    .query(async ({ input, ctx }) => {
      // 特定作品の単行本一覧
    }),

  // シリーズ別単行本一覧
  listBySeries: publicProcedure
    .input(z.string()) // seriesId
    .query(async ({ input, ctx }) => {
      // 特定シリーズの全単行本一覧（全作品から）
    }),
});

// router/affiliate.ts
export const affiliateRouter = createTRPCRouter({
  // アフィリエイトリンク追跡
  trackClick: publicProcedure
    .input(z.string()) // linkId
    .mutation(async ({ input, ctx }) => {
      // クリック追跡・リダイレクト
    }),
});
```

## 4. フロントエンド設計（簡略化）

### 4.1 コンポーネント設計

```
src/
├── components/
│   ├── ui/                    # 基本UIコンポーネント
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   └── SearchBar.tsx
│   ├── manga-series/          # 漫画シリーズ関連
│   │   ├── SeriesCard.tsx     # シリーズカード表示
│   │   ├── SeriesGrid.tsx     # シリーズグリッドレイアウト
│   │   └── SeriesDetail.tsx   # シリーズ詳細表示
│   ├── manga/                 # 個別漫画作品関連
│   │   ├── MangaCard.tsx      # 作品カード表示
│   │   ├── MangaGrid.tsx      # 作品グリッドレイアウト
│   │   └── MangaDetail.tsx    # 作品詳細表示
│   ├── episode/               # エピソード関連
│   │   ├── EpisodeList.tsx    # エピソード一覧
│   │   └── EpisodeCard.tsx    # エピソードカード
│   ├── magazine/              # 雑誌関連
│   │   ├── MagazineCard.tsx   # 雑誌カード
│   │   └── IssueList.tsx      # 雑誌号一覧
│   ├── tankobon/              # 単行本関連
│   │   ├── VolumeCard.tsx     # 単行本カード
│   │   └── VolumeGrid.tsx     # 単行本一覧
│   ├── affiliate/             # アフィリエイト関連
│   │   └── AffiliateLinks.tsx # アフィリエイトリンク表示
│   └── layout/                # レイアウト
│       ├── Header.tsx
│       └── Navigation.tsx
```

### 4.2 状態管理設計

```typescript
// シンプルな状態管理（React State + Context）
interface AppState {
  // 検索状態
  searchQuery: string;
  seriesSearchResults: MangaSeries[];
  mangaSearchResults: Manga[];
  isSearching: boolean;
  
  // UI状態
  theme: 'light' | 'dark';
  selectedSeriesId: string | null;
  
  // アクション
  setSearchQuery: (query: string) => void;
  performSeriesSearch: () => Promise<void>;
  performMangaSearch: () => Promise<void>;
  setSelectedSeriesId: (seriesId: string | null) => void;
}
```

### 4.3 ページ構成

```
app/
├── page.tsx                   # ホームページ（検索機能）
├── series/
│   └── [id]/
│       └── page.tsx          # 漫画シリーズ詳細ページ
├── manga/
│   └── [id]/
│       └── page.tsx          # 個別漫画作品詳細ページ
├── episodes/
│   └── [id]/
│       └── page.tsx          # エピソード詳細ページ
├── magazines/
│   ├── page.tsx              # 雑誌一覧
│   └── [id]/
│       └── page.tsx          # 雑誌詳細ページ
├── tankobon/
│   └── [id]/
│       └── page.tsx          # 単行本詳細ページ
├── admin/                    # 管理機能（簡易版）
│   ├── page.tsx              # 管理ダッシュボード
│   ├── series/
│   │   └── page.tsx          # シリーズ管理
│   └── manga/
│       └── page.tsx          # 漫画作品管理
└── api/                      # API Routes
```

## 5. アフィリエイト統合（簡略化）

### 5.1 アフィリエイトリンク管理

```typescript
// services/affiliate-service.ts
class AffiliateService {
  // 手動でアフィリエイトリンクを管理（自動生成は除外）
  async createAffiliateLink(
    tankobonVolumeId: string,
    platform: string,
    url: string
  ): Promise<AffiliateLink> {
    return await prisma.affiliateLink.create({
      data: {
        tankobonVolumeId,
        platform,
        url,
      }
    });
  }
  
  async trackClick(linkId: string): Promise<void> {
    // シンプルなクリック追跡
    await prisma.affiliateLink.update({
      where: { id: linkId },
      data: {
        clickCount: { increment: 1 },
        lastClicked: new Date(),
      }
    });
  }
  
  async getAffiliateLinks(tankobonVolumeId: string): Promise<AffiliateLink[]> {
    return await prisma.affiliateLink.findMany({
      where: { tankobonVolumeId }
    });
  }
}
```

## 6. パフォーマンス最適化（簡略化）

### 6.1 基本キャッシング

```typescript
// Next.js標準キャッシングを活用
const cacheConfig = {
  // ページキャッシュ（Next.js App Router）
  revalidate: {
    mangaSeries: 60 * 60 * 24,    // 24時間
    episodes: 60 * 60 * 12,       // 12時間
    magazines: 60 * 60 * 6,       // 6時間
    tankobons: 60 * 60 * 24,      // 24時間
  },
  
  // API レスポンスキャッシュ
  headers: {
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400'
  }
};
```

## 7. セキュリティ設計（簡略化）

### 7.1 基本的な認証

```typescript
// 管理機能用の簡易認証
export async function basicAuth(req: Request) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    throw new Error('認証が必要です');
  }
  
  // 基本認証の確認
  const credentials = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
  const [username, password] = credentials.split(':');
  
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    return { username, role: 'admin' };
  }
  
  throw new Error('認証に失敗しました');
}
```

### 7.2 入力検証

```typescript
// Zod バリデーションスキーマ
export const searchInputSchema = z.object({
  query: z.string().max(200).optional(),
  authors: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  status: z.nativeEnum(MangaStatus).optional(),
});

export const mangaCreateSchema = z.object({
  title: z.string().min(1).max(500),
  authors: z.array(z.string()).min(1),
  genres: z.array(z.string()),
  status: z.nativeEnum(MangaStatus),
});
```

## 8. 監視・ログ（簡略化）

### 8.1 基本ログ

```typescript
// シンプルなログ出力
const logger = {
  info: (message: string, meta?: object) => console.log(JSON.stringify({ level: 'info', message, ...meta })),
  error: (message: string, error?: Error) => console.error(JSON.stringify({ level: 'error', message, error: error?.message })),
  warn: (message: string, meta?: object) => console.warn(JSON.stringify({ level: 'warn', message, ...meta })),
};
```

### 8.2 ヘルスチェック

```typescript
// /api/health エンドポイント
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
}
```

## 9. デプロイメント（簡略化）

### 9.1 開発環境

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/manga_db
    depends_on:
      - db
  
  db:
    image: postgres:15
    environment:
      POSTGRES_DB: manga_db
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

### 9.2 本番環境

- **Vercel**: Next.jsアプリのホスティング
- **PostgreSQL**: Neon、Supabase等のマネージドサービス
- **ドメイン**: カスタムドメイン設定

## 10. 段階的実装計画（簡略化）

### Phase 1: 基盤構築 (2週間)
- [ ] Next.js プロジェクトセットアップ
- [ ] 簡略化データベーススキーマ実装（6モデルのみ）
- [ ] 基本認証システム構築
- [ ] 基本UIコンポーネント作成

### Phase 2: コア機能実装 (3週間)
- [ ] 漫画シリーズ管理機能実装（JSON配列使用）
- [ ] エピソード管理機能実装
- [ ] 雑誌・雑誌号管理機能実装
- [ ] 単行本管理機能実装

### Phase 3: 検索・表示機能 (2週間)
- [ ] 検索機能実装（タイトル、作者、ジャンル）
- [ ] 詳細ページ作成
- [ ] エピソード掲載・収録関係性表示

### Phase 4: アフィリエイト統合 (1週間)
- [ ] アフィリエイトリンク管理機能実装
- [ ] クリック追跡機能実装

### Phase 5: 運用準備 (1週間)
- [ ] 基本ログシステム構築
- [ ] ヘルスチェック実装
- [ ] 本番環境デプロイ

この簡略化された技術設計書は、複雑さを大幅に削減し、コア機能（漫画情報検索とアフィリエイトリンク）に焦点を当てた実装を可能にします。JSON配列を活用することで、複雑なリレーションテーブルを回避し、開発・保守コストを削減します。