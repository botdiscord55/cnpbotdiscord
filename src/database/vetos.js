const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'vetos.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch {}
    return {};
}

function saveDB(data) {
    const contenido = JSON.stringify(data, null, 2);
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, contenido);
    try { fs.renameSync(tmp, DB_PATH); } catch { fs.writeFileSync(DB_PATH, contenido); }
}

function getVeto(vetoId) {
    const db = loadDB();
    return db[vetoId] || null;
}

function getVetoByUser(userId, { includeTest = false } = {}) {
    const db = loadDB();
    const ahora = Date.now();
    return Object.entries(db).find(([, v]) =>
        v.userId === userId &&
        (v.estado === 'activo' || v.estado === 'confirmado') &&
        (includeTest || v.test !== true) &&
        !(v.expiresAt && Date.parse(v.expiresAt) <= ahora)
    ) || null;
}

function getVetosExpirados() {
    const db = loadDB();
    const ahora = Date.now();
    return Object.entries(db).filter(([, v]) =>
        (v.estado === 'activo' || v.estado === 'confirmado') &&
        v.expiresAt &&
        Date.parse(v.expiresAt) <= ahora
    );
}

function createVeto(data) {
    const db = loadDB();
    const id = `VETO-${Date.now().toString(36).toUpperCase()}`;
    db[id] = {
        id,
        userId: data.userId,
        motivo: data.motivo,
        estado: 'activo',
        creadoPor: data.creadoPor,
        creadoPorTag: data.creadoPorTag,
        creadoPorNickname: data.creadoPorNickname,
        fechaCreacion: new Date().toISOString(),
        revisadoPor: null,
        fechaRevision: null,
    };
    if (data.test === true) db[id].test = true;
    if (data.duracion) db[id].duracion = data.duracion;
    saveDB(db);
    return id;
}

function updateVeto(vetoId, data) {
    const db = loadDB();
    if (!db[vetoId]) return null;
    Object.assign(db[vetoId], data);
    saveDB(db);
    return db[vetoId];
}

function deleteVeto(vetoId) {
    const db = loadDB();
    if (!db[vetoId]) return false;
    delete db[vetoId];
    saveDB(db);
    return true;
}

function getVetosTest(userId = null) {
    const db = loadDB();
    return Object.entries(db).filter(([, v]) => v.test === true && (!userId || v.userId === userId)).map(([id]) => id);
}

function getVetosByUser(userId) {
    const db = loadDB();
    return Object.entries(db)
        .filter(([, v]) => String(v.userId) === String(userId))
        .map(([id, v]) => ({ id, ...v }));
}

function getTodosVetos() {
    const db = loadDB();
    return Object.entries(db).map(([id, v]) => ({ id, ...v }));
}

function getVetosActivos() {
    const db = loadDB();
    return Object.values(db).filter(v => v.estado === 'activo');
}

function cleanRevoked() {
    const db = loadDB();
    const oneHourAgo = Date.now() - 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [id, veto] of Object.entries(db)) {
        if (veto.estado === 'revocado' && veto.fechaRevision) {
            if (new Date(veto.fechaRevision).getTime() < oneHourAgo) {
                delete db[id];
                changed = true;
            }
        }
    }
    if (changed) saveDB(db);
}

setInterval(cleanRevoked, 30 * 60 * 1000).unref();

module.exports = { getVeto, getVetoByUser, createVeto, updateVeto, getVetosActivos, deleteVeto, getVetosTest, getVetosByUser, getVetosExpirados, getTodosVetos };
