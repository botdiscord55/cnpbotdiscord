const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlagsBitField,
} = require('discord.js');
const { checkRole } = require('./veto');
const { parsearSuffix } = require('../utils/evasion');
const { logAction } = require('../utils/actionLog');

module.exports = [
    {
        customId: 'evadenegar_',
        execute: async (interaction) => {
            const suffix = interaction.customId.replace('evadenegar_', '');
            const { userId, esTest } = parsearSuffix(suffix);

            const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
            if (!member || !(await checkRole(member))) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'no vetar la evasión', motivo: 'no tienes permiso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No tienes permiso para realizar esta acción.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const nickname = member.nickname || interaction.user.username;

            const container = new ContainerBuilder()
                .setAccentColor(esTest ? 0xfee75c : 0x2b2d31)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### ${esTest ? '🧪 TEST — ' : ''}<:${process.env.emoji_greytick}> SIN VETO\n` +
                        `> <@${userId}> **no será vetado** por la evasión: revisado por **${nickname}**.\n` +
                        `> Si más adelante hay constante de evasión, puede vetarse con \`/veto academico\`.`
                    )
                );

            await interaction.update({
                components: [container],
                flags: MessageFlagsBitField.Flags.IsComponentsV2,
                ...(esTest ? { allowed_mentions: { parse: [] } } : {}),
            }).catch(() => {});
        },
    },
];
