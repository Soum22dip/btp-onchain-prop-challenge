// =============================================================================
// Setl8 Backend — Prisma Client Singleton
// =============================================================================

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
