const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'plantillas.json');

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

function savePlantilla(id, plantilla) {
    const db = loadDB();
    db[id] = {
        ...plantilla,
        id,
        estado: 'pendiente',
        fechaCreacion: new Date().toISOString(),
    };
    saveDB(db);
    return db[id];
}

function getPlantilla(id) {
    const db = loadDB();
    return db[id] ? { ...db[id], id } : null;
}

function updatePlantilla(id, updates) {
    const db = loadDB();
    if (!db[id]) return null;
    db[id] = { ...db[id], ...updates };
    saveDB(db);
    return db[id];
}

function deletePlantilla(id) {
    const db = loadDB();
    delete db[id];
    saveDB(db);
}

function getPlantillasPendientes() {
    const db = loadDB();
    return Object.entries(db)
        .filter(([_, p]) => p.estado === 'pendiente')
        .map(([id, p]) => ({ id, ...p }));
}

function hasPlantillaPendiente(userId) {
    const db = loadDB();
    return Object.values(db).some(p => p.userId === userId && p.estado === 'pendiente' && p.test !== true);
}

function getPlantillasByUser(userId) {
    const db = loadDB();
    return Object.entries(db)
        .filter(([_, p]) => String(p.userId) === String(userId))
        .map(([id, p]) => ({ id, ...p }))
        .sort((a, b) => new Date(b.fechaCreacion || 0) - new Date(a.fechaCreacion || 0));
}

function fechaResolucion(p) {
    return p.fechaAceptacion || p.fechaDenegacion || p.fechaRetirada || p.fechaReclamacion || p.fechaCreacion;
}

function getPlantillasProcesadasPor(userId) {
    const db = loadDB();
    const id = String(userId);
    const coincide = (v) => v != null && String(v) === id;
    return Object.entries(db)
        .filter(([_, p]) => (
            (p.estado === 'aceptada' && coincide(p.aceptadaPor)) ||
            (p.estado === 'denegada' && coincide(p.denegadaPor)) ||
            (p.estado === 'retirada' && coincide(p.retiradaPor)) ||
            (p.estado === 'reclamada' && coincide(p.reclamadaPor))
        ))
        .map(([pid, p]) => ({ id: pid, ...p }))
        .sort((a, b) => new Date(fechaResolucion(b) || 0) - new Date(fechaResolucion(a) || 0));
}

function getAllPlantillas() {
    const db = loadDB();
    return Object.entries(db)
        .map(([id, p]) => ({ id, ...p }))
        .sort((a, b) => new Date(a.fechaCreacion || 0) - new Date(b.fechaCreacion || 0));
}

module.exports = {
    savePlantilla,
    getPlantilla,
    updatePlantilla,
    deletePlantilla,
    getPlantillasPendientes,
    hasPlantillaPendiente,
    getPlantillasByUser,
    getPlantillasProcesadasPor,
    getAllPlantillas,
};
