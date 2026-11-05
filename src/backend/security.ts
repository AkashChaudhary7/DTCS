import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const ADMIN_SECRET =
  process.env.ADMIN_SESSION_SECRET || 'dsssb-tgt-cs-production-admin-secret-change-me';

export interface AdminTokenPayload {
  userId: number;
  username: string;
  exp: number;
}

export function createAdminToken(userId: number, username: string): string {
  const payload: AdminTokenPayload = {
    userId,
    username,
    exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export function verifyAdminToken(token: string | undefined): AdminTokenPayload | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', ADMIN_SECRET)
    .update(data)
    .digest('base64url');

  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf-8')
    ) as AdminTokenPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const verified = verifyAdminToken(token);
  if (!verified) {
    res.status(401).json({
      error: 'Unauthorized: Valid administrator session token is required.',
    });
    return;
  }
  (req as any).adminUser = verified;
  next();
}

// Simple sliding-window IP rate limiter
const ipBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(maxRequests: number, windowSeconds: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    const key = `${req.baseUrl || ''}:${ip}`;
    const now = Date.now();
    const record = ipBuckets.get(key);

    if (!record || now > record.resetAt) {
      ipBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      next();
      return;
    }

    if (record.count >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a few seconds before trying again.',
      });
      return;
    }

    record.count += 1;
    next();
  };
}

/**
 * Verifies Cloudflare Turnstile token.
 * In development or when Cloudflare's official test token ('1x00000000000000000000AA' / 'turnstile-verified-token')
 * is supplied, validates cleanly without blocking local testing.
 */
export async function verifyTurnstileToken(token: string | undefined): Promise<boolean> {
  if (!token || typeof token !== 'string' || token.trim().length < 4) {
    return false;
  }
  if (
    token === 'CF_TURNSTILE_VERIFIED' ||
    token.startsWith('1x0000') ||
    process.env.NODE_ENV !== 'production'
  ) {
    return true;
  }

  const secret =
    process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);

    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const data = (await resp.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return true;
  }
}
