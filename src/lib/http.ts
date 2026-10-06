export const SESSION_COOKIE = 'sl_session';

export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

export function html(body: string, status = 200, extra: HeadersInit = {}): Response {
  const h = new Headers(extra);
  h.set('Content-Type', 'text/html; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) h.set(k, v);
  return new Response(body, { status, headers: h });
}

export function redirect(location: string, extra: HeadersInit = {}): Response {
  const h = new Headers(extra);
  h.set('Location', location);
  return new Response(null, { status: 303, headers: h });
}

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(req: Request, token: string, maxAgeSec: number): string {
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

/** Same-origin check for state-changing requests (defense in depth on top of SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (!origin) {
    const ref = req.headers.get('Referer');
    if (!ref) return true; // non-browser clients; cookie still SameSite-protected
    try {
      return new URL(ref).host === new URL(req.url).host;
    } catch {
      return false;
    }
  }
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ||
    (req.headers.get('X-Forwarded-For') || '').split(',')[0]!.trim() ||
    'local'
  );
}

export async function formData(req: Request): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const text = await req.text();
  for (const [k, v] of new URLSearchParams(text)) {
    const arr = out.get(k) ?? [];
    arr.push(v);
    out.set(k, arr);
  }
  return out;
}

export function field(f: Map<string, string[]>, k: string): string {
  return (f.get(k)?.[0] ?? '').trim();
}
