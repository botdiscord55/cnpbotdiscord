const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'oposiciones.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }
    } catch {}
    return {};
}

function saveDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `OPS-${code}`;
}

function createOposicion(data) {
    const db = loadDB();
    const code = data.code || generateCode();
    if (db[code]) return null;
    db[code] = {
        code,
        userId: data.userId,
        userTag: data.userTag,
        fecha: data.fecha,
        hora: data.hora,
        estado: 'pendiente',
        aceptadoPor: data.aceptadoPor,
        aceptadoPorTag: data.aceptadoPorTag,
        fechaCreacion: new Date().toISOString(),
        fechaInicio: null,
    };
    saveDB(db);
    return code;
}

function getOposicion(code) {
    const db = loadDB();
    return db[code] || null;
}

function updateOposicion(code, data) {
    const db = loadDB();
    if (!db[code]) return null;
    Object.assign(db[code], data);
    saveDB(db);
    return db[code];
}

function getOposicionesByUser(userId) {
    const db = loadDB();
    return Object.values(db).filter(o => o.userId === userId && (o.estado === 'pendiente' || o.estado === 'en_curso'));
}

function deleteOposicion(code) {
    const db = loadDB();
    if (!db[code]) return false;
    delete db[code];
    saveDB(db);
    return true;
}

module.exports = { loadDB, createOposicion, getOposicion, updateOposicion, getOposicionesByUser, deleteOposicion };
