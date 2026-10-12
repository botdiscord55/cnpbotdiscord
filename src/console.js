const readline = require('readline');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
    EmbedBuilder,
} = require('discord.js');
const { crearPlantillaTest } = require('./utils/testPlantilla');
const { crearVetoTest } = require('./utils/testVeto');
const { limpiarTest } = require('./utils/limpiarTest');
const { limpiarRegistro } = require('./utils/limpiarRegistro');
const { limpiarMensajes, limpiarMensaje } = require('./utils/limpiarMensajes');
const { recuperarPlantillas } = require('./utils/recuperarPlantillas');
const { publicarConvocatoria } = require('./utils/crearOposicion');
const { hacerRespaldo, restaurarRespaldo } = require('./utils/respaldoGitHub');
const { createOposicion, getOposicion } = require('./database/oposiciones');
const { getPlantilla, getPlantillasByUser, getPlantillasProcesadasPor, deletePlantilla } = require('./database/plantillas');
const { getReclamacionesByInstructor, deleteReclamacion } = require('./database/reclamaciones');

function initConsole(client) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('');
    console.log('[Consola] ─── PLANTILLAS ─────────────────────────────────────');
    console.log('[Consola]   plantillatest [id_usuario]          -> crea una plantilla de prueba en el canal de registro');
    console.log('[Consola]   plantillas [id_usuario]             -> resumen de plantillas de un usuario (+ su actividad como instructor)');
    console.log('[Consola]   reclamaciones [id_usuario]           -> reclamaciones de un instructor');
    console.log('[Consola]   plantillaeliminar <id_plantilla>    -> borra una plantilla por su ID');
    console.log('[Consola]   recuperarplantillas                  -> recupera plantillas antiguas sin duplicar');
    console.log('');
    console.log('[Consola] ─── LIMPIEZA ───────────────────────────────────────');
    console.log('[Consola]   limpiartest                          -> borra todo lo de prueba (mensajes, plantillas, vetos)');
    console.log('[Consola]   limpiarregistro <id_usuario>         -> borra todos los registros de un usuario');
    console.log('[Consola]   limpiarmensajes <id_canal> <n>       -> borra los n últimos mensajes de un canal (1-500)');
    console.log('[Consola]   limpiarmensaje <enlace|id>           -> borra un mensaje por enlace o ID');
    console.log('');
    console.log('[Consola] ─── OPOSICIONES ────────────────────────────────────');
    console.log('[Consola]   crearoposicion <código> <fecha> <hora>      -> crea y publica convocatoria');
    console.log('[Consola]   crearoposicionquiet <código> [fecha] [hora] -> crea sin publicar nada (sin pings)');
    console.log('');
    console.log('[Consola] ─── MENSAJES ─────────────────────────────────────');
    console.log('[Consola]   enviardm <id_usuario> <mensaje>     -> envía un MD a un usuario');
    console.log('');
    console.log('[Consola] ─── RESPALDO ─────────────────────────────────────');
    console.log('[Consola]   respaldo                          -> sube la BD al repo privado de GitHub ahora mismo');
    console.log('[Consola]   restaurar                         -> restaura la BD desde el último respaldo de GitHub');
    console.log('');
    console.log('[Consola] ─── TEST ──────────────────────────────────────────');
    console.log('[Consola]   vetotest [id_usuario] [días]          -> veto de prueba en el canal de vetos');
    console.log('[Consola]   testtramiteck <id_usuario>            -> envía tarjeta CK al canal de registro sin tocar nada');
    console.log('');
    console.log('[Consola] Escribe "ayuda" para volver a ver esto.');
    console.log('');

    rl.on('line', async (line) => {
        const parts = line.trim().split(/ +/).filter(Boolean);
        if (!parts.length) return;

        let [command, ...args] = parts;
        if (command.toLowerCase() === 'ncp') {
            command = args.shift();
        }
        command = (command || '').toLowerCase();
        const arg = (args[0] || '').replace(/[^\d]/g, '');

        try {
            // ─── PLANTILLAS ───
            if (command === 'plantillatest' || (command === 'plantillaenviar' && (args[0] || '').toLowerCase() === 'test')) {
                const userId = arg || process.env.duenio_delbot;
                const plantillaId = await crearPlantillaTest(client, userId, userId, userId);
                console.log(`[Consola] OK: plantilla de prueba ${plantillaId} creada (usuario ${userId}).`);
            } else if (command === 'plantillas') {
                const userId = arg || process.env.duenio_delbot;
                const plantillas = getPlantillasByUser(userId);
                const gestionadas = getPlantillasProcesadasPor(userId);
                if (!plantillas.length && !gestionadas.length) {
                    console.log(`[Consola] El usuario ${userId} no tiene plantillas registradas ni actividad como instructor.`);
                } else {
                    console.log(`[Consola] Plantillas de ${userId}: ${plantillas.length} total.`);
                    for (const p of plantillas.slice(0, 10)) {
                        console.log(`  - ${p.id} | estado: ${p.estado} | creada: ${p.fechaCreacion}${p.test ? ' | TEST' : ''}`);
                    }
                    if (gestionadas.length) {
                        const porEstado = {};
                        for (const g of gestionadas) porEstado[g.estado] = (porEstado[g.estado] || 0) + 1;
                        const detalle = Object.entries(porEstado).map(([e, n]) => `${e}: ${n}`).join(' · ');
                        console.log(`[Consola] Actividad como instructor: ${gestionadas.length} gestionadas (${detalle}).`);
                    } else {
                        console.log(`[Consola] Actividad como instructor: ninguna.`);
                    }
                }
            } else if (command === 'reclamaciones') {
                const userId = arg || process.env.duenio_delbot;
                const recs = getReclamacionesByInstructor(userId);
                if (!recs.length) {
                    console.log(`[Consola] El instructor ${userId} no tiene reclamaciones.`);
                } else {
                    console.log(`[Consola] Reclamaciones de ${userId}: ${recs.length} total.`);
                    for (const r of recs.slice(0, 10)) {
                        console.log(`  - ${r.plantillaId} | estado: ${r.estado} | solicitante: ${r.userId} | reclamada: ${r.fechaReclamacion}`);
                    }
                }
            } else if (command === 'plantillaeliminar') {
                const plantillaId = (args[0] || '').trim();
                if (!plantillaId) {
                    console.log('[Consola] Uso: plantillaeliminar <id_plantilla>');
                } else {
                    const p = getPlantilla(plantillaId);
                    if (!p) {
                        console.log(`[Consola] No existe ninguna plantilla con ID "${plantillaId}".`);
                    } else {
                        deletePlantilla(plantillaId);
                        const teniaReclamacion = deleteReclamacion(plantillaId);
                        console.log(`[Consola] OK: plantilla ${plantillaId} eliminada${teniaReclamacion ? ' y su reclamación borrada' : ''}.`);
                    }
                }
            } else if (command === 'recuperarplantillas') {
                console.log('[Recuperar] Iniciando (puede tardar unos segundos)...');
                const r = await recuperarPlantillas(client);
                const estados = Object.entries(r.porEstado).map(([e, n]) => `${e}: ${n}`).join(' · ');
                console.log(`[Recuperar] OK: ${r.total} plantilla(s) recuperadas (${r.antes} → ${r.despues}).`);
                if (r.total) console.log(`[Recuperar]   ${estados}`);
                else console.log('[Recuperar]   no había nada nuevo.');
                if (r.respaldo) console.log(`[Recuperar]   respaldo: src/database/backups/${r.respaldo}`);

            // ─── LIMPIEZA ───
            } else if (command === 'limpiartest') {
                const res = await limpiarTest(client);
                const partes = [];
                if (res.plantillas) partes.push(`${res.plantillas} plantilla(s)`);
                if (res.vetos) partes.push(`${res.vetos} veto(s)`);
                console.log(`[Consola] OK: ${res.mensajes} mensaje(s) borrados${partes.length ? ` y ${partes.join(' y ')} eliminados` : ''}.`);
            } else if (command === 'limpiarregistro') {
                const userId = arg;
                if (!/^\d{15,21}$/.test(userId)) {
                    console.log('[Consola] Uso: limpiarregistro <id_usuario>');
                } else {
                    const res = await limpiarRegistro(client, userId);
                    console.log(`[Consola] OK: ${userId} — ${res.plantillas} plantilla(s), ${res.vetos} veto(s), ${res.mensajes} mensaje(s).`);
                    if (!res.plantillas && !res.vetos && !res.mensajes) console.log('  (no había nada)');
                }
            } else if (command === 'limpiarmensajes') {
                const canalId = arg;
                const cantidad = Number(args[1]);
                if (!/^\d{15,21}$/.test(canalId) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) {
                    console.log('[Consola] Uso: limpiarmensajes <id_canal> <cantidad (1-500)>');
                } else {
                    const res = await limpiarMensajes(client, canalId, cantidad);
                    console.log(`[Consola] OK: ${res.borrados}/${res.solicitados} borrados${res.fallidos ? ` (${res.fallidos} fallidos)` : ''}.`);
                }
            } else if (command === 'limpiarmensaje') {
                if (!args.length) {
                    console.log('[Consola] Uso: limpiarmensaje <enlace | id_canal id_mensaje | id_mensaje>');
                } else {
                    const res = await limpiarMensaje(client, args);
                    if (res.ok) {
                        console.log(`[Consola] OK: mensaje ${res.messageId} borrado del canal ${res.channelId}.`);
                    } else {
                        console.log(`[Consola] No se pudo borrar: ${res.error}`);
                    }
                }

            // ─── OPOSICIONES ───
            } else if (command === 'crearoposicion') {
                const codigo = (args[0] || '').toUpperCase().trim();
                const fecha = (args[1] || '').trim();
                const hora = (args[2] || '').trim();
                if (!codigo || !fecha || !hora) {
                    console.log('[Consola] Uso: crearoposicion <código> <fecha> <hora> (ej: crearoposicion OPS-1K8N 25/10/2026 18:00)');
                } else {
                    const duenio = process.env.duenio_delbot;
                    const r = await publicarConvocatoria(client, {
                        code: codigo,
                        userId: duenio,
                        userTag: `<@${duenio}>`,
                        fecha,
                        hora,
                        aceptadoPor: `<@${duenio}>`,
                        aceptadoPorTag: `Consola (<@${duenio}>)`,
                    });
                    if (r.ok) {
                        console.log(`[Consola] OK: convocatoria ${codigo} creada y publicada (${fecha} ${hora}).`);
                    } else {
                        console.log(`[Consola] Error: ${r.error}`);
                    }
                }
            } else if (command === 'crearoposicionquiet') {
                const codigo = (args[0] || '').toUpperCase().trim();
                const fecha = (args[1] || '').trim() || 'Por confirmar';
                const hora = (args[2] || '').trim() || 'Por confirmar';
                if (!codigo) {
                    console.log('[Consola] Uso: crearoposicionquiet <código> [fecha] [hora]');
                } else if (getOposicion(codigo)) {
                    console.log(`[Consola] Ya existe una oposición con el código ${codigo}.`);
                } else {
                    const duenio = process.env.duenio_delbot;
                    createOposicion({
                        code: codigo,
                        userId: duenio,
                        userTag: `<@${duenio}>`,
                        fecha,
                        hora,
                        aceptadoPor: `<@${duenio}>`,
                        aceptadoPorTag: `Consola (<@${duenio}>)`,
                    });
                    console.log(`[Consola] OK: oposición ${codigo} creada en silencio (${fecha} ${hora}).`);
                }

            // ─── MENSAJES ───
            } else if (command === 'enviardm') {
                const id = arg;
                const mensaje = args.slice(1).join(' ').trim();
                if (!/^\d{15,21}$/.test(id) || !mensaje) {
                    console.log('[Consola] Uso: enviardm <id_usuario> <mensaje> (ej: enviardm 991791054535802880 Hola, bienvenido)');
                } else {
                    const user = await client.users.fetch(id);
                    const emojiId = (process.env.emoji_oposiciones || '').match(/\d{15,21}/)?.[0];
                    const iconURL = emojiId ? `https://cdn.discordapp.com/emojis/${emojiId}.png` : undefined;
                    const embed = new EmbedBuilder()
                        .setAuthor(iconURL ? { name: 'COMUNICADO', iconURL } : { name: `${process.env.emoji_oposiciones || ''} COMUNICADO` })
                        .setDescription(mensaje);
                    await user.send({ embeds: [embed] });
                    console.log(`[Consola] OK: MD enviado a ${user.tag} (${id}).`);
                }

            // ─── RESPALDO ───
            } else if (command === 'respaldo') {
                const r = await hacerRespaldo(client, { forzar: true });
                if (r.ok && r.sinCambios) console.log('[Consola] OK: sin cambios, no hacía falta subir nada.');
                else if (r.ok) console.log(`[Consola] OK: respaldo subido a GitHub — commit ${String(r.sha).slice(0, 7)} · ${r.bytes} bytes · ${r.archivos}`);
                else console.log(`[Consola] Error: ${r.error}`);
            } else if (command === 'restaurar') {
                const r = await restaurarRespaldo(client, { forzar: true });
                if (r.ok) console.log(`[Consola] OK: BD restaurada desde GitHub (${r.escritos} archivo(s)).`);
                else console.log(`[Consola] Error: ${r.motivo || r.error}`);

            // ─── TEST ───
            } else if (command === 'vetotest') {
                const userId = arg || process.env.duenio_delbot;
                const diasRaw = args.find(a => /^\d+$/.test(a) && a !== arg) || args.find((a, i) => i > 0 && /^\d+$/.test(a));
                const dias = diasRaw ? parseInt(diasRaw, 10) : 1;
                const vetoId = await crearVetoTest(client, userId, dias);
                console.log(`[Consola] OK: veto de prueba ${vetoId} enviado (usuario ${userId}, ${dias} día(s)).`);
            } else if (command === 'testtramiteck') {
                const id = arg;
                if (!/^\d{15,21}$/.test(id)) {
                    console.log('[Consola] Uso: testtramiteck <id_usuario>');
                } else {
                    try {
                        const guild = client.guilds.cache.first();
                        const member = await guild.members.fetch(id);
                        const nick = member.nickname || member.user.username;
                        const nombreAnterior = nick.includes('|') ? nick.split('|').slice(1).join('|').trim() : nick;
                        const rolSinPlantilla = process.env.rol_sinplantilla;
                        const rolesToKeep = [rolSinPlantilla, guild.id].filter(Boolean);

                        const rolesQuitados = [];
                        for (const [roleId, role] of member.roles.cache) {
                            if (rolesToKeep.includes(roleId)) continue;
                            rolesQuitados.push(`${role.name} (\`${roleId}\`)`);
                        }

                        const now = new Date();
                        const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
                        const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

                        const canalCK = await client.channels.fetch(process.env.canalregistro_ck);

                        const container = new ContainerBuilder()
                            .setAccentColor(0x2b2d31)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent('### TRAMITACIÓN DE CHARACTER KILL')
                            )
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `**Usuario:** <@${id}> (\`${id}\`) · **Tramitado por:** Consola\n` +
                                    `**Nombre anterior:** ${nombreAnterior} → **Nombre nuevo:** Nuevo Nombre`
                                )
                            )
                            .addSeparatorComponents(
                                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                            )
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `> **Roles revocados**\n` +
                                    (rolesQuitados.length > 0
                                        ? rolesQuitados.map(r => `<:${process.env.emoji_redtick}> ${r}`).join('\n')
                                        : `<:${process.env.emoji_greytick}> Ninguno`)
                                )
                            )
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(
                                    `-# ${date} a las ${time}`
                                )
                            );

                        await canalCK.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.SuppressNotifications });
                        console.log(`[Consola] OK: CK enviado al canal de registro para ${member.user.tag}.`);
                    } catch (e) {
                        console.log(`[Consola] Error: ${e.message}`);
                    }
                }

            // ─── AYUDA ───
            } else if (command === 'ayuda' || command === 'help' || command === 'comandos') {
                console.log('');
                console.log('[Consola] ─── PLANTILLAS ─────────────────────────────────────');
                console.log('[Consola]   plantillatest [id_usuario]');
                console.log('[Consola]   plantillas [id_usuario]');
                console.log('[Consola]   reclamaciones [id_usuario]');
                console.log('[Consola]   plantillaeliminar <id_plantilla>');
                console.log('[Consola]   recuperarplantillas');
                console.log('');
                console.log('[Consola] ─── LIMPIEZA ───────────────────────────────────────');
                console.log('[Consola]   limpiartest');
                console.log('[Consola]   limpiarregistro <id_usuario>');
                console.log('[Consola]   limpiarmensajes <id_canal> <cantidad>');
                console.log('[Consola]   limpiarmensaje <enlace | id_canal id_mensaje | id_mensaje>');
                console.log('');
                console.log('[Consola] ─── OPOSICIONES ────────────────────────────────────');
                console.log('[Consola]   crearoposicion <código> <fecha> <hora>');
                console.log('[Consola]   crearoposicionquiet <código> [fecha] [hora]');
                console.log('');
                console.log('[Consola] ─── MENSAJES ─────────────────────────────────────');
                console.log('[Consola]   enviardm <id_usuario> <mensaje>');
                console.log('');
                console.log('[Consola] ─── RESPALDO ─────────────────────────────────────');
                console.log('[Consola]   respaldo');
                console.log('[Consola]   restaurar');
                console.log('');
                console.log('[Consola] ─── TEST ──────────────────────────────────────────');
                console.log('[Consola]   vetotest [id_usuario] [días]');
                console.log('[Consola]   testtramiteck <id_usuario>');
                console.log('');
            } else {
                console.log(`[Consola] Comando desconocido: "${command}". Escribe "ayuda".`);
            }
        } catch (e) {
            console.error('[Consola] Error:', e.message);
        }
    });
}

module.exports = { initConsole };
