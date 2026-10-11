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
} = require('discord.js');
const { getOposicionesByUser } = require('../database/oposiciones');
const { logAction } = require('../utils/actionLog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('solicitar')
        .setDescription('Solicitudes de oposiciones')
        .addSubcommand(sub =>
            sub.setName('oposicion')
                .setDescription('Solicitar convocatoria de oposición')
                .addStringOption(opt =>
                    opt.setName('fecha')
                        .setDescription('Fecha de la oposición (DD/MM/AA)')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('hora')
                        .setDescription('Hora de la oposición (HH:MM)')
                        .setRequired(true))),
    execute: async (interaction) => {
        const fecha = interaction.options.getString('fecha');
        const hora = interaction.options.getString('hora');
        console.log('[SOLICITAR] fecha:', fecha, '| hora:', hora);

        await interaction.deferReply({ ephemeral: true });

        const { loadDB } = require('../database/oposiciones');
        const db = loadDB();
        const activas = Object.values(db).filter(o => o.estado === 'pendiente' || o.estado === 'en_curso');
        if (activas.length > 0) {
            const activa = activas[0];
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/solicitar oposicion', motivo: 'ya hay una oposición activa' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Ya hay una oposición activa. Espera a que termine para solicitar otra.`)
                );
            return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const solicitante = member.nickname || interaction.user.username;

        const canalSolicitud = await interaction.client.channels.fetch(process.env.canalsolicitud_oposicion);

        const container = new ContainerBuilder()
            .setAccentColor(0xfee75c)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} SOLICITUD DE OPOSICIÓN`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**Solicitante:** <@${interaction.user.id}> (\`${interaction.user.id}\`)\n` +
                    `> 🗓️ **Fecha:** ${fecha} — 🕕 **Hora:** ${hora}`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# Esperando aprobación de un superior...`
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`aceptar_oposicion|${interaction.user.id}|${fecha}|${hora}`)
                        .setLabel('Aceptar y publicar')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji(process.env.emoji_greentick),
                    new ButtonBuilder()
                        .setCustomId(`denegar_oposicion_${interaction.user.id}`)
                        .setLabel('Denegar')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji(process.env.emoji_redtick),
                )
            );

        await canalSolicitud.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

        const confirmContainer = new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Solicitud enviada a <#${process.env.canalsolicitud_oposicion}>.`)
            );
        await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
    },
};
