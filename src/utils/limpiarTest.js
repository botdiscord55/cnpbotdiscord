const fs = require('fs');
const path = require('path');
const { getPlantilla, deletePlantilla } = require('../database/plantillas');
const { deleteReclamacion } = require('../database/reclamaciones');
const { getVeto, getVetosTest, deleteVeto } = require('../database/vetos');
const { listarTestMsgs, olvidarTestMsg } = require('../database/testmsgs');

const PLANTILLAS_DB = path.join(__dirname, '..', 'database', 'plantillas.json');

function esTestPlantilla(p) {
    if (!p) return false;
    if (p.test === true) return true;
    if (p.recuperada === true) return false;
    const nombre = String((p && p.nombre) || '').trim();
    const dni = String((p && p.dni) || '').trim();
    return nombre.length <= 3 && dni.length <= 3;
}

function textosDeComponentes(components) {
    let out = '';
    for (const c of components || []) {
        try {
            if (typeof c.content === 'string') out += ' ' + c.content;
            if (Array.isArray(c.components)) out += ' ' + textosDeComponentes(c.components);
        } catch {}
    }
    return out;
}

function textoMensaje(msg) {
    let t = '';
    try { t += ' ' + (msg.content || ''); } catch {}
    try { t += ' ' + textosDeComponentes(msg.components); } catch {}
    try {
        for (const e of msg.embeds || []) {
            t += ' ' + (e.title || '') + ' ' + (e.description || '');
        }
    } catch {}
    return t;
}

function esDePrueba(msg, tipo) {
    const texto = textoMensaje(msg);

    let borrar = false;
    let referenciaReal = false;

    const idsPlantilla = texto.match(/\b\d{15,21}_\d{10,}\b/g) || [];
    for (const id of idsPlantilla) {
        const p = getPlantilla(id);
        if (p) {
            if (p.test === true) borrar = true;
            else referenciaReal = true;
        }
    }

    const idsVeto = texto.match(/VETO-[A-Z0-9]+/g) || [];
    for (const id of idsVeto) {
        const v = getVeto(id);
        if (v) {
            if (v.test === true) borrar = true;
            else referenciaReal = true;
        }
    }

    const marcador = texto.includes('🧪') || texto.includes('(TEST)');
    if (!borrar && !referenciaReal && marcador) borrar = true;

    if (tipo === 'veto' && !idsVeto.length && !marcador) return false;
    if (tipo === 'plantilla' && !idsPlantilla.length && !marcador) return false;

    return borrar;
}

async function borrarMensajesDePrueba(client) {
    let borrados = 0;
    const canales = [];
    if (process.env.canalregistro_plantillaenviar) {
        canales.push({ id: process.env.canalregistro_plantillaenviar, tipo: 'plantilla' });
    }
    if (process.env.canalregistros_vetos) {
        canales.push({ id: process.env.canalregistros_vetos, tipo: 'veto' });
    }

    for (const c of canales) {
        try {
            const channel = await client.channels.fetch(c.id);
            let before = null;
            for (let pagina = 0; pagina < 3; pagina++) {
                const batch = await channel.messages.fetch(before ? { limit: 100, before } : { limit: 100 });
                if (!batch || !batch.size) break;
                for (const msg of batch.values()) {
                    try {
                        if (!msg.author || msg.author.id !== (client.user && client.user.id)) continue;
                        if (esDePrueba(msg, c.tipo)) {
                            await msg.delete();
                            borrados++;
                        }
                    } catch {}
                }
                if (batch.size < 100) break;
                before = batch.last().id;
            }
        } catch (e) {
            console.error(`[limpiartest] No se pudo revisar el canal ${c.id}: ${e.message}`);
        }
    }
    return borrados;
}

async function borrarMensajesRegistrados(client) {
    let borrados = 0;
    for (const e of listarTestMsgs()) {
        if (!e.canal || !e.id) continue;
        try {
            const channel = await client.channels.fetch(e.canal);
            const message = await channel.messages.fetch(e.id);
            if (message && message.author && client.user && message.author.id !== client.user.id) {
                olvidarTestMsg(e.id);
                continue;
            }
            await message.delete();
            olvidarTestMsg(e.id);
            borrados++;
        } catch (err) {
            const code = err && err.code;
            if (code === 10008 || code === 10003) olvidarTestMsg(e.id);
        }
    }
    return borrados;
}

async function limpiarTest(client) {
    const db = JSON.parse(fs.readFileSync(PLANTILLAS_DB, 'utf8'));
    const testIds = Object.entries(db).filter(([, p]) => esTestPlantilla(p)).map(([id]) => id);
    const vetosTest = getVetosTest();

    let mensajes = client ? await borrarMensajesRegistrados(client) : 0;
    if (client) mensajes += await borrarMensajesDePrueba(client);

    for (const id of testIds) {
        deletePlantilla(id);
        deleteReclamacion(id);
    }
    for (const vetoId of vetosTest) {
        deleteVeto(vetoId);
    }

    return {
        mensajes,
        plantillas: testIds.length,
        plantillaIds: testIds,
        vetos: vetosTest.length,
        vetoIds: vetosTest,
    };
}

module.exports = { limpiarTest, esTestPlantilla, textoMensaje, esDePrueba };
