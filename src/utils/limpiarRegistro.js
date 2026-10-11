const { getAllPlantillas, deletePlantilla } = require('../database/plantillas');
const { deleteReclamacion } = require('../database/reclamaciones');
const { getVetosByUser, deleteVeto } = require('../database/vetos');
const { textoMensaje } = require('./limpiarTest');

function coincideMensaje(texto, userId, pIds, vIds, tipo) {
    if (tipo === 'plantilla') {
        if (pIds.some(id => texto.includes(id))) return true;
        if (texto.includes(`**ID Única:** \`${userId}\``)) return true;
        return false;
    }
    if (vIds.some(id => texto.includes(id))) return true;
    if (texto.includes(`quitar_veto_${userId}`)) return true;
    if (texto.includes(`**Usuario:** <@${userId}>`)) return true;
    if (texto.includes(`veto de <@${userId}>`)) return true;
    return false;
}

async function limpiarRegistro(client, userId) {
    const plantillas = getAllPlantillas().filter(p => String(p.userId) === String(userId));
    const pIds = plantillas.map(p => p.id);
    const vetos = getVetosByUser(userId);
    const vIds = vetos.map(v => v.id);

    let mensajes = 0;
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
                        if (!msg.author || !client.user || msg.author.id !== client.user.id) continue;
                        if (coincideMensaje(textoMensaje(msg), userId, pIds, vIds, c.tipo)) {
                            await msg.delete();
                            mensajes++;
                        }
                    } catch {}
                }
                if (batch.size < 100) break;
                before = batch.last().id;
            }
        } catch (e) {
            console.error(`[limpiarregistro] No se pudo revisar el canal ${c.id}: ${e.message}`);
        }
    }

    for (const id of pIds) {
        deletePlantilla(id);
        deleteReclamacion(id);
    }
    for (const v of vetos) {
        deleteVeto(v.id);
    }

    return { plantillas: pIds.length, vetos: vIds.length, mensajes, pIds, vIds };
}

module.exports = { limpiarRegistro, coincideMensaje };
