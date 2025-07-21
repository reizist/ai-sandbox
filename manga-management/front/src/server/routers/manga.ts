import { z } from 'zod'
import { router, publicProcedure } from '../trpc'

export const mangaRouter = router({
  // 全ての漫画シリーズを取得
  getSeries: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.mangaSeries.findMany({
      include: {
        manga: {
          select: {
            id: true,
            originalTitle: true,
            status: true,
            coverImage: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    })
  }),

  // 特定の漫画シリーズの詳細を取得
  getSeriesById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.mangaSeries.findUnique({
        where: { id: input.id },
        include: {
          manga: {
            include: {
              episodes: {
                orderBy: { episodeNumber: 'asc' },
              },
              volumes: {
                orderBy: { volumeNumber: 'asc' },
                include: {
                  affiliateLinks: true,
                },
              },
            },
          },
        },
      })
    }),

  // 全ての漫画作品を取得
  getAll: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.manga.findMany({
      include: {
        series: true,
        episodes: {
          select: {
            id: true,
            title: true,
            episodeNumber: true,
          },
          orderBy: { episodeNumber: 'asc' },
        },
        volumes: {
          select: {
            id: true,
            volumeNumber: true,
            title: true,
            coverImage: true,
          },
          orderBy: { volumeNumber: 'asc' },
        },
      },
      orderBy: [
        { series: { name: 'asc' } },
        { startDate: 'asc' },
      ],
    })
  }),

  // 特定の漫画作品の詳細を取得
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db.manga.findUnique({
        where: { id: input.id },
        include: {
          series: true,
          episodes: {
            include: {
              magazineIssue: {
                include: {
                  magazine: true,
                },
              },
              tankobonVolume: true,
            },
            orderBy: { episodeNumber: 'asc' },
          },
          volumes: {
            include: {
              affiliateLinks: {
                where: { isActive: true },
              },
            },
            orderBy: { volumeNumber: 'asc' },
          },
        },
      })
    }),

  // 漫画作品を検索
  search: publicProcedure
    .input(
      z.object({
        query: z.string().optional(),
        genres: z.array(z.string()).optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { query, genres, status, limit, offset } = input

      const where: any = {}

      // タイトル検索 (SQLite用 - case insensitiveはサポートされていないため、部分一致のみ)
      if (query) {
        where.OR = [
          { originalTitle: { contains: query } },
          { englishTitle: { contains: query } },
          { japaneseTitle: { contains: query } },
          { series: { name: { contains: query } } },
        ]
      }

      // ステータス検索
      if (status) {
        where.status = status
      }

      const [results, total] = await Promise.all([
        ctx.db.manga.findMany({
          where,
          include: {
            series: true,
            volumes: {
              select: {
                volumeNumber: true,
                coverImage: true,
              },
              orderBy: { volumeNumber: 'asc' },
              take: 1,
            },
          },
          orderBy: [
            { series: { name: 'asc' } },
            { startDate: 'asc' },
          ],
          take: limit,
          skip: offset,
        }),
        ctx.db.manga.count({ where }),
      ])

      return {
        results,
        total,
        hasMore: offset + limit < total,
      }
    }),
})