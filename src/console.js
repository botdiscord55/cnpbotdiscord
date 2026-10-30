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
const { cerrarVencidas, cerrarOposicionManual } = require('./utils/oposicionesSweep');
const { hacerRespaldo, restaurarRespaldo } = require('./utils/respaldoGitHub');
const { comprobarVersion } = require('./utils/autoUpdate');
const { createOposicion, getOposicion } = require('./database/oposiciones');
const { getPlantilla, getPlantillasByUser, getPlantillasProcesadasPor, deletePlantilla } = require('./database/plantillas');
const { getReclamacionesByInstructor, deleteReclamacion } = require('./database/reclamaciones');
const { getMiembro, setMiembro, deleteMiembro } = require('./database/miembros');
const { getVetoByUser, getTodosVetos } = require('./database/vetos');
const { evaluarRama, rolesRestaurables, restaurarMiembro, enviarTarjetaEvasion } = require('./utils/evasion');
const { barredVetos } = require('./utils/vetoSweep');

function initConsole(client) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('');
    console.log('[Consola] ─── PLANTILLAS ─────────────────────────────────────');
    console.log('[Consola]   plantillatest [id_usuario]          -> crea una plantilla de prueba en el canal de registro');
    console.log('[Consola]   plantillas [id_usuario]             -> resumen de plantillas de un usuario (+ su registro de gestiones)');
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
    console.log('[Consola]   cerraroposicion <código>                   -> cierra esa oposición ahora mismo');
    console.log('[Consola]   cerraroposiciones                          -> cierra todas las vencidas (las que ya toca cerrar)');
    console.log('');
    console.log('[Consola] ─── MENSAJES ─────────────────────────────────────');
    console.log('[Consola]   enviardm <id_usuario> <mensaje>     -> envía un MD a un usuario');
    console.log('');
    console.log('[Consola] ─── RESPALDO ─────────────────────────────────────');
    console.log('[Consola]   respaldo                          -> sube la BD al repo privado de GitHub ahora mismo');
    console.log('[Consola]   restaurar                         -> restaura la BD desde el último respaldo de GitHub');
    console.log('[Consola]   version                           -> comprueba ahora mismo si hay versión nueva del bot');
    console.log('');
    console.log('[Consola] ─── TEST ──────────────────────────────────────────');
    console.log('[Consola]   vetotest [id_usuario] [días]          -> veto de prueba en el canal de vetos');
    console.log('[Consola]   testtramiteck <id_usuario>            -> envía tarjeta CK al canal de registro sin tocar nada');
    console.log('');
    console.log('[Consola] ─── EVASIÓN ─────────────────────────────────────');
    console.log('[Consola]   evasiontest [id_usuario]              -> tarjeta 🧪 de evasión en #vetos (sin pings) + dry-run del árbol');
    console.log('[Consola]   evasionsnapshot <id_usuario> [borrar] -> guarda o borra el snapshot de roles y apodo');
    console.log('[Consola]   evasionrestore <id_usuario>           -> restaura roles y apodo desde el snapshot (sin avisos)');
    console.log('[Consola]   vetos                                 -> lista los vetos con su tiempo restante');
    console.log('[Consola]   vetosweep                             -> retira ahora los vetos ya caducados');
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
                    console.log(`[Consola] El usuario ${userId} no tiene plantillas registradas ni gestiones.`);
                } else {
                    console.log(`[Consola] Plantillas de ${userId}: ${plantillas.length} total.`);
                    for (const p of plantillas.slice(0, 10)) {
                        console.log(`  - ${p.id} | estado: ${p.estado} | creada: ${p.fechaCreacion}${p.test ? ' | TEST' : ''}`);
                    }
                    if (gestionadas.length) {
                        const porEstado = {};
                        for (const g of gestionadas) porEstado[g.estado] = (porEstado[g.estado] || 0) + 1;
                        const detalle = Object.entries(porEstado).map(([e, n]) => `${e}: ${n}`).join(' · ');
                        console.log(`[Consola] Registro de gestiones: ${gestionadas.length} gestionadas (${detalle}).`);
                    } else {
                        console.log(`[Consola] Registro de gestiones: ninguna.`);
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
            } else if (command === 'cerraroposicion') {
                const codigo = (args[0] || '').toUpperCase().trim();
                if (!codigo) {
                    console.log('[Consola] Uso: cerraroposicion <código> (ej: cerraroposicion OPS-1K8N)');
                } else {
                    const r = await cerrarOposicionManual(client, codigo);
                    if (r.error) console.log(`[Consola] ${r.error}`);
                    else console.log(`[Consola] OK: ${codigo} cerrada → estado "${r.estado}".`);
                }
            } else if (command === 'cerraroposiciones') {
                const r = await cerrarVencidas(client);
                if (r.ocupado) console.log('[Consola] Hay un barrido en curso, vuelve a intentarlo en unos segundos.');
                else if (!r.cerradas.length) console.log('[Consola] OK: no había oposiciones vencidas (las activas siguen vigentes).');
                else console.log(`[Consola] OK: ${r.cerradas.length} oposición(es) vencida(s) cerrada(s): ${r.cerradas.join(', ')}.`);


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
                if (r.ocupado) console.log('[Consola] Hay una subida en curso, vuelve a intentarlo en unos segundos.');
                else if (r.ok && r.sinCambios) console.log('[Consola] OK: sin cambios, no hacía falta subir nada.');
                else if (r.ok) console.log(`[Consola] OK: respaldo subido a GitHub — commit ${String(r.sha).slice(0, 7)} · ${r.bytes} bytes · ${r.archivos}`);
                else console.log(`[Consola] Error: ${r.error}`);
            } else if (command === 'restaurar') {
                const r = await restaurarRespaldo(client, { forzar: true });
                if (r.ok) console.log(`[Consola] OK: BD restaurada desde GitHub (${r.escritos} archivo(s)).`);
                else console.log(`[Consola] Error: ${r.motivo || r.error}`);
            } else if (command === 'version') {
                await comprobarVersion();

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

            // ─── EVASIÓN ───
            } else if (command === 'evasiontest') {
                const userId = arg || process.env.duenio_delbot;
                if (!/^\d{15,21}$/.test(userId)) {
                    console.log('[Consola] Uso: evasiontest [id_usuario]');
                } else {
                    const guild = client.guilds.cache.first();
                    const member = await guild.members.fetch(userId).catch(() => null);
                    const snapshot = getMiembro(userId);
                    const { rama, detalle } = evaluarRama(snapshot, {
                        rolAceptada: process.env.rolplantilla_aceptada,
                        rolDenegada2: process.env.rolplantilla_denegada2,
                    });

                    console.log(`[Consola] ── Dry-run de reentrada de ${userId}${member ? ` (${member.user.tag})` : ' (no está en el servidor)'} ──`);
                    if (snapshot) {
                        const nombres = (snapshot.roles || []).map(id => {
                            const r = guild && guild.roles.cache.get(id);
                            return r ? `${r.name} (\`${id}\`)` : `\`${id}\` (ya no existe)`;
                        });
                        console.log(`  Snapshot: ${nombres.length} rol(es)${snapshot.nick ? `, apodo "${snapshot.nick}"` : ''} — guardado el ${snapshot.fechaSalida}`);
                        for (const n of nombres) console.log(`    - ${n}`);
                    } else {
                        console.log('  Snapshot: ninguno (sin registro de salida).');
                    }
                    console.log(`  Rama que tomaría al reentrar: ${rama.toUpperCase()} — ${detalle}`);

                    const entry = getVetoByUser(userId, { includeTest: true });
                    if (entry) {
                        const [vetoId, v] = entry;
                        const restante = v.expiresAt ? Date.parse(v.expiresAt) - Date.now() : null;
                        const textoRestante = restante == null ? 'indefinido' : restante > 0 ? `${Math.round(restante / 360000) / 10} h` : 'ya caducado';
                        const muteRestante = v.muteHasta ? Date.parse(v.muteHasta) - Date.now() : null;
                        console.log(`  Veto activo: ${vetoId}${v.test ? ' | TEST' : ''} — restante: ${textoRestante}${muteRestante > 0 ? ` · mute restante: ${Math.round(muteRestante / 360000) / 10} h` : ''}`);
                    } else {
                        console.log('  Veto activo: ninguno.');
                    }

                    if (!member) {
                        console.log('  (no se envía la tarjeta: el usuario no está en el servidor)');
                    } else {
                        const roles = rolesRestaurables(member);
                        await enviarTarjetaEvasion(client, { userId, nick: member.nickname, rolesRestaurados: roles.map(r => r.name), esTest: true });
                        console.log(`[Consola] OK: tarjeta 🧪 de evasión enviada a #vetos con ${roles.length} rol(es) — sin pings y registrada para limpiartest.`);
                    }
                }
            } else if (command === 'evasionsnapshot') {
                const userId = arg;
                if (!/^\d{15,21}$/.test(userId)) {
                    console.log('[Consola] Uso: evasionsnapshot <id_usuario> [borrar]');
                } else if ((args[1] || '').toLowerCase() === 'borrar') {
                    const ok = deleteMiembro(userId);
                    console.log(ok ? `[Consola] OK: snapshot de ${userId} eliminado.` : `[Consola] ${userId} no tenía snapshot.`);
                } else {
                    const guild = client.guilds.cache.first();
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (!member) {
                        console.log(`[Consola] ${userId} no está en el servidor, no hay roles que guardar.`);
                    } else {
                        const roles = rolesRestaurables(member);
                        setMiembro(userId, { nick: member.nickname || null, roles: roles.map(r => r.id) });
                        console.log(`[Consola] OK: snapshot de ${userId} guardado — ${roles.length} rol(es)${member.nickname ? `, apodo "${member.nickname}"` : ''}.`);
                        for (const r of roles) console.log(`    - ${r.name} (\`${r.id}\`)`);
                    }
                }
            } else if (command === 'evasionrestore') {
                const userId = arg;
                if (!/^\d{15,21}$/.test(userId)) {
                    console.log('[Consola] Uso: evasionrestore <id_usuario>');
                } else {
                    const snapshot = getMiembro(userId);
                    if (!snapshot) {
                        console.log(`[Consola] ${userId} no tiene snapshot guardado (usa evasionsnapshot para crearlo).`);
                    } else {
                        const guild = client.guilds.cache.first();
                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (!member) {
                            console.log(`[Consola] ${userId} no está en el servidor, no se puede restaurar.`);
                        } else {
                            const r = await restaurarMiembro(member, snapshot);
                            console.log(`[Consola] OK: ${r.restaurados.length} rol(es) restaurado(s)${r.restaurados.length ? ` — ${r.restaurados.join(' · ')}` : ''}${r.nickRestaurado ? ' + apodo' : ''}.`);
                        }
                    }
                }
            } else if (command === 'vetos') {
                const vetos = getTodosVetos();
                if (!vetos.length) {
                    console.log('[Consola] No hay vetos registrados.');
                } else {
                    const ahora = Date.now();
                    const lista = vetos.slice(-30);
                    console.log(`[Consola] Vetos: ${vetos.length} total, mostrando los últimos ${lista.length}.`);
                    for (const v of lista) {
                        let estado = v.estado;
                        if ((estado === 'activo' || estado === 'confirmado') && v.expiresAt && Date.parse(v.expiresAt) <= ahora) {
                            estado = 'caducado (pendiente de barrer)';
                        }
                        let tiempo = 'indefinido';
                        if (v.expiresAt) {
                            const diff = Date.parse(v.expiresAt) - ahora;
                            tiempo = diff > 0 ? `restan ${Math.round(diff / 360000) / 10} h` : `caducó hace ${Math.round(-diff / 360000) / 10} h`;
                        }
                        const mute = v.muteHasta && Date.parse(v.muteHasta) > ahora ? ` · mute: ${Math.round((Date.parse(v.muteHasta) - ahora) / 360000) / 10} h` : '';
                        console.log(`  - ${v.id} | user ${v.userId} | ${estado}${v.test ? ' | TEST' : ''} | ${tiempo}${mute} | ${v.motivo}`);
                    }
                }
            } else if (command === 'vetosweep') {
                const r = await barredVetos(client);
                if (r.ocupado) {
                    console.log('[Consola] Hay un barrido de vetos en curso, vuelve a intentarlo en unos segundos.');
                } else if (!r.retirados.length) {
                    console.log('[Consola] OK: no había vetos caducados.');
                } else {
                    console.log(`[Consola] OK: ${r.retirados.length} veto(s) caducado(s) retirado(s):`);
                    for (const x of r.retirados) {
                        const detalle = x.test ? 'TEST (solo marcado)'
                            : x.detalles && x.detalles.length ? `retirado: ${x.detalles.join(' y ')}`
                            : 'no está en el servidor: se le retirará al volver';
                        console.log(`  - ${x.vetoId} | user ${x.userId} | ${detalle}`);
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
                console.log('[Consola]   cerraroposicion <código>');
                console.log('[Consola]   cerraroposiciones');
                console.log('');
                console.log('[Consola] ─── MENSAJES ─────────────────────────────────────');
                console.log('[Consola]   enviardm <id_usuario> <mensaje>');
                console.log('');
                console.log('[Consola] ─── RESPALDO ─────────────────────────────────────');
                console.log('[Consola]   respaldo');
                console.log('[Consola]   restaurar');
                console.log('[Consola]   version');
                console.log('');
                console.log('[Consola] ─── TEST ──────────────────────────────────────────');
                console.log('[Consola]   vetotest [id_usuario] [días]');
                console.log('[Consola]   testtramiteck <id_usuario>');
                console.log('');
                console.log('[Consola] ─── EVASIÓN ─────────────────────────────────────');
                console.log('[Consola]   evasiontest [id_usuario]');
                console.log('[Consola]   evasionsnapshot <id_usuario> [borrar]');
                console.log('[Consola]   evasionrestore <id_usuario>');
                console.log('[Consola]   vetos');
                console.log('[Consola]   vetosweep');
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
