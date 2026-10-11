const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlagsBitField,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const { createVeto, getVetoByUser, updateVeto } = require('../database/vetos');
const { logAction } = require('../utils/actionLog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('veto')
        .setDescription('Gestionar vetos académicos')
        .addSubcommand(sub =>
            sub.setName('academico')
                .setDescription('Aplicar veto académico a un usuario')
                .addUserOption(opt =>
                    opt.setName('usuario')
                        .setDescription('Usuario al que se le aplica el veto')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('motivo')
                        .setDescription('Motivo del veto')
                        .setRequired(false))
                .addStringOption(opt =>
                    opt.setName('duracion')
                        .setDescription('Duración del veto (ej: 7d, 2h, 30m, 1w, 1y)')
                        .setRequired(false))),
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        const targetUser = interaction.options.getUser('usuario');
        const motivo = interaction.options.getString('motivo') || 'Sin motivo especificado';
        const duracion = interaction.options.getString('duracion');

        const existing = getVetoByUser(targetUser.id);
        if (existing) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/veto academico', motivo: 'ya tiene un veto activo' });
            const existingVetoId = existing[0];
            const toggleContainer = new ContainerBuilder()
                .setAccentColor(0xfee75c)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> <@${targetUser.id}> ya tiene un veto activo (ID: \`${existingVetoId}\`).`)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# ¿Deseas retirar el veto actual y aplicar uno nuevo?`)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`toggle_veto_revoke_${existingVetoId}_${targetUser.id}_${Buffer.from(JSON.stringify({ motivo, duracion })).toString('base64')}`)
                            .setLabel('Retirar veto')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(process.env.emoji_greentick),
                        new ButtonBuilder()
                            .setCustomId(`toggle_veto_cancel_${existingVetoId}`)
                            .setLabel('Cancelar')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji(process.env.emoji_redtick),
                    )
                );
            return interaction.editReply({ components: [toggleContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const nickname = member.nickname || interaction.user.username;

        const vetoId = createVeto({
            userId: targetUser.id,
            motivo,
            duracion,
            creadoPor: interaction.user.id,
            creadoPorTag: interaction.user.tag,
            creadoPorNickname: nickname,
        });

        if (duracion) {
            const match = duracion.match(/(\d+)([wydhm])/i);
            if (match) {
                const num = parseInt(match[1]);
                const unit = match[2].toLowerCase();
                const ms = unit === 'y' ? num * 365 * 24 * 60 * 60 * 1000
                    : unit === 'w' ? num * 7 * 24 * 60 * 60 * 1000
                    : unit === 'd' ? num * 24 * 60 * 60 * 1000
                    : unit === 'h' ? num * 60 * 60 * 1000
                    : num * 60 * 1000;
                const expiresAt = new Date(Date.now() + ms).toISOString();
                updateVeto(vetoId, { expiresAt });
            }
        }

        const targetMember = await interaction.guild.members.fetch(targetUser.id);
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
        if (duracion) {
            const match = duracion.match(/(\d+)([wydhm])/i);
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
                    `> **Usuario:** <@${targetUser.id}>\n` +
                    `${duracionText}` +
                    `> **Motivo:** ${motivo}\n` +
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

            let duracionText = '';
            if (duracion) {
                const match = duracion.match(/(\d+)([wydhm])/i);
                if (match) {
                    const num = parseInt(match[1]);
                    const unit = match[2].toLowerCase();
                    const unitLabel = unit === 'y' ? (num === 1 ? 'año' : 'años') : unit === 'w' ? (num === 1 ? 'semana' : 'semanas') : unit === 'd' ? (num === 1 ? 'día' : 'días') : unit === 'h' ? (num === 1 ? 'hora' : 'horas') : (num === 1 ? 'minuto' : 'minutos');
                    duracionText = `> **Duración:** ${num} ${unitLabel}\n`;
                }
            } else {
                duracionText = '> **Duración:** Indefinido\n';
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
                        `${duracionText}` +
                        `> **Motivo:** ${motivo}\n` +
                        `> **Fecha:** <t:${Math.floor(Date.now() / 1000)}:F>`
                    )
                );
            await dm.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        } catch {}

        const confirmContainer = new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Veto \`${vetoId}\` aplicado a <@${targetUser.id}>.`)
            );
        await interaction.editReply({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
    },
};
