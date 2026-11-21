interface ServerlessRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown> | string;
}

interface ServerlessResponse {
  status: (code: number) => ServerlessResponse;
  json: (payload: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: () => void;
}

const DEFAULT_EMAILJS_SERVICE_ID = 'service_740ewfp';
const DEFAULT_EMAILJS_TEMPLATE_ID = 'template_dzloey5';
const DEFAULT_EMAILJS_PUBLIC_KEY = '_SN178QkGFdMU8a4u';

export default async function handler(req: ServerlessRequest, res: ServerlessResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    const rawBody =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as Record<string, unknown>)
        : req.body || {};

    const email = String(rawBody.email || '').trim().toLowerCase();
    const code = String(rawBody.code || rawBody.passcode || '').trim();
    const expiresAt = Number(rawBody.expiresAt) || Date.now() + 15 * 60 * 1000;
    const time =
      String(rawBody.time || '').trim() ||
      new Date(expiresAt).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    const sendViaServerProxy = Boolean(rawBody.sendViaServerProxy);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ ok: false, error: 'يرجى إدخال بريد إلكتروني صحيح.' });
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      res.status(400).json({ ok: false, error: 'كود التحقق غير صالح.' });
      return;
    }

    if (!sendViaServerProxy) {
      res.status(200).json({
        ok: true,
        emailSent: true,
        provider: 'emailjs',
        email,
        expiresAt,
      });
      return;
    }

    const serviceId =
      (process.env.VITE_EMAILJS_SERVICE_ID || process.env.EMAILJS_SERVICE_ID || '').trim() ||
      DEFAULT_EMAILJS_SERVICE_ID;
    const templateId =
      (process.env.VITE_EMAILJS_TEMPLATE_ID || process.env.EMAILJS_TEMPLATE_ID || '').trim() ||
      DEFAULT_EMAILJS_TEMPLATE_ID;
    const publicKey =
      (process.env.VITE_EMAILJS_PUBLIC_KEY || process.env.EMAILJS_PUBLIC_KEY || '').trim() ||
      DEFAULT_EMAILJS_PUBLIC_KEY;

    const hostHeader = Array.isArray(req.headers?.host)
      ? req.headers?.host[0]
      : req.headers?.host;
    const originHeader = Array.isArray(req.headers?.origin)
      ? req.headers?.origin[0]
      : req.headers?.origin;
    const effectiveOrigin =
      originHeader || (hostHeader ? `https://${hostHeader}` : 'https://localhost');

    const emailJsResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: effectiveOrigin,
        Referer: `${effectiveOrigin}/`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({
        lib_version: '5.0.3',
        user_id: publicKey,
        service_id: serviceId,
        template_id: templateId,
        template_params: {
          email,
          passcode: code,
          time,
        },
      }),
    });

    const responseText = await emailJsResponse.text().catch(() => '');

    if (!emailJsResponse.ok) {
      res.status(emailJsResponse.status >= 400 ? emailJsResponse.status : 502).json({
        ok: false,
        emailSent: false,
        status: emailJsResponse.status,
        error: responseText || 'فشل إرسال البريد عبر EmailJS.',
      });
      return;
    }

    res.status(200).json({
      ok: true,
      emailSent: true,
      provider: 'emailjs-proxy',
      email,
      expiresAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    res.status(502).json({
      ok: false,
      emailSent: false,
      error: `تعذر الاتصال بخدمة EmailJS عبر الخادم (${msg}).`,
    });
  }
}
