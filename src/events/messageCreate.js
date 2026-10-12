const { Events, EmbedBuilder, MessageFlagsBitField } = require('discord.js');
const { logAction } = require('../utils/actionLog');
const { buildPlantillasCard, buildVertotalCard, esInstructor } = require('../utils/plantillasCard');
const { track } = require('../utils/plantillasLive');
const { programarBorrado } = require('../utils/tempMsg');

async function handlePlantillas(message, args) {
    try { await message.delete(); } catch {}

    if (!(await esInstructor(message))) return;

    const sub = (args[0] || '').toLowerCase();
    const usage = '**Uso:** `!plantillas ver` (tu registro) · `!plantillas ver @usuario` · `!plantillas vertotal` — vertotal muestra las estadísticas globales.';

    if (sub === 'vertotal') {
        const { container, stats } = buildVertotalCard();
        const sent = await message.channel.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        programarBorrado(sent);
        logAction(message, {
            tipo: 'comando',
            estado: 'ok',
            nombre: '!plantillas vertotal',
            extra: `total: ${stats.total} · aceptadas: ${stats.counts.aceptada} · denegadas: ${stats.counts.denegada} · pendientes: ${stats.counts.pendiente}`,
        });
        return;
    }

    if (sub !== 'ver') {
        logAction(message, { tipo: 'comando', estado: 'warning', nombre: '!plantillas', motivo: 'subcomando no válido' });
        return message.channel.send(usage);
    }

    const mention = message.mentions.users.first();
    const rawId = (args[1] || '').trim();
    if (!mention && rawId && !/^\d{15,21}$/.test(rawId)) {
        logAction(message, { tipo: 'comando', estado: 'warning', nombre: '!plantillas ver', motivo: `no se pudo reconocer al usuario "${rawId}"` });
        return message.channel.send(`No pude reconocer a **${rawId}**. Mencionalo con \`@usuario\` o usa su ID de Discord.\n${usage}`);
    }
    const target = mention || (rawId ? { id: rawId } : { id: message.author.id });

    const { container, plantillas, counts, actividad } = buildPlantillasCard(target.id, { instructor: true });

    if (!plantillas.length && !actividad) {
        logAction(message, { tipo: 'comando', estado: 'warning', nombre: '!plantillas ver', motivo: `el usuario ${target.id} no tiene plantillas registradas` });
    }

    await message.channel.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 })
        .then(sent => {
            track(message.client, sent, () => ({ components: [buildPlantillasCard(target.id, { instructor: true }).container] }));
            programarBorrado(sent);
        });

    if (plantillas.length || actividad) {
        const partes = [];
        if (plantillas.length && counts) partes.push(`aceptadas: ${counts.aceptada}, denegadas: ${counts.denegada}, pendientes: ${counts.pendiente}`);
        if (actividad) partes.push(`gestionadas: ${actividad}`);
        logAction(message, {
            tipo: 'comando',
            estado: 'ok',
            nombre: '!plantillas ver',
            extra: `sobre <@${target.id}> — ${partes.join(' · ')}`,
        });
    }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot) return;

        if (message.content.startsWith('!')) {
            const raw = message.content.slice(1).trim().split(/ +/);
            if ((raw[0] || '').toLowerCase() === 'plantillas') {
                return handlePlantillas(message, raw.slice(1));
            }
        }

        if (message.author.id !== process.env.duenio_delbot) return;
        if (!message.content.startsWith('!')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        if (command === 'cambiarapodo') {
            const target = message.mentions.members.first();
            let member = target;
            if (!member && args[0]) {
                try { member = await message.guild.members.fetch(args[0]); } catch {}
            }
            if (!member) {
                logAction(message, { tipo: 'comando', estado: 'warning', nombre: '!cambiarapodo', motivo: 'no se encontró el usuario' });
                try { await message.delete(); } catch {}
                return;
            }
            const newNick = args.slice(target ? 1 : 1).join(' ');
            if (!newNick) {
                logAction(message, { tipo: 'comando', estado: 'warning', nombre: '!cambiarapodo', motivo: 'no se especificó el nuevo apodo' });
                try { await message.delete(); } catch {}
                return;
            }
            try { await member.setNickname(newNick); } catch {}
            try { await message.delete(); } catch {}
            logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!cambiarapodo' });
        }

        if (command === 'quitarenopos') {
            const ids = args.flatMap(a => a.split(',').map(s => s.trim().replace(/^<@!?(\d{15,21})>$/, '$1'))).filter(Boolean);
            const rolEnOposiciones = process.env.rolen_oposiciones;
            for (const id of ids) {
                try {
                    const member = await message.guild.members.fetch(id);
                    if (rolEnOposiciones && member.roles.cache.has(rolEnOposiciones)) {
                        await member.roles.remove(rolEnOposiciones);
                    }
                } catch {}
            }
            try { await message.delete(); } catch {}
            logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!quitarenopos' });
        }

        if (command === 'darplantillaaceptada') {
            const ids = args.flatMap(a => a.split(',').map(s => s.trim().replace(/^<@!?(\d{15,21})>$/, '$1'))).filter(Boolean);
            const rolPlantilla = process.env.rolplantilla_aceptada;
            const rolSinPlantilla = process.env.rol_sinplantilla;
            for (const id of ids) {
                try {
                    const member = await message.guild.members.fetch(id);
                    if (rolPlantilla && !member.roles.cache.has(rolPlantilla)) {
                        await member.roles.add(rolPlantilla);
                    }
                    if (rolSinPlantilla && member.roles.cache.has(rolSinPlantilla)) {
                        await member.roles.remove(rolSinPlantilla);
                    }
                } catch {}
            }
            try { await message.delete(); } catch {}
            logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!darplantillaaceptada' });
        }

        if (command === 'quitarplantillaaceptada') {
            const ids = args.flatMap(a => a.split(',').map(s => s.trim().replace(/^<@!?(\d{15,21})>$/, '$1'))).filter(Boolean);
            const rolPlantilla = process.env.rolplantilla_aceptada;
            const rolSinPlantilla = process.env.rol_sinplantilla;
            for (const id of ids) {
                try {
                    const member = await message.guild.members.fetch(id);
                    if (rolPlantilla && member.roles.cache.has(rolPlantilla)) {
                        await member.roles.remove(rolPlantilla);
                    }
                    if (rolSinPlantilla && !member.roles.cache.has(rolSinPlantilla)) {
                        await member.roles.add(rolSinPlantilla);
                    }
                } catch {}
            }
            try { await message.delete(); } catch {}
            logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!quitarplantillaaceptada' });
        }

        if (command === 'quitarplantilladenegada1' || command === 'retirarplantilladenegada1') {
            const ids = args.flatMap(a => a.split(',').map(s => s.trim().replace(/^<@!?(\d{15,21})>$/, '$1'))).filter(Boolean);
            const rolDenegada1 = process.env.rolplantilla_denegada1;
            let encontrados = 0;
            for (const id of ids) {
                try {
                    const member = await message.guild.members.fetch(id);
                    encontrados++;
                    if (rolDenegada1 && member.roles.cache.has(rolDenegada1)) {
                        await member.roles.remove(rolDenegada1);
                        console.log(`[quitarplantilladenegada1] Rol retirado a ${id}`);
                    } else {
                        console.log(`[quitarplantilladenegada1] ${id} no tiene el rol`);
                    }
                } catch (e) {
                    console.log(`[quitarplantilladenegada1] Error con ${id}: ${e.message}`);
                }
            }
            try { await message.delete(); } catch {}
            if (!ids.length || !encontrados) {
                logAction(message, { tipo: 'comando', estado: 'warning', nombre: '!quitarplantilladenegada1', motivo: 'no se encontró ningún usuario válido' });
            } else {
                logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!quitarplantilladenegada1' });
            }
        }

        if (command === 'quitarplantilladenegada2' || command === 'retirarplantilladenegada2') {
            const ids = args.flatMap(a => a.split(',').map(s => s.trim().replace(/^<@!?(\d{15,21})>$/, '$1'))).filter(Boolean);
            const rolDenegada2 = process.env.rolplantilla_denegada2;
            let encontrados = 0;
            for (const id of ids) {
                try {
                    const member = await message.guild.members.fetch(id);
                    encontrados++;
                    if (rolDenegada2 && member.roles.cache.has(rolDenegada2)) {
                        await member.roles.remove(rolDenegada2);
                        console.log(`[quitarplantilladenegada2] Rol retirado a ${id}`);
                    } else {
                        console.log(`[quitarplantilladenegada2] ${id} no tiene el rol`);
                    }
                } catch (e) {
                    console.log(`[quitarplantilladenegada2] Error con ${id}: ${e.message}`);
                }
            }
            try { await message.delete(); } catch {}
            if (!ids.length || !encontrados) {
                logAction(message, { tipo: 'comando', estado: 'warning', nombre: '!quitarplantilladenegada2', motivo: 'no se encontró ningún usuario válido' });
            } else {
                logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!quitarplantilladenegada2' });
            }
        }

        if (command === 'comandos') {
            const embed = new EmbedBuilder()
                .setTitle('Comandos Disponibles')
                .setColor(0xfee75c)
                .addFields(
                    { name: '!cambiarapodo @user/id <apodo>', value: 'Cambia el apodo de un usuario.', inline: false },
                    { name: '!quitarenopos @user/id,id,id', value: 'Retira el rol de en oposiciones.', inline: false },
                    { name: '!darplantillaaceptada @user/id,id,id', value: 'Asigna el rol de plantilla aceptada.', inline: false },
                    { name: '!quitarplantillaaceptada @user/id,id,id', value: 'Retira plantilla aceptada y asigna sin plantilla.', inline: false },
                    { name: '!quitarplantilladenegada1 @user/id,id,id', value: 'Retira el rol de plantilla denegada (1/2).', inline: false },
                    { name: '!quitarplantilladenegada2 @user/id,id,id', value: 'Retira el rol de plantilla denegada (2/2).', inline: false },
                    { name: '!plantillas ver [@user/id]', value: 'Historial de plantillas. Sin usuario: tu registro (reclamadas/aceptadas/denegadas). Con usuario: el suyo y lo que haya gestionado.', inline: false },
                    { name: '!plantillas vertotal', value: 'Estadísticas globales — solo instructores (no muestra quién envió plantillas; con botones CSV/JSON).', inline: false },
                    { name: '!comandos', value: 'Muestra esta lista de comandos.', inline: false }
                );

            try {
                await message.author.send({ embeds: [embed] });
            } catch {}
            try { await message.delete(); } catch {}
            logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!comandos' });
        }

        if (command === 'comandoscmd') {
            const embed = new EmbedBuilder()
                .setTitle('Comandos de la Consola (CMD)')
                .setColor(0x57f287)
                .setDescription('Se escriben en la ventana **Bot CNP - Consola**, no en Discord:')
                .addFields(
                    { name: 'plantillaenviar test [id_usuario]', value: 'Crea una plantilla de prueba (se puede reclamar para probar; sin efectos reales).', inline: false },
                    { name: 'plantillas [id_usuario]', value: 'Muestra el resumen de plantillas de un usuario y su registro de gestiones.', inline: false },
                    { name: 'reclamaciones [id_usuario]', value: 'Muestra las reclamaciones de un instructor.', inline: false },
                    { name: 'plantillaeliminar <id_plantilla>', value: 'Borra una plantilla por su ID (la ID sale en la tarjeta).', inline: false },
                    { name: 'limpiartest', value: 'Borra los mensajes de prueba de Discord y todos sus registros.', inline: false },
                    { name: 'limpiarregistro <id_usuario>', value: 'Borra todos los registros y mensajes de Discord de ese usuario.', inline: false },
                    { name: 'limpiarmensajes <id_canal> <cantidad>', value: 'Borra los últimos N mensajes de un canal (1-500).', inline: false },
                    { name: 'limpiarmensaje <enlace|id>', value: 'Borra un mensaje: por enlace, o <id_canal> <id_mensaje>, o solo su id.', inline: false },
                    { name: 'vetotest [id_usuario] [dias]', value: 'Crea un veto de prueba en el canal de vetos (sin efecto real).', inline: false },
                    { name: 'recuperarplantillas', value: 'Recupera plantillas antiguas (copias locales + historial de Discord) sin duplicar.', inline: false },
                    { name: 'ayuda', value: 'Vuelve a imprimir esta lista en la consola.', inline: false }
                );

            try {
                await message.author.send({ embeds: [embed] });
            } catch {}
            try { await message.delete(); } catch {}
            logAction(message, { tipo: 'comando', estado: 'ok', nombre: '!comandoscmd' });
        }
    },
};
