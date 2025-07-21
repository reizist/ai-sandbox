import { router } from './trpc'
import { mangaRouter } from './routers/manga'

export const appRouter = router({
  manga: mangaRouter,
})

export type AppRouter = typeof appRouter