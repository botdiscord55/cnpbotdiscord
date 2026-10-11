const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'suspendidas.json');

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

function getSuspendidas(userId) {
    const db = loadDB();
    return db[userId] || { count: 0 };
}

function addSuspendida(userId) {
    const db = loadDB();
    if (!db[userId]) db[userId] = { count: 0, fechas: [] };
    db[userId].count++;
    db[userId].fechas.push(new Date().toISOString());
    saveDB(db);
    return db[userId];
}

function resetSuspendidas(userId) {
    const db = loadDB();
    delete db[userId];
    saveDB(db);
}

module.exports = { getSuspendidas, addSuspendida, resetSuspendidas };
