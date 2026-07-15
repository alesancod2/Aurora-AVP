/**
 * Cloudflare Worker - Proxy CORS para aEasy
 * 
 * DEPLOY:
 * 1. Acesse https://workers.cloudflare.com
 * 2. Crie uma conta gratuita (se não tiver)
 * 3. Crie um novo Worker
 * 4. Cole este código
 * 5. Deploy
 * 6. Copie a URL do worker (ex: https://aeasy-proxy.seu-usuario.workers.dev)
 * 7. Atualize CONFIG.corsProxy.providers.custom no aeasy-service.js
 * 
 * Este worker:
 * - Recebe requisições do frontend (GitHub Pages)
 * - Encaminha para o aEasy com cookies
 * - Retorna a resposta com headers CORS
 * - Mantém sessão via cookie store interno
 */

const TARGET_BASE = 'https://aeasy.autovaleprevencoes.org';
const ALLOWED_ORIGINS = [
    'https://alesancod2.github.io',
    'http://localhost',
    'http://127.0.0.1',
    'null' // file://
];

// Cookie store em memória (por sessão do worker)
let sessionCookies = '';

export default {
    async fetch(request) {
        // Handle preflight
        if (request.method === 'OPTIONS') {
            return handleCORS(new Response(null, { status: 204 }), request);
        }

        try {
            const url = new URL(request.url);
            const targetPath = url.pathname + url.search;
            const targetUrl = TARGET_BASE + targetPath;

            // Preparar headers para o aEasy
            const headers = new Headers();
            headers.set('Content-Type', request.headers.get('Content-Type') || 'application/x-www-form-urlencoded');
            headers.set('X-Requested-With', 'XMLHttpRequest');
            headers.set('User-Agent', 'Mozilla/5.0 Aurora-AVP Dashboard');

            // Enviar cookies da sessão
            if (sessionCookies) {
                headers.set('Cookie', sessionCookies);
            }

            // Preparar opções do fetch
            const fetchOptions = {
                method: request.method,
                headers: headers,
                redirect: 'manual', // Não seguir redirects (detectar sessão expirada)
            };

            // Body para POST
            if (request.method === 'POST') {
                fetchOptions.body = await request.text();
            }

            // Fazer requisição ao aEasy
            const response = await fetch(targetUrl, fetchOptions);

            // Capturar cookies da resposta (Set-Cookie)
            const setCookies = response.headers.getAll ? 
                response.headers.getAll('Set-Cookie') : 
                [response.headers.get('Set-Cookie')].filter(Boolean);

            if (setCookies.length > 0) {
                // Extrair nome=valor de cada Set-Cookie
                const cookieParts = setCookies.map(c => c.split(';')[0]);
                // Merge com cookies existentes
                const cookieMap = {};
                if (sessionCookies) {
                    sessionCookies.split('; ').forEach(c => {
                        const [k, ...v] = c.split('=');
                        cookieMap[k] = v.join('=');
                    });
                }
                cookieParts.forEach(c => {
                    const [k, ...v] = c.split('=');
                    cookieMap[k] = v.join('=');
                });
                sessionCookies = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
            }

            // Ler body da resposta
            const responseBody = await response.text();

            // Criar resposta com CORS headers
            const proxyResponse = new Response(responseBody, {
                status: response.status,
                headers: {
                    'Content-Type': response.headers.get('Content-Type') || 'application/json',
                }
            });

            return handleCORS(proxyResponse, request);

        } catch (error) {
            const errorResponse = new Response(JSON.stringify({
                error: true,
                message: error.message
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
            return handleCORS(errorResponse, request);
        }
    }
};

function handleCORS(response, request) {
    const origin = request.headers.get('Origin') || '*';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o)) || origin === 'null';

    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization');
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Max-Age', '86400');

    return new Response(response.body, {
        status: response.status,
        headers
    });
}
