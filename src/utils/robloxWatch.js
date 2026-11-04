// ─── Avisos privados por DM sobre usuarios de Roblox ──────────────────────────
// Consulta la API de presencia de Roblox cada 30 s y manda un DM al dueño del
// bot cuando uno de los usuarios vigilados se conecta, se desconecta o entra o
// sale de un juego; si 2 de ellos coinciden en el mismo juego, avisa si acaban
// en la MISMA sala o en salas distintas; y si alguien añade o quita amigos, lo
// avisa también (el recuento de amigos es público; la lista de nombres no lo es
// sin cookie de Roblox). Todo es por DM: nada pasa por #logs-bot ni por canales.

const OBJETIVOS = [4177772758, 7458338417, 435593627, 1819111834]; // ids de Roblox vigilados
const DUENIO_DM = '991791054535802880';                 // id de Discord que recibe los avisos
const INTERVALO_MS = 30 * 1000;
const AMIGOS_CADA = 2;                                  // revisar el recuento de amigos cada N revisiones (~1 min)
const PRESENCE_URL = 'https://presence.roblox.com/v1/presence/users';

let intervalo = null;
let client = null;
let enCurso = false;
let dmUser = null;
let avisoDmFallo = false;
let avisoApiFallo = false;

const estado = new Map();         // id Roblox -> 'offline' | 'web' | 'juego:<placeId>' | 'studio'
const nombres = new Map();        // id Roblox -> nombre de usuario en Roblox
const juegosPorPlace = new Map(); // placeId -> nombre del juego
const detallesJuego = new Map();  // id Roblox -> { placeId, universeId, gameId } (solo si está en un juego)
const pares = new Map();          // "idA_idB" (idA < idB) -> 'juntos' | 'separados'
const amigos = new Map();         // id Roblox -> nº de amigos (recuento público)
let contadorRevisiones = 0;
let primeraRevision = true;

// 0 = fuera, 1 = en la web, 2 = en un juego, 3 = en Roblox Studio.
function claveDe(p) {
    const t = p.userPresenceType;
    if (t === 0) return 'offline';
    if (t === 2) return `juego:${p.placeId || '?'}`;
    if (t === 3) return 'studio';
    return 'web';
}

async function nombreDe(userId) {
    if (nombres.has(userId)) return nombres.get(userId);
    try {
        const r = await fetch(`https://users.roblox.com/v1/users/${userId}`);
        if (r.ok) {
            const j = await r.json();
            if (j && j.name) {
                nombres.set(userId, j.name);
                return j.name;
            }
        }
    } catch {}
    return `Usuario ${userId}`;
}

