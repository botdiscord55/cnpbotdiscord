const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'miembros.json');

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

function getMiembro(userId) {
    const db = loadDB();
    return db[String(userId)] || null;
}

function setMiembro(userId, { nick, roles }) {
    const db = loadDB();
    db[String(userId)] = {
        userId: String(userId),
        nick: nick || null,
        roles: Array.isArray(roles) ? roles.map(String) : [],
        fechaSalida: new Date().toISOString(),
    };
    saveDB(db);
    return db[String(userId)];
}

function deleteMiembro(userId) {
    const db = loadDB();
    const key = String(userId);
    if (!db[key]) return false;
    delete db[key];
    saveDB(db);
    return true;
}

function contarMiembros() {
    return Object.keys(loadDB()).length;
}

module.exports = { getMiembro, setMiembro, deleteMiembro, contarMiembros };
