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
const { getOposicion } = require('../database/oposiciones');
const { logAction } = require('../utils/actionLog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('estado')
        .setDescription('Consultar estado de una oposición')
        .addSubcommand(sub =>
            sub.setName('oposicion')
                .setDescription('Consultar estado de una oposición')
                .addStringOption(opt =>
                    opt.setName('codigo')
                        .setDescription('Codigo de la oposición (OPS-XXXX)')
                        .setRequired(true))),

    async execute(interaction) {
        const code = interaction.options.getString('codigo').toUpperCase().trim();
        const oposicion = getOposicion(code);

        if (!oposicion) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/estado oposicion', motivo: 'código de oposición no encontrado' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No se encontró ninguna oposición con el código \`${code}\`.`)
                );
            return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
        }

        if (oposicion.userId !== interaction.user.id) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/estado oposicion', motivo: 'este código no te pertenece' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Este código no te pertenece.`)
                );
            return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
        }

        const ESTADO_COLORS = {
            pendiente: 0xfee75c,
            en_curso: 0x57f287,
            finalizada: 0x2b2d31,
            cancelada: 0xed4245,
        };

        const ESTADO_LABELS = {
            pendiente: 'Pendiente',
            en_curso: 'En curso',
            finalizada: 'Finalizada',
            cancelada: 'Cancelada',
        };

        const estado = oposicion.estado;

        const ESTADO_EMOJI = {
            pendiente: process.env.emoji_yellowtick,
            en_curso: process.env.emoji_greentick,
            finalizada: process.env.emoji_greytick,
            cancelada: process.env.emoji_redtick,
        };

        const estadoEmoji = ESTADO_EMOJI[estado] || process.env.emoji_greytick;

        const imagePath = path.join(__dirname, '..', '..', 'convocatoriasimagen.png');
        const attachment = new AttachmentBuilder(imagePath, { name: 'logo.png' });

        const container = new ContainerBuilder()
            .setAccentColor(0xfee75c)
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('attachment://logo.png')
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} ${code}`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `> <:${estadoEmoji}> **Estado:** ${ESTADO_LABELS[estado]}\n` +
                    `> 🗓️ **Fecha:** ${oposicion.fecha}\n` +
                    `> 🕕 **Hora:** ${oposicion.hora}`
                )
            );

        if (estado === 'pendiente') {
            container
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# Aceptado por ${oposicion.aceptadoPorTag}`)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`iniciar_oposicion_${code}`)
                            .setLabel('Iniciar')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(process.env.emoji_greentick),
                        new ButtonBuilder()
                            .setCustomId(`cancelar_oposicion_${code}`)
                            .setLabel('Cancelar')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji(process.env.emoji_redtick),
                    )
                );
        } else if (estado === 'en_curso') {
            const fechaInicio = new Date(oposicion.fechaInicio).toLocaleString('es-ES');
            container
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# Iniciada el ${fechaInicio}`)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`finalizar_oposicion_${code}`)
                            .setLabel('Finalizar')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji(process.env.emoji_greentick),
                    )
                );
        } else if (estado === 'finalizada') {
            const fechaInicio = new Date(oposicion.fechaInicio).toLocaleString('es-ES');
            const fechaFin = new Date(oposicion.fechaFin).toLocaleString('es-ES');
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            ).addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Iniciada: ${fechaInicio}\n-# Finalizada: ${fechaFin}`)
            );
        } else if (estado === 'cancelada') {
            const fechaCancelacion = new Date(oposicion.fechaFin).toLocaleString('es-ES');
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            ).addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Cancelada el ${fechaCancelacion}`)
            );
        }

        await interaction.reply({ components: [container], files: [attachment], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
    },
};
