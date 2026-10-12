const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const REPO_CODIGO = process.env.GITHUB_CODEREPO || 'botdiscord55/cnpbotdiscord';
const COMPROBAR_MS = 5 * 60 * 1000;
const RESENTIR_MS = 30 * 60 * 1000;

let intervalo = null;
let ultimaRemotaVista = null;
let ultimoAviso = 0;

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

async function shaRemoto() {
    const token = process.env.GITHUB_TOKEN;
    const res = await fetch(`https://api.github.com/repos/${REPO_CODIGO}/commits/main`, {
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'cnp-bot',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j && j.sha ? j.sha : null;
}

function iniciarAutoUpdate() {
    if (intervalo) clearInterval(intervalo);

    const local = shaLocal();
    if (!local) {
        console.log('[AutoUpdate] ⚠ No se pudo leer la versión local (.git). Comprobaciones de versión desactivadas.');
        return;
    }

    console.log(`[AutoUpdate] Versión en marcha: ${local.slice(0, 7)} · comprobando ${REPO_CODIGO} cada 5 min.`);

    const comprobar = async () => {
        try {
            const remota = await shaRemoto();
            if (!remota) return;
            if (remota === local) return;
            const ahora = Date.now();
            if (remota === ultimaRemotaVista && ahora - ultimoAviso < RESENTIR_MS) return;
            ultimaRemotaVista = remota;
            ultimoAviso = ahora;
            console.log(`[AutoUpdate] ⚠ NUEVA VERSIÓN disponible en GitHub (${remota.slice(0, 7)}; en marcha: ${local.slice(0, 7)}). Reinicia Hiden para aplicarla.`);
        } catch {}
    };

    comprobar();
    intervalo = setInterval(comprobar, COMPROBAR_MS);
}

module.exports = { iniciarAutoUpdate };
