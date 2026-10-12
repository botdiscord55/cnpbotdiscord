const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const REPO_CODIGO = process.env.GITHUB_CODEREPO || 'botdiscord55/cnpbotdiscord';
const COMPROBAR_MS = 2 * 60 * 1000;
const RESENTIR_MS = 30 * 60 * 1000;

let intervalo = null;
let localActivo = null;
let ultimaRemotaVista = null;
let ultimoAviso = 0;
let ultimoFallo = 0;

function shaLocal() {
    try {
        const head = fs.readFileSync(path.join(ROOT, '.git', 'HEAD'), 'utf8').trim();
        if (!head.startsWith('ref: ')) return head;
        const ref = head.slice(5).trim();
        try {
            const loose = fs.readFileSync(path.join(ROOT, '.git', ref), 'utf8').trim();
            if (loose) return loose;
        } catch {}
        try {
            const packed = fs.readFileSync(path.join(ROOT, '.git', 'packed-refs'), 'utf8');
            const linea = packed.split(/\r?\n/).find(l => l && !l.startsWith('#') && l.endsWith(` ${ref}`));
            if (linea) return linea.split(' ')[0];
        } catch {}
        return null;
    } catch {
        return null;
    }
}

async function pedirSha(conToken) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'cnp-bot',
    };
    const token = process.env.GITHUB_TOKEN;
    if (conToken && token) headers.Authorization = `Bearer ${token}`;
    return fetch(`https://api.github.com/repos/${REPO_CODIGO}/commits/main`, { headers });
}

async function shaRemoto() {
    const hayToken = !!process.env.GITHUB_TOKEN;
    let conToken = hayToken;
    let res;
    try {
        res = await pedirSha(true);
    } catch (e) {
        if (!conToken) return { error: e.message };
        conToken = false;
        try { res = await pedirSha(false); } catch (e2) { return { error: `${e.message} (y sin token: ${e2.message})` }; }
    }

    if (conToken && !res.ok && [401, 403, 404].includes(res.status)) {
        const statusConToken = res.status;
        conToken = false;
        try {
            res = await pedirSha(false);
        } catch (e) {
            return { error: `HTTP ${statusConToken} con token (y sin token: ${e.message})` };
        }
        if (!res.ok) return { error: `HTTP ${statusConToken} con token y HTTP ${res.status} sin token` };
    }

    if (!res.ok) return { error: `HTTP ${res.status}` };
    const j = await res.json();
    if (!j || !j.sha) return { error: 'respuesta inesperada de GitHub' };
    return { sha: j.sha, fuente: conToken ? 'con token' : 'sin token (pública)' };
}

function anotarFallo(motivo) {
    const ahora = Date.now();
    if (ahora - ultimoFallo >= RESENTIR_MS) {
        ultimoFallo = ahora;
        console.log(`[AutoUpdate] ❌ No se pudo comprobar la versión: ${motivo}`);
    }
}

async function comprobarVersion({ automatica = false } = {}) {
    const local = localActivo || shaLocal();
    if (!local) {
        if (automatica) anotarFallo('no se pudo leer la versión local (.git)');
        else console.log('[AutoUpdate] ⚠ No se pudo leer la versión local (.git).');
        return null;
    }
    localActivo = local;

    const r = await shaRemoto().catch(e => ({ error: e.message }));
    if (r.error) {
        if (automatica) anotarFallo(r.error);
        else console.log(`[AutoUpdate] ❌ No se pudo comprobar con GitHub: ${r.error} (local: ${local.slice(0, 7)}).`);
        return null;
    }

    if (r.sha === local) {
        if (!automatica) console.log(`[AutoUpdate] ✔ Al día: en marcha ${local.slice(0, 7)} = GitHub ${r.sha.slice(0, 7)} · consulta: ${r.fuente}.`);
        return false;
    }

    const ahora = Date.now();
    if (automatica && r.sha === ultimaRemotaVista && ahora - ultimoAviso < RESENTIR_MS) return true;
    ultimaRemotaVista = r.sha;
    ultimoAviso = ahora;
    console.log(`[AutoUpdate] ⚠ NUEVA VERSIÓN disponible en GitHub (${r.sha.slice(0, 7)}; en marcha: ${local.slice(0, 7)}${automatica ? '' : ` · consulta: ${r.fuente}`}). Reinicia Hiden para aplicarla.`);
    return true;
}

function iniciarAutoUpdate() {
    if (intervalo) clearInterval(intervalo);
    localActivo = shaLocal();
    if (!localActivo) {
        console.log('[AutoUpdate] ⚠ No se pudo leer la versión local (.git). Comprobaciones de versión desactivadas.');
        return;
    }
    console.log(`[AutoUpdate] Versión en marcha: ${localActivo.slice(0, 7)} · comprobando ${REPO_CODIGO} cada 2 min (escribe "version" para comprobar ya).`);
    comprobarVersion({ automatica: false });
    intervalo = setInterval(() => comprobarVersion({ automatica: true }), COMPROBAR_MS);
}

module.exports = { iniciarAutoUpdate, comprobarVersion };
