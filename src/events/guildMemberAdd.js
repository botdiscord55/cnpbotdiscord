const { getMiembro } = require('../database/miembros');
const { getVetoByUser } = require('../database/vetos');
const { evaluarRama, restaurarMiembro, imponerVetoVigente, avisarVetoVigente, enviarTarjetaEvasion } = require('../utils/evasion');

module.exports = {
    name: 'guildMemberAdd',
    execute: async (member) => {
        try {
            if (member.user.bot) return;
        } catch {}

        const rolSinPlantilla = process.env.rol_sinplantilla;

        try {
            const snapshot = getMiembro(member.id);
            const { rama } = evaluarRama(snapshot, {
                rolAceptada: process.env.rolplantilla_aceptada,
                rolDenegada2: process.env.rolplantilla_denegada2,
            });

            if (rama === 'evasion') {
                // CK 2/2 evadido: se restaura TODO y se envía la tarjeta con el menú de veto
                const { restaurados, nickRestaurado } = await restaurarMiembro(member, snapshot);
                console.log(`[Evasión] ⚠ ${member.user.tag} (${member.id}) reentró evadiendo el CK 2/2: ${restaurados.length} rol(es) restaurado(s)${nickRestaurado ? ' + apodo' : ''}.`);
                try {
                    await enviarTarjetaEvasion(member.client, {
                        userId: member.id,
                        nick: snapshot.nick,
                        rolesRestaurados: restaurados,
                        esTest: false,
                    });
                } catch (e) {
                    console.error('[Evasión] No se pudo enviar la tarjeta de evasión:', e.message || e);
                }
            } else if (rama === 'aceptada') {
                // Plantilla aceptada: es como abandonar, no hay castigo → solo rol sin plantilla
                if (rolSinPlantilla) {
                    try { await member.roles.add(rolSinPlantilla); } catch {}
                }
            } else if (rama === 'restaurar') {
                // Denegada 1/2, pendiente, etc.: se le devuelven sus roles y apodo
                const { restaurados, nickRestaurado } = await restaurarMiembro(member, snapshot);
                console.log(`[Evasión] ${member.user.tag} (${member.id}) reentró: ${restaurados.length} rol(es) restaurado(s)${nickRestaurado ? ' + apodo' : ''}.`);
            } else {
                // Sin registro o sin roles guardados: como hasta ahora
                if (rolSinPlantilla) {
                    try { await member.roles.add(rolSinPlantilla); } catch {}
                }
            }

            // Veto activo en la BD (cualquiera que sea la rama): se reimpone rol + mute restante
            const entry = getVetoByUser(member.id);
            if (entry) {
                const [vetoId, veto] = entry;
                const detalles = await imponerVetoVigente(member, veto);
                console.log(`[Evasión] ${member.user.tag} reentró con veto vigente ${vetoId}${detalles.length ? `: ${detalles.join(' · ')}` : ''}.`);
                await avisarVetoVigente(member.client, member, { ...veto, id: vetoId }, detalles);
            }
        } catch (e) {
            console.error(`[Evasión] Error al procesar la entrada de ${member.user && member.user.tag}:`, e.message || e);
            // Comportamiento histórico como red de seguridad
            if (rolSinPlantilla) {
                try { await member.roles.add(rolSinPlantilla); } catch {}
            }
        }
    },
};
