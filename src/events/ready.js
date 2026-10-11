const { Events } = require('discord.js');
const { iniciarArchivador } = require('../utils/archivarMensual');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        const now = new Date();
        const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
        const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        console.log(`✅ Bot conectado como ${client.user.tag} a las ${time} del día ${date}`);
        iniciarArchivador();
    },
};
