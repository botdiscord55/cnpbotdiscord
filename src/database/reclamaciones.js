const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'reclamaciones.json');

function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2));
        return {};
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
}

function saveDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function registrarReclamacion({ plantillaId, userId, userTag, reclamadaPor, reclamadaTag, reclamadaNickname }) {
    const db = loadDB();
    db[plantillaId] = {
        plantillaId,
        userId: String(userId),
        userTag: userTag || null,
        reclamadaPor: String(reclamadaPor),
        reclamadaTag: reclamadaTag || null,
        reclamadaNickname: reclamadaNickname || null,
        fechaReclamacion: new Date().toISOString(),
        estado: 'reclamada',
        resueltaPor: null,
        resueltaTag: null,
        fechaResolucion: null,
    };
    saveDB(db);
    return db[plantillaId];
}

function resolverReclamacion(plantillaId, { estado, resueltaPor, resueltaTag, resueltaNickname }) {
    const db = loadDB();
    if (!db[plantillaId]) return null;
    db[plantillaId] = {
        ...db[plantillaId],
        estado,
        resueltaPor: resueltaPor ? String(resueltaPor) : db[plantillaId].resueltaPor,
        resueltaTag: resueltaTag || db[plantillaId].resueltaTag,
        resueltaNickname: resueltaNickname || db[plantillaId].resueltaNickname,
        fechaResolucion: new Date().toISOString(),
    };
    saveDB(db);
    return db[plantillaId];
}

function getReclamacion(plantillaId) {
    const db = loadDB();
    return db[plantillaId] || null;
}

function deleteReclamacion(plantillaId) {
    const db = loadDB();
    if (!db[plantillaId]) return false;
    delete db[plantillaId];
    saveDB(db);
    return true;
}

function getReclamacionesByInstructor(instructorId) {
    const db = loadDB();
    return Object.values(db)
        .filter(r => r.reclamadaPor === String(instructorId))
        .sort((a, b) => new Date(b.fechaReclamacion || 0) - new Date(a.fechaReclamacion || 0));
}

function contarReclamaciones(instructorId) {
    const reclamaciones = getReclamacionesByInstructor(instructorId);
    const counts = { reclamada: 0, aceptada: 0, denegada: 0, retirada: 0, cancelada: 0 };
    for (const r of reclamaciones) {
        if (counts[r.estado] === undefined) counts[r.estado] = 0;
        counts[r.estado]++;
    }
    return { total: reclamaciones.length, counts, ultima: reclamaciones[0] || null };
}

function getAllReclamaciones() {
    return Object.values(loadDB());
}

module.exports = {
    registrarReclamacion,
    resolverReclamacion,
    getReclamacion,
    deleteReclamacion,
    getReclamacionesByInstructor,
    contarReclamaciones,
    getAllReclamaciones,
};
