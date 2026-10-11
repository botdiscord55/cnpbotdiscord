const {
    ContainerBuilder,
    TextDisplayBuilder,
    MessageFlagsBitField,
} = require('discord.js');

module.exports = [
    {
        customId: 'modal_sugerencia_oposicion_',
        execute: async (interaction) => {
            const sugerencia = interaction.fields.getTextInputValue('sugerencia');
            const userId = interaction.user.id;
            const nickname = interaction.member.nickname || interaction.user.username;

            try {
                const owner = await interaction.client.users.fetch(process.env.duenio_delbot);

                const dmContainer = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### 💡 NUEVA SUGERENCIA`)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `**De:** ${nickname} (<@${userId}>)\n\n` +
                            `> ${sugerencia}`
                        )
                    );

                await owner.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
            } catch {}

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Tu sugerencia ha sido enviada al propietario del bot.`)
                );
            await interaction.reply({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });
        },
    },
];
