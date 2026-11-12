// =============================================================================
// Setl8 Backend — Position Routes
//
// POST /                    open position (market or limit)
// POST /:id/close           close an open position (full)
// POST /:id/partial-close   close a percentage of a position
// POST /:id/cancel          cancel a pending limit order
// PATCH /:id/sl-tp          update SL/TP on an open position
// GET  /                    list positions for the active attempt
// =============================================================================

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Market, PositionSide } from '@setl8/types';
import { verifyJWT } from '../../middleware/auth.js';
import { positionService } from '../../synthetic/positions.js';
import { prisma } from '../../lib/prisma.js';
import { marketService } from '../../synthetic/market.js';
import { calculateUnrealizedPnl } from '../../synthetic/pnl.js';
import { serializeDecimals } from '../../lib/serialization.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const OpenPositionSchema = z.object({
  market:        z.nativeEnum(Market),
  side:          z.nativeEnum(PositionSide),
  sizeUsd:       z.number().positive('Size must be positive').optional(),
  assetQuantity: z.number().positive().optional(),
  stopLoss:      z.number().positive().optional(),
  takeProfit:    z.number().positive().optional(),
  orderType:     z.enum(['MARKET', 'LIMIT']).optional().default('MARKET'),
  limitPrice:    z.number().positive().optional(),
  leverage:      z.number().int().min(1).max(500).optional(),
});

const IdParamSchema = z.object({
  id: z.string().uuid('Invalid position ID'),
});

const PartialCloseSchema = z.object({
  percent: z.number().min(1).max(99),
});

