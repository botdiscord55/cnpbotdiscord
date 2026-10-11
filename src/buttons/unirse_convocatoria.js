const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
} = require('discord.js');
const { getOposicion, updateOposicion } = require('../database/oposiciones');
const { logAction } = require('../utils/actionLog');

module.exports = [
    {
        customId: 'unirse_convocatoria_',
        execute: async (interaction) => {
            await interaction.deferUpdate();
            const code = interaction.customId.replace('unirse_convocatoria_', '');
            const oposicion = getOposicion(code);

            if (!oposicion) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'unirse a la convocatoria', motivo: 'convocatoria no encontrada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Convocatoria no encontrada.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.estado !== 'en_curso') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'unirse a la convocatoria', motivo: 'esta convocatoria no está activa' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta convocatoria no está activa.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (oposicion.unirseDesactivado) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'unirse a la convocatoria', motivo: 'el botón de unirse ha sido desactivado' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> El botón de unirse ha sido desactivado por un superior.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const member = await interaction.guild.members.fetch(interaction.user.id);
            const rolOposiciones = process.env.rolen_oposiciones;

            if (rolOposiciones && member.roles.cache.has(rolOposiciones)) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'unirse a la convocatoria', motivo: 'ya tienes el rol de oposiciones' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Ya tienes el rol de oposiciones, no puedes unirte de nuevo.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const guildId = interaction.guild.id;

            for (const [roleId, role] of member.roles.cache) {
                if (roleId === guildId) continue;
                if (roleId === rolOposiciones) continue;
                try {
                    await member.roles.remove(roleId);
                } catch {}
            }

            if (rolOposiciones && !member.roles.cache.has(rolOposiciones)) {
                try {
                    await member.roles.add(rolOposiciones);
                } catch {}
            }

            const unidos = oposicion.unidos || [];
            if (!unidos.includes(interaction.user.id)) {
                unidos.push(interaction.user.id);
                updateOposicion(code, { unidos });
            }

            const container = new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Te has unido a la convocatoria. Tu rol ha sido actualizado.`)
                );
            await interaction.followUp({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
        },
    },
];