async function nombreDeJuego(placeId, universeId) {
    if (placeId && juegosPorPlace.has(placeId)) return juegosPorPlace.get(placeId);
    let nombre = '';
    try {
        let uni = universeId;
        if (!uni && placeId) {
            const rU = await fetch(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
            if (rU.ok) uni = (await rU.json()).universeId;
        }
        if (uni) {
            const rG = await fetch(`https://games.roblox.com/v1/games?universeIds=${uni}`);
            if (rG.ok) {
                const j = await rG.json();
                nombre = (j.data && j.data[0] && j.data[0].name) || '';
            }
        }
    } catch {}
    if (!nombre) nombre = placeId ? `lugar ${placeId}` : 'un juego';
    if (placeId) juegosPorPlace.set(placeId, nombre);
    return nombre;
}

// Texto del aviso según el cambio de estado (null = nada que avisar).
function describir(nombre, antes, ahora, juegoAhora, juegoAntes) {
    const enJuego = k => k.startsWith('juego:');
    if (antes === ahora) return null;

    if (ahora === 'offline') return `🔴 ${nombre} se ha desconectado`;

    if (antes === 'offline') {
        if (enJuego(ahora)) return `🎮 ${nombre} se ha conectado a "${juegoAhora}"`;
        if (ahora === 'studio') return `🟢 ${nombre} se ha conectado (Roblox Studio)`;
        return `🟢 ${nombre} se ha conectado`;
    }

    if (enJuego(ahora) && !enJuego(antes)) return `🎮 ${nombre} se ha conectado a "${juegoAhora}"`;
    if (enJuego(antes) && !enJuego(ahora)) {
        if (ahora === 'studio') return `🔧 ${nombre} ha salido de "${juegoAntes}" y entrado en Roblox Studio`;
        return `👋 ${nombre} ha salido de "${juegoAntes}"`;
    }
    if (enJuego(ahora) && enJuego(antes)) return `🔁 ${nombre} ha cambiado a "${juegoAhora}"`;
    if (ahora === 'studio') return `🔧 ${nombre} ha entrado en Roblox Studio`;
    if (antes === 'studio') return `🔧 ${nombre} ha salido de Roblox Studio`;
    return `🔄 ${nombre} ha cambiado de estado`;
}

function par(a, b) {
    return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// Dos vigilados en el mismo juego: avisa si acaban en la misma sala o separados.
// Devuelve las líneas para mandarlas todas juntas en un solo DM.
async function revisarPares({ silencioso = false } = {}) {
    const enJuego = [...estado.keys()].filter(id => String(estado.get(id)).startsWith('juego:'));
    const actuales = new Map();
    for (let i = 0; i < enJuego.length; i++) {
        for (let j = i + 1; j < enJuego.length; j++) {
            const a = enJuego[i];
            const b = enJuego[j];
            const da = detallesJuego.get(a);
            const db = detallesJuego.get(b);
            if (!da || !db || !da.universeId || da.universeId !== db.universeId) continue;
            if (!da.gameId || !db.gameId) continue;
            actuales.set(par(a, b), da.gameId === db.gameId ? 'juntos' : 'separados');
        }
    }

    for (const k of [...pares.keys()]) {
        if (!actuales.has(k)) pares.delete(k);
    }

    const lineas = [];
    for (const [k, rel] of actuales) {
        const antes = pares.get(k);
        pares.set(k, rel);
        if (silencioso || antes === rel) continue;
        const a = Number(k.split('_')[0]);
        const b = Number(k.split('_')[1]);
        const nombreA = await nombreDe(a);
        const nombreB = await nombreDe(b);
        const d = detallesJuego.get(a) || detallesJuego.get(b);
        const juego = await nombreDeJuego(d.placeId, d.universeId);
        if (rel === 'juntos') {
            lineas.push(antes === 'separados'
                ? `✅ ${nombreA} y ${nombreB} están ahora en la MISMA sala de "${juego}"`
                : `🤝 ${nombreA} y ${nombreB} están en la MISMA sala de "${juego}"`);
        } else {
            lineas.push(antes === 'juntos'
                ? `💔 ${nombreA} y ${nombreB} ya no están juntos: ahora en salas distintas de "${juego}"`
                : `💔 ${nombreA} y ${nombreB} están en "${juego}" pero en salas distintas`);
        }
    }
    return lineas;
}

// Recuento de amigos (endpoint público; la lista de nombres exige cookie).
// Devuelve las líneas de cambio para mandarlas juntas en un solo DM.
async function revisarAmigos({ silencioso = false } = {}) {
    const lineas = [];
    for (const id of OBJETIVOS) {
        let cuenta = null;
        try {
            const r = await fetch(`https://friends.roblox.com/v1/users/${id}/friends/count`);
            if (r.ok) cuenta = (await r.json()).count;
        } catch {}
        if (cuenta === null || typeof cuenta !== 'number') continue;
        const antes = amigos.get(id);
        amigos.set(id, cuenta);
        if (silencioso || antes === undefined || antes === cuenta) continue;
        const nombre = await nombreDe(id);
        lineas.push(cuenta > antes
            ? `➕ ${nombre} ha añadido a alguien (amigos: ${antes} → ${cuenta})`
            : `➖ ${nombre} ha quitado a alguien (amigos: ${antes} → ${cuenta})`);
    }
    return lineas;
}

async function enviarDm(texto) {
    try {
        if (!dmUser) dmUser = await client.users.fetch(DUENIO_DM);
        await dmUser.send(texto);
    } catch (e) {
        // Un solo aviso en consola aunque falle muchas veces (nada de spam en logs).
        if (!avisoDmFallo) {
            avisoDmFallo = true;
            console.error(`[RobloxWatch] No pude mandar el DM a ${DUENIO_DM}: ${e.message || e}`);
        }
    }
}

async function vigilar() {
    if (enCurso || !client) return;
    enCurso = true;
    try {
        const resp = await fetch(PRESENCE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: OBJETIVOS }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const datos = await resp.json();
        const lista = Array.isArray(datos.userPresences) ? datos.userPresences : [];

        for (const p of lista) {
            const id = p.userId;
            const ahora = claveDe(p);
            const primera = !estado.has(id);
            const antes = estado.get(id);
            estado.set(id, ahora);
            if (ahora.startsWith('juego:')) {
                detallesJuego.set(id, { placeId: p.placeId, universeId: p.universeId, gameId: p.gameId });
            } else {
                detallesJuego.delete(id);
            }
            // Primera lectura: se fija el estado en silencio (sin avisos al arrancar).
            if (primera || antes === ahora) continue;

            const nombre = await nombreDe(id);
            const juegoAhora = ahora.startsWith('juego:') ? await nombreDeJuego(p.placeId, p.universeId) : '';
            const juegoAntes = antes.startsWith('juego:') ? await nombreDeJuego(Number(antes.slice(6)), null) : '';
            const texto = describir(nombre, antes, ahora, juegoAhora, juegoAntes);
            if (texto) await enviarDm(texto);
        }

        // Coincidencias entre vigilados en el mismo juego (misma sala o separados).
        const lineasPares = await revisarPares({ silencioso: primeraRevision });
        if (lineasPares.length) await enviarDm(lineasPares.join('\n'));

        // Recuento de amigos: avisa si alguien añade o quita a alguien.
        contadorRevisiones++;
        if (contadorRevisiones === 1 || contadorRevisiones % AMIGOS_CADA === 0) {
            const lineasAmigos = await revisarAmigos({ silencioso: primeraRevision });
            if (lineasAmigos.length) await enviarDm(lineasAmigos.join('\n'));
        }

        primeraRevision = false;

        avisoApiFallo = false;
    } catch (e) {
        if (!avisoApiFallo) {
            avisoApiFallo = true;
            console.error(`[RobloxWatch] Fallo al consultar la API de Roblox (se reintenta solo): ${e.message || e}`);
        }
    } finally {
        enCurso = false;
    }
}

function reiniciar() {
    estado.clear();
    nombres.clear();
    juegosPorPlace.clear();
    detallesJuego.clear();
    pares.clear();
    amigos.clear();
    contadorRevisiones = 0;
    primeraRevision = true;
    avisoApiFallo = false;
}

function iniciarRobloxWatch(cli) {
    if (intervalo) return;
    client = cli;
    console.log(`[RobloxWatch] Vigilando ${OBJETIVOS.length} usuarios de Roblox; avisos solo por DM (nada en canales ni en #logs-bot).`);
    vigilar().catch(() => {});
    intervalo = setInterval(() => vigilar().catch(() => {}), INTERVALO_MS);
    if (intervalo.unref) intervalo.unref();
}

module.exports = {
    iniciarRobloxWatch,
    __test: { vigilar, claveDe, describir, nombreDe, nombreDeJuego, revisarAmigos, reiniciar },
};
