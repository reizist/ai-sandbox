import { initTRPC } from '@trpc/server'
import { db } from '@/lib/db'

const t = initTRPC.create()

export const router = t.router
export const publicProcedure = t.procedure

// Context for tRPC
export const createContext = async () => {
  return {
    db,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>