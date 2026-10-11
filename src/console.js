const readline = require('readline');
const { crearPlantillaTest } = require('./utils/testPlantilla');
const { crearVetoTest } = require('./utils/testVeto');
const { limpiarTest } = require('./utils/limpiarTest');
const { limpiarRegistro } = require('./utils/limpiarRegistro');
const { limpiarMensajes, limpiarMensaje } = require('./utils/limpiarMensajes');
const { recuperarPlantillas } = require('./utils/recuperarPlantillas');
const { getPlantilla, getPlantillasByUser, deletePlantilla } = require('./database/plantillas');
const { getReclamacionesByInstructor, deleteReclamacion } = require('./database/reclamaciones');

function initConsole(client) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('[Consola] Comandos disponibles:');
    console.log('[Consola]   plantillaenviar test [id_usuario]  -> crea una plantilla de prueba en el canal de registro (reclamable para probar, sin efectos reales)');
    console.log('[Consola]   plantillas [id_usuario]            -> muestra el resumen de plantillas de un usuario');
    console.log('[Consola]   reclamaciones [id_usuario]          -> muestra las reclamaciones de un instructor');
    console.log('[Consola]   plantillaeliminar <id_plantilla>   -> borra una plantilla por su ID (aparece en la tarjeta)');
    console.log('[Consola]   limpiartest                         -> borra sus mensajes de Discord y todos sus registros (plantillas, reclamaciones y vetos de prueba)');
    console.log('[Consola]   limpiarregistro <id_usuario>        -> borra todos los registros y mensajes de Discord de ese usuario (plantillas, reclamaciones y vetos)');
    console.log('[Consola]   limpiarmensajes <id_canal> <n>     -> borra los n últimos mensajes de un canal (1-500)');
    console.log('[Consola]   limpiarmensaje <enlace|id>         -> borra un mensaje por su enlace, o <id_canal> <id_mensaje>, o solo su id');
    console.log('[Consola]   vetotest [id_usuario] [dias]        -> crea un veto de prueba en el canal de vetos (sin efecto real)');
    console.log('[Consola]   recuperarplantillas                 -> recupera plantillas antiguas (copias locales + historial de Discord) sin duplicar');

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
            if (command === 'plantillaenviar' && (args[0] || '').toLowerCase() === 'test') {
                const userId = arg || process.env.duenio_delbot;
                const plantillaId = await crearPlantillaTest(client, userId, userId, userId);
                console.log(`[Consola] OK: plantilla de prueba ${plantillaId} creada y enviada al canal de registro (usuario ${userId}).`);
            } else if (command === 'plantillas') {
                const userId = arg || process.env.duenio_delbot;
                const plantillas = getPlantillasByUser(userId);
                if (!plantillas.length) {
                    console.log(`[Consola] El usuario ${userId} no tiene plantillas registradas.`);
                } else {
                    console.log(`[Consola] Plantillas de ${userId}: ${plantillas.length} total.`);
                    for (const p of plantillas.slice(0, 10)) {
                        console.log(`  - ${p.id} | estado: ${p.estado} | creada: ${p.fechaCreacion}${p.test ? ' | TEST' : ''}`);
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
                    console.log('[Consola] Uso: plantillaeliminar <id_plantilla> (ej: 123456789012345678_1791495073810)');
                } else {
                    const p = getPlantilla(plantillaId);
                    if (!p) {
                        console.log(`[Consola] No existe ninguna plantilla con ID "${plantillaId}".`);
                    } else {
                        deletePlantilla(plantillaId);
                        const teniaReclamacion = deleteReclamacion(plantillaId);
                        console.log(`[Consola] OK: plantilla ${plantillaId} (usuario ${p.userId}, estado ${p.estado}) eliminada${teniaReclamacion ? ' y su reclamación borrada' : ''}.`);
                    }
                }
            } else if (command === 'vetotest') {
                const userId = arg || process.env.duenio_delbot;
                const diasRaw = args.find(a => /^\d+$/.test(a) && a !== arg) || args.find((a, i) => i > 0 && /^\d+$/.test(a));
                const dias = diasRaw ? parseInt(diasRaw, 10) : 1;
                const vetoId = await crearVetoTest(client, userId, dias);
                console.log(`[Consola] OK: veto de prueba ${vetoId} enviado al canal de vetos (usuario ${userId}, ${dias} día(s)). No añade rol ni envía DM.`);
            } else if (command === 'limpiartest') {
                const res = await limpiarTest(client);
                const partes = [];
                if (res.plantillas) partes.push(`${res.plantillas} plantilla(s) de prueba (${res.plantillaIds.join(', ')})`);
                if (res.vetos) partes.push(`${res.vetos} veto(s) de prueba (${res.vetoIds.join(', ')})`);
                console.log(`[Consola] OK: ${res.mensajes} mensaje(s) de prueba borrados de Discord${partes.length ? ` y ${partes.join(' y ')} borrados` : ', y no había registros de prueba que borrar'}.`);
            } else if (command === 'limpiarregistro') {
                const userId = arg;
                if (!/^\d{15,21}$/.test(userId)) {
                    console.log('[Consola] Uso: limpiarregistro <id_usuario> (ej: 991791054535802880)');
                } else {
                    const res = await limpiarRegistro(client, userId);
                    console.log(`[Consola] OK: usuario ${userId} — ${res.plantillas} plantilla(s), ${res.vetos} veto(s) y ${res.mensajes} mensaje(s) de Discord borrados.`);
                    if (res.pIds.length) console.log(`  plantillas: ${res.pIds.join(', ')}`);
                    if (res.vIds.length) console.log(`  vetos: ${res.vIds.join(', ')}`);
                    if (!res.plantillas && !res.vetos && !res.mensajes) console.log('  (no había nada registrado de ese usuario)');
                }
            } else if (command === 'limpiarmensajes') {
                const canalId = arg;
                const cantidad = Number(args[1]);
                if (!/^\d{15,21}$/.test(canalId) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 500) {
                    console.log('[Consola] Uso: limpiarmensajes <id_canal> <cantidad> (cantidad entre 1 y 500)');
                } else {
                    const res = await limpiarMensajes(client, canalId, cantidad);
                    console.log(`[Consola] OK: ${res.borrados}/${res.solicitados} mensaje(s) borrados del canal ${canalId}${res.fallidos ? ` (${res.fallidos} fallidos, posiblemente permisos o antigüedad)` : ''}.`);
                }
            } else if (command === 'limpiarmensaje') {
                if (!args.length) {
                    console.log('[Consola] Uso: limpiarmensaje <enlace | id_canal id_mensaje | id_mensaje>');
                } else {
                    const res = await limpiarMensaje(client, args);
                    if (res.ok) {
                        console.log(`[Consola] OK: mensaje ${res.messageId} borrado del canal ${res.channelId}${res.origen === 'buscado' ? ' (buscado en canales conocidos)' : ''}.`);
                    } else {
                        console.log(`[Consola] No se pudo borrar: ${res.error}`);
                    }
                }
            } else if (command === 'recuperarplantillas') {
                console.log('[Recuperar] Iniciando (lectura de Discord, puede tardar unos segundos)...');
                const r = await recuperarPlantillas(client);
                const estados = Object.entries(r.porEstado).map(([e, n]) => `${e}: ${n}`).join(' · ');
                console.log(`[Recuperar] OK: ${r.total} plantilla(s) recuperadas de ${r.antes} a ${r.despues} en total.`);
                if (r.total) console.log(`[Recuperar]   nuevas por estado -> ${estados} (copias: ${r.copias}, fichas: ${r.fichas}, anuncios: ${r.anuncios})`);
                else console.log('[Recuperar]   no había nada nuevo que recuperar.');
                if (r.respaldo) console.log(`[Recuperar]   respaldo previo: src/database/backups/${r.respaldo}`);
            } else if (command === 'ayuda' || command === 'help' || command === 'comandos') {
                console.log('[Consola] plantillaenviar test [id_usuario]');
                console.log('[Consola] plantillas [id_usuario]');
                console.log('[Consola] reclamaciones [id_usuario]');
                console.log('[Consola] plantillaeliminar <id_plantilla>');
                console.log('[Consola] limpiartest');
                console.log('[Consola] limpiarregistro <id_usuario>');
                console.log('[Consola] limpiarmensajes <id_canal> <cantidad>');
                console.log('[Consola] limpiarmensaje <enlace | id_canal id_mensaje | id_mensaje>');
                console.log('[Consola] vetotest [id_usuario] [dias]');
                console.log('[Consola] recuperarplantillas');
            } else {
                console.log(`[Consola] Comando desconocido: "${command}". Escribe "ayuda" para ver los comandos.`);
            }
        } catch (e) {
            console.error('[Consola] Error:', e.message);
        }
    });
}

module.exports = { initConsole };
