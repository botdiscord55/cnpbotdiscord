const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', 'database');
const ARCHIVOS = ['plantillas.json', 'reclamaciones.json', 'oposiciones.json', 'vetos.json', 'suspendidas.json', 'testmsgs.json'];
const INTERVALO_MS = 60000;

const REPO = process.env.GITHUB_DATAREPO || 'botdiscord55/cnpbotdatos';
const API = 'https://api.github.com';

let ultimoHash = null;
let intervalo = null;
let subiendo = false;

function token() {
    return process.env.GITHUB_TOKEN || null;
}

async function gh(method, ruta, body) {
    const res = await fetch(`${API}${ruta}`, {
        method,
        headers: {
            Authorization: `Bearer ${token()}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'cnp-bot',
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res;
}

function leerArchivo(f) {
    const p = path.join(DB_DIR, f);
    if (!fs.existsSync(p)) return null;
    try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function leerTodo() {
    const datos = {};
    for (const f of ARCHIVOS) datos[f] = leerArchivo(f);
    return datos;
}

function hashDe(datos) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(datos)).digest('hex');
}

function necesitaRestaurar() {
    const contenido = leerArchivo('plantillas.json');
    if (contenido === null) return true;
    if (!contenido.trim()) return true;
    try { JSON.parse(contenido); return false; } catch { return true; }
}

async function hacerRespaldo(client, { forzar = false } = {}) {
    if (subiendo) return { ok: false, error: 'ya hay un respaldo en curso' };
    if (!token()) return { ok: false, error: 'falta GITHUB_TOKEN en .env' };

    subiendo = true;
    try {
        const datos = leerTodo();
        const hash = hashDe(datos);
        if (!forzar && hash === ultimoHash) return { ok: true, sinCambios: true };

        const refRes = await gh('GET', `/repos/${REPO}/git/ref/heads/main`);
        if (!refRes.ok) return { ok: false, error: `git/ref: HTTP ${refRes.status}` };
        const ref = await refRes.json();
        const headSha = ref.object.sha;

        const commitRes = await gh('GET', `/repos/${REPO}/git/commits/${headSha}`);
        if (!commitRes.ok) return { ok: false, error: `commit base: HTTP ${commitRes.status}` };
        const parent = await commitRes.json();

        const tree = [];
        let bytes = 0;
        for (const f of ARCHIVOS) {
            const contenido = datos[f];
            if (contenido == null) continue;
            const blobRes = await gh('POST', `/repos/${REPO}/git/blobs`, {
                content: Buffer.from(contenido, 'utf8').toString('base64'),
                encoding: 'base64',
            });
            if (!blobRes.ok) return { ok: false, error: `blob ${f}: HTTP ${blobRes.status}` };
            const blob = await blobRes.json();
            tree.push({ path: f, mode: '100644', type: 'blob', sha: blob.sha });
            bytes += contenido.length;
        }

        const treeRes = await gh('POST', `/repos/${REPO}/git/trees`, {
            base_tree: parent.tree.sha,
            tree,
        });
        if (!treeRes.ok) return { ok: false, error: `tree: HTTP ${treeRes.status}` };
        const newTree = await treeRes.json();

        const now = new Date();
        const fecha = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const newCommitRes = await gh('POST', `/repos/${REPO}/git/commits`, {
            message: `respaldo ${fecha}`,
            tree: newTree.sha,
            parents: [headSha],
        });
        if (!newCommitRes.ok) return { ok: false, error: `commit: HTTP ${newCommitRes.status}` };
        const newCommit = await newCommitRes.json();

        const patchRes = await gh('PATCH', `/repos/${REPO}/git/refs/heads/main`, { sha: newCommit.sha });
        if (!patchRes.ok) return { ok: false, error: `ref: HTTP ${patchRes.status}` };

        ultimoHash = hash;
        const detalle = Object.entries(datos)
            .filter(([, c]) => c != null)
            .map(([f, c]) => `${f} ${Buffer.byteLength(c, 'utf8')} B`)
            .join(' · ');
        return { ok: true, bytes, sha: newCommit.sha, archivos: detalle };
    } catch (e) {
        return { ok: false, error: e.message };
    } finally {
        subiendo = false;
    }
}

async function restaurarRespaldo(client, { forzar = false } = {}) {
    if (!token()) return { ok: false, error: 'falta GITHUB_TOKEN en .env' };
    try {
        if (!forzar && !necesitaRestaurar()) {
            return { ok: false, motivo: 'la base de datos local está intacta, no hace falta restaurar' };
        }

        const tmpDir = {};
        for (const f of ARCHIVOS) {
            const res = await gh('GET', `/repos/${REPO}/contents/${f}?ref=main`);
            if (res.status === 404) continue;
            if (!res.ok) return { ok: false, error: `${f}: HTTP ${res.status}` };
            const json = await res.json();
            tmpDir[f] = Buffer.from(json.content, 'base64').toString('utf8');
            if (tmpDir[f] != null) JSON.parse(tmpDir[f]);
        }

        if (tmpDir['plantillas.json'] == null) {
            return { ok: false, motivo: 'no hay plantillas.json en el repositorio de respaldo' };
        }

        let escritos = 0;
        for (const [f, contenido] of Object.entries(tmpDir)) {
            fs.writeFileSync(path.join(DB_DIR, f), contenido);
            escritos++;
        }

        ultimoHash = hashDe(leerTodo());
        return { ok: true, escritos };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function iniciarRespaldo(client) {
    if (intervalo) clearInterval(intervalo);
    ultimoHash = hashDe(leerTodo());
    if (!token()) {
        console.log('[Respaldo] ⚠ GITHUB_TOKEN no configurado, respaldos desactivados.');
        return;
    }

    const datos = leerTodo();
    let plantillas = '?';
    try { plantillas = Object.keys(JSON.parse(datos['plantillas.json'] || '{}')).length; } catch {}
    const bytesLocal = Object.values(datos).filter(c => c != null).reduce((n, c) => n + Buffer.byteLength(c, 'utf8'), 0);

    console.log(`[Respaldo] Activado → ${REPO} (comprueba cada 60 s y sube solo si hay cambios).`);
    console.log(`[Respaldo] BD local: ${plantillas} plantilla(s) · ${bytesLocal} B.`);
    console.log(`[Respaldo] Se respalda TODO: ${ARCHIVOS.join(' · ')}.`);

    let ticks = 0;
    let ultimaSubida = null;
    intervalo = setInterval(async () => {
        ticks++;
        const r = await hacerRespaldo(client);
        if (r.ok && !r.sinCambios) {
            ultimaSubida = new Date();
            console.log(`[Respaldo] ✅ ACTUALIZADO en GitHub a las ${ultimaSubida.toTimeString().slice(0, 5)} — commit ${String(r.sha).slice(0, 7)} · ${r.bytes} B · ${r.archivos}`);
        } else if (!r.ok) {
            console.log(`[Respaldo] ❌ ${r.error}`);
        } else if (ticks === 1) {
            console.log('[Respaldo] ✔ Primera comprobación completada: sin cambios (lo más reciente ya está en GitHub).');
        } else if (ticks % 10 === 0) {
            const act = leerTodo();
            const bytes = Object.values(act).filter(c => c != null).reduce((n, c) => n + Buffer.byteLength(c, 'utf8'), 0);
            let n = '?';
            try { n = Object.keys(JSON.parse(act['plantillas.json'] || '{}')).length; } catch {}
            console.log(`[Respaldo] ✔ En línea · sin cambios · ${n} plantilla(s) · ${bytes} B${ultimaSubida ? ` · última subida ${ultimaSubida.toTimeString().slice(0, 5)}` : ''}`);
        }
    }, INTERVALO_MS);
}

module.exports = { hacerRespaldo, restaurarRespaldo, iniciarRespaldo, necesitaRestaurar };
