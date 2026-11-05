/**
 * Cloudflare Worker + D1 Entrypoint (`src/worker.ts`)
 * Referenced by `wrangler.toml` for deploying the application to Cloudflare Workers + D1 + Assets.
 */
import { validateExtractedAnswerKey } from './backend/answerKeyService';
import {
  fetchResponseSheetFromUrl,
  generateOfficialDigialmHtmlFixture,
  parseResponseSheetContent,
  validateResponseSheetUrl,
} from './backend/parser';
import { calculateCandidateScore } from './backend/scoringEngine';

export interface Env {
  DB: any; // Cloudflare D1Database binding
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ALLOWED_DSSSB_DOMAINS?: string;
  LEADERBOARD_CACHE_TTL_SECONDS?: string;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_SESSION_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Delegate non-API routes to Cloudflare static frontend assets (SPA)
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const jsonResponse = (data: unknown, status = 200, cacheSeconds = 0) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
      };
      if (cacheSeconds > 0) {
        headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
      }
      return new Response(JSON.stringify(data), { status, headers });
    };

    try {
      // Cloudflare Cache API for public GET endpoints
      const cache = (globalThis as any).caches?.default;
      const isPublicCacheableGet =
        request.method === 'GET' &&
        (url.pathname === '/api/exam/current' ||
          url.pathname === '/api/exam/shifts' ||
          url.pathname === '/api/leaderboard' ||
          url.pathname === '/api/cutoff' ||
          url.pathname === '/api/stats');

      if (isPublicCacheableGet && cache) {
        const cachedResp = await cache.match(request);
        if (cachedResp) return cachedResp;
      }

      if (url.pathname === '/api/exam/current' && request.method === 'GET') {
        const exam = await env.DB.prepare('SELECT * FROM exams ORDER BY id DESC LIMIT 1').first();
        const resp = jsonResponse(exam, 200, 20);
        if (cache) ctx.waitUntil(cache.put(request, resp.clone()));
        return resp;
      }

      if (url.pathname === '/api/exam/shifts' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT * FROM shift_papers ORDER BY shift_number ASC'
        ).all();
        const resp = jsonResponse(results, 200, 20);
        if (cache) ctx.waitUntil(cache.put(request, resp.clone()));
        return resp;
      }

      if (url.pathname === '/api/response/validate' && request.method === 'POST') {
        const body = (await request.json()) as { url?: string };
        const validation = validateResponseSheetUrl(body.url || '', env.ALLOWED_DSSSB_DOMAINS);
        return jsonResponse(validation, validation.valid ? 200 : 400);
      }

      if (url.pathname === '/api/sample-fixture' && request.method === 'GET') {
        const shiftNumber = Math.min(
          18,
          Math.max(1, parseInt(url.searchParams.get('shift') || '1', 10))
        );
        const roll = url.searchParams.get('roll') || '11209555';
        const html = generateOfficialDigialmHtmlFixture(shiftNumber, roll);
        return jsonResponse({
          shift_number: shiftNumber,
          roll,
          sample_url: `https://cdn.digialm.com/EForms/configuredHtml/1258/91402/touchstone/AssessmentQPHTMLMode1/shift-${shiftNumber}/cand-${roll}.html`,
          html,
        });
      }

      // Expose core parser, validator, and scoring engine verification healthcheck
      if (url.pathname === '/api/worker-health' && request.method === 'GET') {
        return jsonResponse({
          status: 'ok',
          runtime: 'cloudflare-workers-d1',
          modules: {
            parser: typeof parseResponseSheetContent === 'function',
            fetcher: typeof fetchResponseSheetFromUrl === 'function',
            keyDiscovery: typeof validateExtractedAnswerKey === 'function',
            scoringEngine: typeof calculateCandidateScore === 'function',
          },
        });
      }

      return jsonResponse({ error: 'API route not found.' }, 404);
    } catch (err: any) {
      return jsonResponse({ error: err.message || 'Internal Worker Error' }, 500);
    }
  },
};
