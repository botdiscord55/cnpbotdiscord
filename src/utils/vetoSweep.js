const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
} = require('discord.js');
const { getVetosExpirados, updateVeto } = require('../database/vetos');

const INTERVALO_MS = 10 * 60 * 1000;
const PRIMERA_REVISION_MS = 60 * 1000;

let intervalo = null;
let barriendo = false;

async function retirarCastigo(member) {
    const detalles = [];
    const roles = [process.env.rolveto_academico, process.env.vetoedadooc_insuficiente].filter(Boolean);
    for (const roleId of roles) {
        try {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                detalles.push('rol');
            }
        } catch {}
    }
    try {
        if (member.isCommunicationDisabled && member.isCommunicationDisabled()) {
            await member.timeout(null, 'Veto caducado: tiempo cumplido');
            detalles.push('mute');
        }
    } catch {}
    return detalles;
}

async function barredVetos(client) {
    if (barriendo) return { ocupado: true, retirados: [] };
    barriendo = true;
    const retirados = [];
    try {
        const expirados = getVetosExpirados();
        for (const [vetoId, veto] of expirados) {
            updateVeto(vetoId, {
                estado: 'caducado',
                fechaCaducidad: new Date().toISOString(),
            });

            if (veto.test === true) {
                // Los vetos de prueba solo se marcan; no tocan a nadie
                retirados.push({ vetoId, userId: veto.userId, test: true });
                continue;
            }

            let detalles = [];
            let enServidor = false;
            try {
                const guild = client.guilds.cache.first();
                const member = await guild.members.fetch(veto.userId).catch(() => null);
                if (member) {
                    enServidor = true;
                    detalles = await retirarCastigo(member);
                }
            } catch {}

            try {
                const user = await client.users.fetch(veto.userId);
                const dm = await user.createDM();
                const dmContainer = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### ${process.env.emoji_oposiciones} VETO RETIRADO\n` +
                            `> Tu veto \`${vetoId}\` ha terminado: **tiempo cumplido**.\n` +
                            `-# ${enServidor ? 'Se te han quitado el rol de veto y el mute.' : 'Vuelve al servidor y se te quitarán el rol de veto y el mute.'}`
                        )
                    );
                await dm.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            } catch {}

            try {
                const canal = await client.channels.fetch(process.env.canalregistros_vetos);
                const container = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`## <:${process.env.emoji_greentick}> VETO CADUCADO — \`${vetoId}\``)
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `> **Usuario:** <@${veto.userId}>\n` +
                            `> **Motivo:** ${veto.motivo}\n` +
                            `> **Retirado automáticamente:** tiempo cumplido${detalles.length ? ` (${detalles.join(' y ')})` : enServidor ? '' : ' — el usuario no está en el servidor, se le retirará al volver'}\n` +
                            `> **Fin:** <t:${Math.floor(Date.parse(veto.expiresAt) / 1000)}:F>`
                        )
                    );
                await canal.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.SuppressNotifications });
            } catch {}

            retirados.push({ vetoId, userId: veto.userId, detalles, enServidor });
        }
    } finally {
        barriendo = false;
    }
    return { ocupado: false, retirados };
}

function iniciarSweepVetos(client) {
    if (intervalo) return;
    const lanzar = () => barredVetos(client).catch(e => console.error('[VetoSweep]', e.message || e));
    setTimeout(lanzar, PRIMERA_REVISION_MS).unref?.();
    intervalo = setInterval(lanzar, INTERVALO_MS);
    if (intervalo.unref) intervalo.unref();
    console.log('[VetoSweep] Barrido de caducidad de vetos activo (cada 10 min).');
}

module.exports = { iniciarSweepVetos, barredVetos };
