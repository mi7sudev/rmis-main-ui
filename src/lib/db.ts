import { PrismaClient } from '@prisma/client'
import { env, isProduction } from '@/lib/env'

// ============================================================================
// BigInt JSON serialization polyfill.
//
// The production database stores `mobile_number` and a few other
// columns as SQLite `bigint`. Prisma maps these to JS `BigInt`. However,
// `JSON.stringify` (used by NextResponse.json) throws
// "TypeError: Do not know how to serialize a BigInt" on BigInt values.
// This polyfill makes BigInt serialize as a string so API responses don't
// crash. Callers that need the numeric value can parse it back with BigInt().
// ----------------------------------------------------------------------------
(BigInt.prototype as unknown as { toJSON: unknown }).toJSON = function () {
  return this.toString();
};

// ============================================================================
// Database client setup.
//
// All env-var validation (presence, length, production scratch-DB guard) is
// handled centrally in @/lib/env — importing it here guarantees the checks
// run before the Prisma client is constructed. See DEPLOYMENT.md for the
// localhost-dev vs intranet-production setup guide.
// ============================================================================

// `env` is referenced so the validation side-effect runs even if a future
// refactor removes direct env field access in this module.
void env;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (!isProduction) globalForPrisma.prisma = db
