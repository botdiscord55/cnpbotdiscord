const { setMiembro } = require('../database/miembros');
const { rolesRestaurables } = require('../utils/evasion');

module.exports = {
    name: 'guildMemberRemove',
    execute: async (member) => {
        try {
            if (member.user.bot) return;
            const roles = rolesRestaurables(member);
            setMiembro(member.id, {
                nick: member.nickname || null,
                roles: roles.map(r => r.id),
            });
            console.log(`[Evasión] Snapshot de salida guardado: ${member.user.tag} (${member.id}) — ${roles.length} rol(es).`);
        } catch (e) {
            console.error(`[Evasión] No se pudo guardar el snapshot de ${member.user && member.user.tag}:`, e.message || e);
        }
    },
};
