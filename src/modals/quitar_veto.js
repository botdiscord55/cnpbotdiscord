const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
} = require('discord.js');
const { getVetoByUser, updateVeto } = require('../database/vetos');
const { revokeVeto, checkRole } = require('../buttons/veto');
const { logAction } = require('../utils/actionLog');

function errorContainer(text) {
    return new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> ${text}`)
        );
}

module.exports = [
    {
        customId: 'modal_quitar_veto_',
        execute: async (interaction) => {
            await interaction.deferReply({ ephemeral: true });

            const parts = interaction.customId.replace('modal_quitar_veto_', '').split('_');
            const targetUserId = parts[0];
            const channelId = parts[1] || '';
            const messageId = parts.slice(2).join('_') || '';

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!(await checkRole(member))) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'quitar el veto', motivo: 'no tienes permiso' });
                return interaction.editReply({ components: [errorContainer('No tienes permiso para realizar esta acción.')], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            }

            const entry = getVetoByUser(targetUserId) || getVetoByUser(targetUserId, { includeTest: true });
            if (!entry) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'quitar el veto', motivo: 'sin veto activo' });
                return interaction.editReply({ components: [errorContainer(`<@${targetUserId}> no tiene ningún veto activo.`)], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            }

            const vetoId = entry[0];
            const veto = entry[1];
            const esTest = veto.test === true;
            const codigo = (interaction.fields.getTextInputValue('codigo') || '').trim();

            const sinCodigo = !veto.codigoRetiro;
            const correcto = !sinCodigo && codigo === veto.codigoRetiro;

            if (!correcto) {
                const motivo = sinCodigo ? 'retirado sin código (veto anterior al sistema de códigos)' : 'código incorrecto';
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'quitar el veto', motivo, extra: `sobre <@${veto.userId}> — motivo: ${veto.motivo}` });

                if (sinCodigo) {
                    const nickname = member.nickname || interaction.user.username;
                    updateVeto(vetoId, {
                        estado: 'revocado',
                        motivoRevocacion: `Retirado manualmente sin código por ${nickname}`,
                        revisadoPor: interaction.user.id,
                        fechaRevision: new Date().toISOString(),
                    });
                    await revokeVeto(interaction, veto.userId, nickname, veto.motivo, esTest, false);
                    await editarMensajeOriginal(interaction, channelId, messageId, veto, esTest, true);
                    const legacyOk = new ContainerBuilder()
                        .setAccentColor(0xfee75c)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> Veto \`${vetoId}\` retirado **sin código** (veto anterior al sistema de códigos). Queda registrado en #logs.`)
                        );
                    return interaction.editReply({ components: [legacyOk], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                }

                return interaction.editReply({ components: [errorContainer(`Código incorrecto. El veto de <@${veto.userId}> sigue activo.`)], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            }

            const nickname = member.nickname || interaction.user.username;

            updateVeto(vetoId, {
                estado: 'revocado',
                motivoRevocacion: 'Retirado con código de confirmación',
                revisadoPor: interaction.user.id,
                fechaRevision: new Date().toISOString(),
            });

            await revokeVeto(interaction, veto.userId, nickname, veto.motivo, esTest, false);
            await editarMensajeOriginal(interaction, channelId, messageId, veto, esTest, false);

            logAction(interaction, { tipo: 'accion', estado: 'ok', nombre: 'quitar el veto', extra: `sobre <@${veto.userId}> — motivo: ${veto.motivo}` });

            const ok = new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Código correcto. Veto \`${vetoId}\` de <@${veto.userId}> retirado.`)
                );
            return interaction.editReply({ components: [ok], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        },
    },
];

function textoDuracion(duracion) {
    const m = String(duracion || '').match(/(\d+)\s*([wdhmy])/i);
    if (!m) return '> Ha terminado su veto.';
    const num = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    const label = u === 'd' ? (num === 1 ? 'día' : 'días')
        : u === 'h' ? (num === 1 ? 'hora' : 'horas')
        : u === 'm' ? (num === 1 ? 'minuto' : 'minutos')
        : u === 'w' ? (num === 1 ? 'semana' : 'semanas')
        : (num === 1 ? 'año' : 'años');
    return `> Ha terminado su veto de **${num} ${label}**.`;
}

async function editarMensajeOriginal(interaction, channelId, messageId, veto, esTest, sinCodigo) {
    try {
        if (!channelId || !messageId) return;
        const channel = await interaction.client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);

        const container = new ContainerBuilder()
            .setAccentColor(sinCodigo ? 0xfee75c : 0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### <:${process.env.emoji_greentick}> VETO FINALIZADO`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `> **Usuario:** <@${veto.userId}>\n` +
                    `${textoDuracion(veto.duracion)}\n` +
                    `> **Fecha:** <t:${Math.floor(Date.now() / 1000)}:F>` +
                    (sinCodigo ? `\n> -# Retirado sin código (veto anterior).` : '')
                )
            );

        await message.edit({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
    } catch {}
}
