const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const DB_PATH = path.join(__dirname, '..', 'database', 'plantillas.json');
const BACKUP_DIR = path.join(__dirname, '..', 'database', 'backups');
const VENTANA_DUP = 600000;
const MAX_MENSAJES = 30000;

function leerDB() {
    if (!fs.existsSync(DB_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function respaldo(db) {
    try {
        if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const nombre = `plantillas-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(path.join(BACKUP_DIR, nombre), JSON.stringify(db, null, 2));
        return nombre;
    } catch {
        return null;
    }
}

function escribirDB(nuevas) {
    const db = leerDB();
    let anadidas = 0;
    for (const [id, reg] of Object.entries(nuevas)) {
        if (db[id]) continue;
        db[id] = reg;
        anadidas++;
    }
    if (anadidas) fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return anadidas;
}

function fechaMensaje(m) {
    return new Date(Number(BigInt(m.id) >> 22n) + 1420070400000);
}

function textoMensaje(m) {
    const partes = [];
    if (m.content) partes.push(m.content);
    for (const e of m.embeds || []) {
        if (e.title) partes.push(e.title);
        if (e.description) partes.push(e.description);
        for (const f of e.fields || []) partes.push(`${f.name} ${f.value}`);
        if (e.footer && e.footer.text) partes.push(e.footer.text);
    }
    const walk = (c) => {
        if (!c) return;
        if (c.type === 10 && c.content) partes.push(c.content);
        if (c.components) c.components.forEach(walk);
    };
    (m.components || []).forEach(walk);
    return partes.join('\n');
}

function idsAccion(m) {
    const ids = [];
    const walk = (c) => {
        if (!c) return;
        if (c.custom_id) ids.push(c.custom_id);
        if (c.components) c.components.forEach(walk);
    };
    (m.components || []).forEach(walk);
    return ids;
}

async function traerMensajes(rest, canalId, max = MAX_MENSAJES) {
    const todos = [];
    let before;
    while (todos.length < max) {
        const query = new URLSearchParams({ limit: '100' });
        if (before) query.set('before', before);
        const lote = await rest.get(Routes.channelMessages(canalId), { query });
        if (!lote.length) break;
        lote.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1));
        todos.push(...lote);
        before = lote[lote.length - 1].id;
        if (lote.length < 100) break;
    }
    return todos;
}

function clasificarAnuncio(t) {
    if (!t) return null;
    if (/\bveto\b|VETO-[A-Z0-9]+/i.test(t)) return null;
    if (/PLANTILLA\s+(RECHAZADA|DENEGADA)/i.test(t)) return 'denegada';
    if (/su plantilla[^.\n]{0,160}ha sido \*{0,2}(denegada|rechazada)/i.test(t)) return 'denegada';
    if (/❌/.test(t) && /plantilla[^.\n]{0,80}(denegada|rechazada)/i.test(t)) return 'denegada';
    if (/PLANTILLA\s+(ACEPTADA|APROBADA)/i.test(t)) return 'aceptada';
    if (/plantilla[^.\n]{0,160}ha sido \*{0,2}(aceptada|aprobada)/i.test(t)) return 'aceptada';
    if (/✅/.test(t) && /plantilla\s+(aceptada|aprobada)/i.test(t)) return 'aceptada';
    return null;
}

function campo(t, etiqueta) {
    const m = t.match(new RegExp(`\\*\\*\\*${etiqueta}:\\*\\*\\*\\s*([^\\n]+)`));
    if (!m) return null;
    return m[1].replace(/<a?:\w+:\d+>/g, '').replace(/\*/g, '').trim() || null;
}

function parseFicha(t) {
    const userId = (t.match(/ID Única:[^`]*`(\d{15,21})`/) || [])[1]
        || (t.match(/Información OOC del solicitante:\s*<@(\d{15,21})>/) || [])[1];
    if (!userId) return null;
    return {
        userId,
        pid: (t.match(/ID de la solicitud:[^`]*`([^`]+)`/) || [])[1] || null,
        nombre: campo(t, 'Nombre Completo'),
        dni: campo(t, 'Número de DNI'),
        edad: campo(t, 'Edad OOC'),
        pg: campo(t, 'Concepto de PG'),
        mg: campo(t, 'Concepto de MG'),
        bd: campo(t, 'Concepto de BD'),
        vdm: campo(t, 'Concepto de VDM'),
        licConducir: campo(t, 'Licencia de Conducir'),
        licArmas: campo(t, 'Licencia de Armas'),
        multas: campo(t, 'Multas/Antecedentes'),
    };
}

function tsResolucion(v) {
    const f = v.fechaAceptacion || v.fechaDenegacion || v.fechaRetirada;
    return f ? new Date(f).getTime() : NaN;
}

function indiceDuplicados(db) {
    const idx = new Map();
    for (const v of Object.values(db)) {
        if (!v.estado || v.estado === 'pendiente' || v.estado === 'reclamada') continue;
        const ts = tsResolucion(v);
        if (!Number.isFinite(ts)) continue;
        const key = `${v.userId}|${v.estado}`;
        if (!idx.has(key)) idx.set(key, []);
        idx.get(key).push(ts);
    }
    return idx;
}

function duplicado(idx, userId, estado, ts) {
    const lista = idx.get(`${userId}|${estado}`);
    if (!lista) return false;
    return lista.some(t => Math.abs(t - ts) <= VENTANA_DUP);
}

function anotar(idx, userId, estado, ts) {
    const key = `${userId}|${estado}`;
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(ts);
}

function recuperarDeCopias(db) {
    const nuevas = {};
    let base;
    try {
        base = path.resolve(__dirname, '..', '..', '..');
        if (!fs.existsSync(base)) return nuevas;
    } catch {
        return nuevas;
    }
    const dirs = fs.readdirSync(base).filter(d => d.startsWith('archive-')).sort();
    const candidatas = new Map();
    for (const d of dirs) {
        const p = path.join(base, d, 'src', 'database', 'plantillas.json');
        if (!fs.existsSync(p)) continue;
        let data;
        try {
            data = JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch {
            continue;
        }
        for (const [id, v] of Object.entries(data)) {
            if (db[id] || v.test === true || candidatas.has(id)) continue;
            candidatas.set(id, v);
        }
    }
    for (const [id, v] of candidatas) {
        nuevas[id] = { ...v, recuperada: true, fuente: 'copia_local' };
    }
    return nuevas;
}

async function recuperarFichas(db, rest, idx) {
    const nuevas = {};
    const canal = process.env.canalregistro_plantillaenviar;
    if (!canal) return { nuevas, leidos: 0 };

    console.log('[Recuperar] Leyendo canal de registro...');
    const mensajes = await traerMensajes(rest, canal);
    let fichas = 0;

    for (const m of mensajes) {
        const t = textoMensaje(m);
        if (!/Ficha de Identificación General/.test(t)) continue;
        fichas++;
        const f = parseFicha(t);
        if (!f) continue;

        const fecha = fechaMensaje(m);
        const pid = f.pid || `${f.userId}_${fecha.getTime()}`;
        if (db[pid]) continue;
        const idPorFecha = Object.values(db).some(v => v.userId === f.userId && v.fechaCreacion
            && Math.abs(new Date(v.fechaCreacion) - fecha) < 30000);
        if (idPorFecha) continue;

        let estado = 'pendiente';
        if (/Solicitud Aceptada/i.test(t)) estado = 'aceptada';
        else if (/Solicitud Denegada/i.test(t)) estado = 'denegada';
        else if (idsAccion(m).some(i => i.startsWith('decision_'))) estado = 'reclamada';

        const resolucion = m.edited_timestamp ? new Date(m.edited_timestamp) : fecha;
        const reg = {
            userId: f.userId,
            userTag: null,
            userName: null,
            nombre: f.nombre,
            dni: f.dni,
            edad: f.edad,
            pg: f.pg,
            mg: f.mg,
            bd: f.bd,
            vdm: f.vdm,
            licConducir: f.licConducir,
            licArmas: f.licArmas,
            multas: f.multas,
            estado,
            fechaCreacion: fecha.toISOString(),
            recuperada: true,
            fuente: 'canal_registro',
        };
        if (estado === 'aceptada') reg.fechaAceptacion = resolucion.toISOString();
        if (estado === 'denegada') reg.fechaDenegacion = resolucion.toISOString();

        nuevas[pid] = reg;
        if (estado !== 'pendiente' && estado !== 'reclamada') {
            anotar(idx, f.userId, estado, resolucion.getTime());
        }
    }

    return { nuevas, leidos: mensajes.length, fichas };
}

async function recuperarAnuncios(db, rest, idx) {
    const nuevas = {};
    const canal = process.env.canalresultados_plantillasenviadas;
    if (!canal) return { nuevas, leidos: 0 };

    console.log('[Recuperar] Leyendo canal de resultados...');
    const mensajes = await traerMensajes(rest, canal);
    let anuncios = 0, creados = 0, duplicados = 0;

    for (const m of mensajes) {
        const t = textoMensaje(m);
        if (!/plantilla/i.test(t)) continue;
        const estado = clasificarAnuncio(t);
        if (!estado) continue;
        const userId = (t.match(/<@(\d{15,21})>/) || [])[1];
        if (!userId) continue;
        anuncios++;

        const fecha = fechaMensaje(m);
        const ts = fecha.getTime();
        if (duplicado(idx, userId, estado, ts)) {
            duplicados++;
            continue;
        }

        const id = `${userId}_${ts}`;
        if (db[id] || nuevas[id]) {
            duplicados++;
            continue;
        }

        const reg = {
            userId,
            userTag: null,
            userName: null,
            nombre: null,
            dni: null,
            edad: null,
            pg: null,
            mg: null,
            bd: null,
            vdm: null,
            licConducir: null,
            licArmas: null,
            multas: null,
            estado,
            fechaCreacion: fecha.toISOString(),
            recuperada: true,
            fuente: 'anuncio_resultados',
        };
        if (estado === 'aceptada') reg.fechaAceptacion = fecha.toISOString();
        else reg.fechaDenegacion = fecha.toISOString();

        nuevas[id] = reg;
        anotar(idx, userId, estado, ts);
        creados++;
    }

    return { nuevas, leidos: mensajes.length, anuncios, creados, duplicados };
}

async function recuperarPlantillas(client) {
    const rest = client && client.rest
        ? client.rest
        : new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    const db = leerDB();
    const antes = Object.keys(db).length;
    const respaldoNombre = respaldo(db);
    const idx = indiceDuplicados(db);

    const resumen = { antes, respaldo: respaldoNombre, copias: 0, fichas: 0, anuncios: 0, total: 0 };

    console.log('[Recuperar] Fase 1/3: copias locales de la base de datos...');
    const copias = recuperarDeCopias(db);
    resumen.copias = Object.keys(copias).length;

    console.log('[Recuperar] Fase 2/3: fichas del canal de registro...');
    const rFichas = await recuperarFichas(db, rest, idx);
    resumen.fichas = Object.keys(rFichas.nuevas).length;
    console.log(`[Recuperar]   mensajes leídos: ${rFichas.leidos} · fichas: ${rFichas.fichas} · nuevas: ${resumen.fichas}`);

    console.log('[Recuperar] Fase 3/3: anuncios del canal de resultados...');
    const rAnuncios = await recuperarAnuncios(db, rest, idx);
    resumen.anuncios = Object.keys(rAnuncios.nuevas).length;
    console.log(`[Recuperar]   mensajes leídos: ${rAnuncios.leidos} · anuncios: ${rAnuncios.anuncios} · duplicados: ${rAnuncios.duplicados} · nuevos: ${resumen.anuncios}`);

    const todas = { ...copias, ...rFichas.nuevas, ...rAnuncios.nuevas };
    resumen.total = escribirDB(todas);
    resumen.despues = antes + resumen.total;

    const porEstado = {};
    for (const v of Object.values(todas)) porEstado[v.estado] = (porEstado[v.estado] || 0) + 1;
    resumen.porEstado = porEstado;

    return resumen;
}

module.exports = { recuperarPlantillas };
