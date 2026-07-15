/**
 * Vercel Serverless Function - Proxy CORS para aEasy
 * 
 * Deploy:
 *   1. Conecte o repo GitHub ao Vercel (vercel.com)
 *   2. Deploy automático
 *   3. URL: https://aurora-avp.vercel.app/api/proxy
 * 
 * Esta função:
 *   - Mantém sessão PHP via cookie-store em memória
 *   - Re-login automático
 *   - CORS headers
 */

// Cookie store (per-instance, cold start = novo login)
let sessionCookies = '';
let lastLoginTime = 0;
const SESSION_TTL = 55 * 60 * 1000;
const AEASY_BASE = 'https://aeasy.autovaleprevencoes.org';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { action } = body;

        if (action === 'login') {
            return res.json(await doLogin(body));
        } else if (action === 'request') {
            return res.json(await doRequest(body));
        } else if (action === 'status') {
            return res.json({ authenticated: !!sessionCookies, valid: isSessionValid() });
        } else {
            return res.status(400).json({ error: 'Use: login, request, status' });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function doLogin(body) {
    const login = body.login || '03268401503';
    const senha = body.senha || 'Ale@2026';

    // 1. GET para obter sessão
    const sessResp = await fetch(`${AEASY_BASE}/conta/login`, {
        method: 'GET',
        redirect: 'manual',
    });
    extractCookies(sessResp);

    // 2. POST login
    const loginResp = await fetch(`${AEASY_BASE}/conta/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': sessionCookies,
        },
        body: `UsuariosLogin=${encodeURIComponent(login)}&UsuariosSenha=${encodeURIComponent(senha)}`,
        redirect: 'manual',
    });
    extractCookies(loginResp);

    const text = await loginResp.text();
    let data = {};
    try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 300) }; }

    if (data.mensagem && data.mensagem.includes('sucesso')) {
        lastLoginTime = Date.now();
        return { success: true, mensagem: data.mensagem };
    }

    return { success: false, error: data.mensagem || 'Login falhou' };
}

async function doRequest(body) {
    if (!isSessionValid()) {
        const loginResult = await doLogin({});
        if (!loginResult.success) {
            return { error: 'SESSION_EXPIRED', loginResult };
        }
    }

    const method = (body.method || 'GET').toUpperCase();
    const endpoint = body.endpoint || '/';
    const reqBody = body.body || '';
    const url = `${AEASY_BASE}${endpoint}`;

    const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': sessionCookies,
    };
    if (method === 'POST') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const opts = { method, headers, redirect: 'manual' };
    if (method === 'POST' && reqBody) {
        opts.body = reqBody;
    }

    const start = Date.now();
    const resp = await fetch(url, opts);
    const elapsed = Date.now() - start;

    extractCookies(resp);

    if (resp.status === 302 || resp.status === 301) {
        sessionCookies = '';
        lastLoginTime = 0;
        // Re-login e retry
        const loginResult = await doLogin({});
        if (loginResult.success) {
            return await doRequest(body);
        }
        return { error: 'SESSION_EXPIRED' };
    }

    const text = await resp.text();
    let data;
    try {
        const i = text.indexOf('{');
        data = i >= 0 ? JSON.parse(text.substring(i)) : { raw: text.substring(0, 2000) };
    } catch {
        data = { raw: text.substring(0, 2000) };
    }

    return { status: resp.status, data, elapsed, endpoint };
}

function extractCookies(response) {
    const raw = response.headers.get('set-cookie');
    if (!raw) return;

    const map = {};
    if (sessionCookies) {
        sessionCookies.split('; ').forEach(c => {
            const [k, ...v] = c.split('=');
            if (k) map[k.trim()] = v.join('=');
        });
    }

    raw.split(/,(?=\s*\w+=)/).forEach(part => {
        const main = part.split(';')[0].trim();
        const [k, ...v] = main.split('=');
        if (k) map[k.trim()] = v.join('=');
    });

    sessionCookies = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

function isSessionValid() {
    return !!sessionCookies && !!lastLoginTime && (Date.now() - lastLoginTime < SESSION_TTL);
}

export const config = {
    api: {
        bodyParser: true,
    },
};
