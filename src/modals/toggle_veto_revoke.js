const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { getVeto, updateVeto, createVeto } = require('../database/vetos');
const { logAction } = require('../utils/actionLog');

async function revokeVeto(interaction, targetUserId, nickname, motivoVeto) {
    const vetoRoleId = process.env.vetoedadooc_insuficiente;
    if (vetoRoleId) {
        const solicitante = await interaction.guild.members.fetch(targetUserId);
        if (solicitante.roles.cache.has(vetoRoleId)) {
            await solicitante.roles.remove(vetoRoleId);
        }
    }

    const canalVetos = await interaction.client.channels.fetch(process.env.canalregistros_vetos);
    const vetoLog = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## <:${process.env.emoji_greentick}> VETO REVOCADO\nEl veto de <@${targetUserId}> ha sido revocado por **${nickname}**.\n> **Motivo del retiro:** ${motivoVeto}`)
        );
    await canalVetos.send({ components: [vetoLog], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

    try {
        const solicitante = await interaction.guild.members.fetch(targetUserId);
        const dm = await solicitante.createDM();
        const dmContainer = new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} VETO RETIRADO\n> Tu veto ha sido retirado.`)
            );
        await dm.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
    } catch {}
}

module.exports = [
    {
        customId: 'tvrr_',
        execute: async (interaction) => {
            await interaction.deferReply({ ephemeral: true });
            const claimKey = interaction.customId.replace('tvrr_', '');
            const claim = interaction.client._activeClaims.get(claimKey);
            if (!claim) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'revocar el veto', motivo: 'datos no encontrados' });
                return interaction.editReply({ content: 'Datos no encontrados.', flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            }
            interaction.client._activeClaims.delete(claimKey);

            const { existingVetoId, targetUserId, data } = claim;
            const motivoRetiro = interaction.fields.getTextInputValue('motivo_retiro');

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const nickname = member.nickname || interaction.user.username;

            const veto = getVeto(existingVetoId);
            if (veto) {
                updateVeto(existingVetoId, {
                    estado: 'revocado',
                    motivoRevocacion: motivoRetiro,
                    revisadoPor: interaction.user.id,
                    fechaRevision: new Date().toISOString(),
                });
                await revokeVeto(interaction, veto.userId, nickname, motivoRetiro);
            }

            const vetoId = createVeto({
                userId: targetUserId,
                motivo: data.motivo,
                duracion: data.duracion,
                creadoPor: interaction.user.id,
                creadoPorTag: interaction.user.tag,
                creadoPorNickname: nickname,
            });

            if (data.duracion) {
                const match = data.duracion.match(/(\d+)([wydhm])/i);
                if (match) {
                    const num = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    const ms = unit === 'y' ? num * 365 * 24 * 60 * 60 * 1000
                        : unit === 'w' ? num * 7 * 24 * 60 * 60 * 1000
                        : unit === 'd' ? num * 24 * 60 * 60 * 1000
                        : unit === 'h' ? num * 60 * 60 * 1000
                        : num * 60 * 1000;
                    updateVeto(vetoId, { expiresAt: new Date(Date.now() + ms).toISOString() });
                }
            }

            const targetMember = await interaction.guild.members.fetch(targetUserId);
            const vetoRoleId = process.env.rolveto_academico;
            if (vetoRoleId) {
                try {
                    if (!targetMember.roles.cache.has(vetoRoleId)) {
                        await targetMember.roles.add(vetoRoleId);
                    }
                } catch {}
            }

            const canalVetos = await interaction.client.channels.fetch(process.env.canalregistros_vetos);

            let duracionText = '';
            if (data.duracion) {
                const match = data.duracion.match(/(\d+)([wydhm])/i);
                if (match) {
                    const num = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    const unitLabel = unit === 'y' ? (num === 1 ? 'año' : 'años') : unit === 'w' ? (num === 1 ? 'semana' : 'semanas') : unit === 'd' ? (num === 1 ? 'día' : 'días') : unit === 'h' ? (num === 1 ? 'hora' : 'horas') : (num === 1 ? 'minuto' : 'minutos');
                    duracionText = `> **Duración:** ${num} ${unitLabel}\n`;
                }
            } else {
                duracionText = '> **Duración:** Indefinido\n';
            }

            const container = new ContainerBuilder()
                .setAccentColor(0xfee75c)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} VETO ACADÉMICO — \`${vetoId}\``)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `> **Usuario:** <@${targetUserId}>\n` +
                        `${duracionText}` +
                        `> **Motivo:** ${data.motivo}\n` +
                        `> **Aplicado por:** <@${interaction.user.id}>`
                    )
                );

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`autorizar_${vetoId}`)
                    .setLabel('Autorizar')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(process.env.emoji_greentick),
                new ButtonBuilder()
                    .setCustomId(`rechazar_plantilla_${vetoId}`)
                    .setLabel('Denegar')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji(process.env.emoji_redtick),
            );

            await canalVetos.send({ components: [container, row], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            try {
                const dm = await targetMember.createDM();
                let dmDuracionText = '';
                if (data.duracion) {
                    const match = data.duracion.match(/(\d+)([wydhm])/i);
                    if (match) {
                        const num = parseInt(match[1]);
                        const unit = match[2].toLowerCase();
                        const unitLabel = unit === 'y' ? (num === 1 ? 'año' : 'años') : unit === 'w' ? (num === 1 ? 'semana' : 'semanas') : unit === 'd' ? (num === 1 ? 'día' : 'días') : unit === 'h' ? (num === 1 ? 'hora' : 'horas') : (num === 1 ? 'minuto' : 'minutos');
                        dmDuracionText = `> **Duración:** ${num} ${unitLabel}\n`;
                    }
                } else {
                    dmDuracionText = '> **Duración:** Indefinido\n';
                }
                const dmContainer = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} VETO ACADEMICO`)
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `Has sido vetado de la academia del **Cuerpo Nacional de Policía de Andalucía:RP**\n` +
                            `${dmDuracionText}` +
                            `> **Motivo:** ${data.motivo}`
                        )
                    );
                await dm.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            } catch {}

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Veto \`${existingVetoId}\` retirado (motivo: ${motivoRetiro}) y nuevo veto \`${vetoId}\` aplicado a <@${targetUserId}>.`)
                );
            await interaction.editReply({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        },
    },
];
