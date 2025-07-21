-- CreateTable
CREATE TABLE "MangaSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "genres" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Manga" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT,
    "originalTitle" TEXT NOT NULL,
    "englishTitle" TEXT,
    "japaneseTitle" TEXT,
    "authors" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ongoing',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Manga_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "MangaSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "mangaId" TEXT NOT NULL,
    "magazineIssueId" TEXT,
    "tankobonVolumeId" TEXT,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Episode_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Episode_magazineIssueId_fkey" FOREIGN KEY ("magazineIssueId") REFERENCES "MagazineIssue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Episode_tankobonVolumeId_fkey" FOREIGN KEY ("tankobonVolumeId") REFERENCES "TankobonVolume" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Magazine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MagazineIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "magazineId" TEXT NOT NULL,
    "issueNumber" TEXT NOT NULL,
    "publicationDate" DATETIME NOT NULL,
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MagazineIssue_magazineId_fkey" FOREIGN KEY ("magazineId") REFERENCES "Magazine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TankobonVolume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mangaId" TEXT NOT NULL,
    "volumeNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "isbn" TEXT,
    "publicationDate" DATETIME,
    "price" DECIMAL,
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TankobonVolume_mangaId_fkey" FOREIGN KEY ("mangaId") REFERENCES "Manga" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AffiliateLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tankobonVolumeId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "price" DECIMAL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AffiliateLink_tankobonVolumeId_fkey" FOREIGN KEY ("tankobonVolumeId") REFERENCES "TankobonVolume" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Manga_seriesId_idx" ON "Manga"("seriesId");

-- CreateIndex
CREATE INDEX "Manga_status_idx" ON "Manga"("status");

-- CreateIndex
CREATE INDEX "Manga_startDate_idx" ON "Manga"("startDate");

-- CreateIndex
CREATE INDEX "Episode_magazineIssueId_idx" ON "Episode"("magazineIssueId");

-- CreateIndex
CREATE INDEX "Episode_tankobonVolumeId_idx" ON "Episode"("tankobonVolumeId");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_mangaId_episodeNumber_key" ON "Episode"("mangaId", "episodeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Magazine_name_key" ON "Magazine"("name");

-- CreateIndex
CREATE INDEX "MagazineIssue_publicationDate_idx" ON "MagazineIssue"("publicationDate");

-- CreateIndex
CREATE UNIQUE INDEX "MagazineIssue_magazineId_issueNumber_key" ON "MagazineIssue"("magazineId", "issueNumber");

-- CreateIndex
CREATE INDEX "TankobonVolume_publicationDate_idx" ON "TankobonVolume"("publicationDate");

-- CreateIndex
CREATE UNIQUE INDEX "TankobonVolume_mangaId_volumeNumber_key" ON "TankobonVolume"("mangaId", "volumeNumber");

-- CreateIndex
CREATE INDEX "AffiliateLink_tankobonVolumeId_idx" ON "AffiliateLink"("tankobonVolumeId");

-- CreateIndex
CREATE INDEX "AffiliateLink_platform_idx" ON "AffiliateLink"("platform");
