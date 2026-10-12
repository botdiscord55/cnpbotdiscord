const { Events } = require('discord.js');
const { iniciarArchivador } = require('../utils/archivarMensual');
const { iniciarRespaldo, restaurarRespaldo, necesitaRestaurar } = require('../utils/respaldoGitHub');
const { iniciarAutoUpdate } = require('../utils/autoUpdate');
const { iniciarSweepOposiciones } = require('../utils/oposicionesSweep');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        const now = new Date();
        const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
        const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        console.log(`✅ Bot conectado como ${client.user.tag} a las ${time} del día ${date}`);

        if (necesitaRestaurar()) {
            console.log('[Respaldo] BD local ausente o corrupta, intentando restaurar desde GitHub...');
            const r = await restaurarRespaldo(client);
            if (r.ok) console.log(`[Respaldo] ✅ BD restaurada desde GitHub (${r.escritos} archivo(s)).`);
            else console.log(`[Respaldo] ❌ No se pudo restaurar: ${r.motivo || r.error}`);
        } else {
            console.log('[Respaldo] ✔ BD local intacta (no hace falta restaurar).');
        }

        iniciarRespaldo(client);
        iniciarAutoUpdate();
        iniciarSweepOposiciones(client);
        iniciarArchivador();
    },
};
