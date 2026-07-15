/**
 * Netlify Serverless Function - Proxy CORS para aEasy
 * Mantém sessão PHP server-side via cookies em memória
 */

const AEASY_BASE = 'https://aeasy.autovaleprevencoes.org';
let sessionCookies = '';
let lastLoginTime = 0;
const SESSION_TTL = 55 * 60 * 1000;

export default async (req) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders() });
    }

    try {
        const body = await req.json();
        const { action } = body;

        if (action === 'login') return respond(await doLogin(body));
        if (action === 'request') return respond(await doRequest(body));
        if (action === 'status') return respond({ authenticated: isSessionValid(), age: lastLoginTime ? Date.now() - lastLoginTime : 0 });
        return respond({ error: 'Use: login, request, status' }, 400);
    } catch (e) {
        return respond({ error: e.message }, 500);
    }
};

async function doLogin(body) {
    const login = body.login || '03268401503';
    const senha = body.senha || 'Ale@2026';

    // 1. GET sessão
    const s = await fetch(`${AEASY_BASE}/conta/login`, { redirect: 'manual' });
    extractCookies(s);

    // 2. POST login
    const r = await fetch(`${AEASY_BASE}/conta/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': sessionCookies,
        },
        body: `UsuariosLogin=${encodeURIComponent(login)}&UsuariosSenha=${encodeURIComponent(senha)}`,
        redirect: 'manual',
    });
    extractCookies(r);

    const text = await r.text();
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
        const lr = await doLogin({});
        if (!lr.success) return { error: 'SESSION_EXPIRED' };
    }

    const method = (body.method || 'GET').toUpperCase();
    const endpoint = body.endpoint || '/';
    const reqBody = body.body || '';

    const headers = { 'X-Requested-With': 'XMLHttpRequest', 'Cookie': sessionCookies };
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const opts = { method, headers, redirect: 'manual' };
    if (method === 'POST' && reqBody) opts.body = reqBody;

    const start = Date.now();
    const resp = await fetch(`${AEASY_BASE}${endpoint}`, opts);
    extractCookies(resp);

    if (resp.status === 302 || resp.status === 301) {
        sessionCookies = '';
        lastLoginTime = 0;
        const lr = await doLogin({});
        if (lr.success) return await doRequest(body);
        return { error: 'SESSION_EXPIRED' };
    }

    const text = await resp.text();
    let data;
    try {
        const i = text.indexOf('{');
        data = i >= 0 ? JSON.parse(text.substring(i)) : { raw: text.substring(0, 2000) };
    } catch { data = { raw: text.substring(0, 2000) }; }

    return { status: resp.status, data, elapsed: Date.now() - start };
}

function extractCookies(resp) {
    const raw = resp.headers.get('set-cookie');
    if (!raw) return;
    const map = {};
    if (sessionCookies) sessionCookies.split('; ').forEach(c => { const [k,...v] = c.split('='); if(k) map[k.trim()] = v.join('='); });
    raw.split(/,(?=\s*\w+=)/).forEach(p => { const m = p.split(';')[0].trim(); const [k,...v] = m.split('='); if(k) map[k.trim()] = v.join('='); });
    sessionCookies = Object.entries(map).map(([k,v]) => `${k}=${v}`).join('; ');
}

function isSessionValid() {
    return !!sessionCookies && !!lastLoginTime && (Date.now() - lastLoginTime < SESSION_TTL);
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

function respond(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
}

export const config = {
    path: "/api/proxy"
};
