const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'testmsgs.json');

function load() {
    try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

function save(db) {
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function registrarTestMsg(messageId, channelId, tipo) {
    if (!messageId) return;
    const db = load();
    db[String(messageId)] = { canal: channelId || '', tipo: tipo || '', fecha: new Date().toISOString() };
    save(db);
}

function esTestMsg(messageId) {
    if (!messageId) return false;
    return !!load()[String(messageId)];
}

function listarTestMsgs() {
    const db = load();
    return Object.entries(db).map(([id, v]) => ({ id, canal: (v && v.canal) || '', tipo: (v && v.tipo) || '' }));
}

function olvidarTestMsg(messageId) {
    const db = load();
    const key = String(messageId);
    if (db[key]) {
        delete db[key];
        save(db);
    }
}

module.exports = { registrarTestMsg, esTestMsg, listarTestMsgs, olvidarTestMsg };