const SlTpSchema = z.object({
  stopLoss:   z.number().positive().nullable().optional(),
  takeProfit: z.number().positive().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const positionRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // POST /close-all — close all open positions for the active attempt
  // -------------------------------------------------------------------------
  app.post('/close-all', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!attempt) {
      return reply.status(400).send({ success: false, error: 'No active attempt' });
    }

    const openPositions = await prisma.position.findMany({
      where: { attemptId: attempt.id, status: 'OPEN', orderStatus: 'FILLED' },
      select: { id: true },
    });

    if (openPositions.length === 0) {
      return reply.status(200).send({ success: true, data: { closed: 0, total: 0 } });
    }

    let closed = 0;
    const errors: string[] = [];

    for (const pos of openPositions) {
      try {
        await positionService.closePosition(pos.id, traderId);
        closed++;
      } catch (err) {
        errors.push(`${pos.id}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return reply.status(200).send({
      success: true,
      data: { closed, total: openPositions.length, ...(errors.length > 0 ? { errors } : {}) },
    });
  });

  // -------------------------------------------------------------------------
  // POST /cancel-all — cancel all pending limit orders for the active attempt
  // -------------------------------------------------------------------------
  app.post('/cancel-all', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!attempt) {
      return reply.status(400).send({ success: false, error: 'No active attempt' });
    }

    const pendingOrders = await prisma.position.findMany({
      where: { attemptId: attempt.id, orderStatus: 'PENDING' },
      select: { id: true },
    });

    if (pendingOrders.length === 0) {
      return reply.status(200).send({ success: true, data: { cancelled: 0, total: 0 } });
    }

    let cancelled = 0;
    const errors: string[] = [];

    for (const order of pendingOrders) {
      try {
        await positionService.cancelLimitOrder(order.id, traderId);
        cancelled++;
      } catch (err) {
        errors.push(`${order.id}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    return reply.status(200).send({
      success: true,
      data: { cancelled, total: pendingOrders.length, ...(errors.length > 0 ? { errors } : {}) },
    });
  });

  // -------------------------------------------------------------------------
  // POST / — open position (market or limit)
  // -------------------------------------------------------------------------
  app.post('/', { preHandler: [verifyJWT] }, async (request, reply) => {
    const parse = OpenPositionSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message ?? 'Invalid request body',
      });
    }

    const { market, side, orderType, limitPrice, stopLoss, takeProfit, assetQuantity } = parse.data;
    let sizeUsd = parse.data.sizeUsd;
    const { traderId } = request.user;

    // If assetQuantity provided, convert to USD
    if (!sizeUsd && assetQuantity) {
      const priceData = marketService.getPrice(market);
      if (!priceData) {
        return reply.status(503).send({ success: false, error: `No price for ${market}`, code: 'NO_PRICE' });
      }
      sizeUsd = assetQuantity * priceData.price;
    }

    if (!sizeUsd || sizeUsd <= 0) {
      return reply.status(400).send({ success: false, error: 'Size is required' });
    }

    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      return reply.status(400).send({
        success: false,
        error: 'No active attempt — purchase an evaluation to start trading',
        code: 'NO_ACTIVE_ATTEMPT',
      });
    }

    try {
      if (orderType === 'LIMIT') {
        if (!limitPrice) {
          return reply.status(400).send({ success: false, error: 'Limit price required for limit orders' });
        }
        const position = await positionService.openLimitOrder({
          traderId,
          attemptId: attempt.id,
          market,
          side,
          sizeUsd,
          limitPrice,
          stopLoss,
          takeProfit,
        });
        return reply.status(201).send({ success: true, data: serializeDecimals(position) });
      }

      const position = await positionService.openPosition({
        traderId,
        attemptId: attempt.id,
        market,
        side,
        sizeUsd,
        assetQuantity,
        stopLoss,
        takeProfit,
      });
      return reply.status(201).send({ success: true, data: serializeDecimals(position) });
    } catch (err) {
      const e = err as Error & { code?: string };
      const status =
        e.code === 'NOT_FOUND' ? 404 :
        e.code === 'FORBIDDEN' ? 403 :
        e.code === 'NO_PRICE'  ? 503 : 400;
      return reply.status(status).send({ success: false, error: e.message, code: e.code });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/close — full close
  // -------------------------------------------------------------------------
  app.post('/:id/close', { preHandler: [verifyJWT] }, async (request, reply) => {
    const parse = IdParamSchema.safeParse(request.params);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid position ID' });
    }

    try {
      const position = await positionService.closePosition(parse.data.id, request.user.traderId);
      return reply.status(200).send({ success: true, data: serializeDecimals(position) });
    } catch (err) {
      const e = err as Error & { code?: string };
      const status =
        e.code === 'NOT_FOUND'         ? 404 :
        e.code === 'FORBIDDEN'         ? 403 :
        e.code === 'POSITION_NOT_OPEN' ? 400 :
        e.code === 'NO_PRICE'          ? 503 : 400;
      return reply.status(status).send({ success: false, error: e.message, code: e.code });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/partial-close
  // -------------------------------------------------------------------------
  app.post('/:id/partial-close', { preHandler: [verifyJWT] }, async (request, reply) => {
    const paramParse = IdParamSchema.safeParse(request.params);
    if (!paramParse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid position ID' });
    }
    const bodyParse = PartialCloseSchema.safeParse(request.body);
    if (!bodyParse.success) {
      return reply.status(400).send({ success: false, error: bodyParse.error.issues[0]?.message ?? 'Invalid body' });
    }

    try {
      const position = await positionService.partialClose(
        paramParse.data.id,
        bodyParse.data.percent,
        request.user.traderId,
      );
      return reply.status(200).send({ success: true, data: serializeDecimals(position) });
    } catch (err) {
      const e = err as Error & { code?: string };
      return reply.status(e.code === 'NOT_FOUND' ? 404 : 400).send({
        success: false, error: e.message, code: e.code,
      });
    }
  });

  // -------------------------------------------------------------------------
  // POST /:id/cancel — cancel pending limit order
  // -------------------------------------------------------------------------
  app.post('/:id/cancel', { preHandler: [verifyJWT] }, async (request, reply) => {
    const parse = IdParamSchema.safeParse(request.params);
    if (!parse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid position ID' });
    }

    try {
      const result = await positionService.cancelLimitOrder(parse.data.id, request.user.traderId);
      return reply.status(200).send({ success: true, data: serializeDecimals(result) });
    } catch (err) {
      const e = err as Error & { code?: string };
      return reply.status(e.code === 'NOT_FOUND' ? 404 : 400).send({
        success: false, error: e.message, code: e.code,
      });
    }
  });

  // -------------------------------------------------------------------------
  // PATCH /:id/sl-tp — update SL/TP
  // -------------------------------------------------------------------------
  app.patch('/:id/sl-tp', { preHandler: [verifyJWT] }, async (request, reply) => {
    const paramParse = IdParamSchema.safeParse(request.params);
    if (!paramParse.success) {
      return reply.status(400).send({ success: false, error: 'Invalid position ID' });
    }
    const bodyParse = SlTpSchema.safeParse(request.body);
    if (!bodyParse.success) {
      return reply.status(400).send({ success: false, error: bodyParse.error.issues[0]?.message ?? 'Invalid body' });
    }

    try {
      const position = await positionService.updateSlTp(
        paramParse.data.id,
        request.user.traderId,
        bodyParse.data.stopLoss,
        bodyParse.data.takeProfit,
      );
      return reply.status(200).send({ success: true, data: serializeDecimals(position) });
    } catch (err) {
      const e = err as Error & { code?: string };
      return reply.status(e.code === 'NOT_FOUND' ? 404 : 400).send({
        success: false, error: e.message, code: e.code,
      });
    }
  });

  // -------------------------------------------------------------------------
  // GET /history — closed positions for a specific attempt
  // -------------------------------------------------------------------------
  app.get('/history', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;
    const query = request.query as { attemptId?: string };

    if (!query.attemptId) {
      return reply.status(400).send({ success: false, error: 'attemptId query parameter required' });
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(query.attemptId)) {
      return reply.status(400).send({ success: false, error: 'Invalid attemptId format' });
    }

    // Verify the attempt belongs to this trader
    const attempt = await prisma.attempt.findUnique({
      where: { id: query.attemptId },
      select: { traderId: true },
    });

    if (!attempt) {
      return reply.status(404).send({ success: false, error: 'Attempt not found' });
    }
    if (attempt.traderId !== traderId) {
      return reply.status(403).send({ success: false, error: 'Forbidden' });
    }

    const positions = await prisma.position.findMany({
      where: {
        attemptId: query.attemptId,
        status: 'CLOSED',
        orderStatus: { not: 'CANCELLED' },
      },
      orderBy: { closedAt: 'desc' },
      select: {
        id: true,
        market: true,
        side: true,
        size: true,
        entryPrice: true,
        exitPrice: true,
        realizedPnl: true,
        openFee: true,
        closeFee: true,
        closeReason: true,
        openedAt: true,
        closedAt: true,
      },
    });

    return reply.status(200).send({
      success: true,
      data: { trades: serializeDecimals(positions) },
    });
  });

  // -------------------------------------------------------------------------
  // GET / — list positions for the active attempt
  // -------------------------------------------------------------------------
  app.get('/', { preHandler: [verifyJWT] }, async (request, reply) => {
    const { traderId } = request.user;

    const attempt = await prisma.attempt.findFirst({
      where: { traderId, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!attempt) {
      return reply.status(200).send({ success: true, data: [] });
    }

    const positions = await prisma.position.findMany({
      where: { attemptId: attempt.id },
      orderBy: { openedAt: 'desc' },
    });

    const enriched = positions.map((pos) => {
      if (pos.status !== 'OPEN' || pos.orderStatus === 'PENDING') return pos;

      const priceData = marketService.getPrice(pos.market as Market);
      if (!priceData) return pos;

      const unrealizedPnl = calculateUnrealizedPnl(
        { side: pos.side as PositionSide, entryPrice: pos.entryPrice, size: pos.remainingSize || pos.size },
        priceData.price,
      );

      return { ...pos, unrealizedPnl, currentPrice: priceData.price };
    });

    return reply.status(200).send({ success: true, data: serializeDecimals(enriched) });
  });
};
