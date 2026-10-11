const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tramitar')
        .setDescription('Tramitar CK de un usuario')
        .addSubcommand(sub =>
            sub.setName('ck')
                .setDescription('Tramitar Character Kill')
                .addUserOption(opt =>
                    opt.setName('usuario')
                        .setDescription('Usuario al que se le tramita el CK')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('nombre_nuevo')
                        .setDescription('Nombre del nuevo personaje')
                        .setRequired(true))),
    execute: async (interaction) => {
        await interaction.deferReply({ flags: MessageFlagsBitField.Flags.Ephemeral });

        const targetUser = interaction.options.getUser('usuario');
        const nombreNuevo = interaction.options.getString('nombre_nuevo');

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const tramitador = member.nickname || interaction.user.username;

        const targetMember = await interaction.guild.members.fetch(targetUser.id);
        const targetNick = targetMember.nickname || targetUser.username;
        const nombreAnterior = targetNick.includes('|') ? targetNick.split('|').slice(1).join('|').trim() : targetNick;

        const rolSinPlantilla = process.env.rol_sinplantilla;
        const rolesToKeep = [rolSinPlantilla, interaction.guild.id].filter(Boolean);

        let rolesQuitados = [];
        for (const [roleId, role] of targetMember.roles.cache) {
            if (rolesToKeep.includes(roleId)) continue;
            try {
                await targetMember.roles.remove(roleId);
                rolesQuitados.push(role.name);
            } catch {}
        }

        if (rolSinPlantilla) {
            try {
                if (!targetMember.roles.cache.has(rolSinPlantilla)) {
                    await targetMember.roles.add(rolSinPlantilla);
                }
            } catch {}
        }

        const newName = `SP | ${nombreNuevo}`;
        try { await targetMember.setNickname(newName); } catch {}

        const now = new Date();
        const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
        const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

        const canalCK = await interaction.client.channels.fetch(process.env.canalregistro_ck);

        const container = new ContainerBuilder()
            .setAccentColor(0x2b2d31)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('### TRAMITACIÓN DE CHARACTER KILL')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**Usuario:** <@${targetUser.id}> (\`${targetUser.id}\`)\n` +
                    `**Nombre anterior:** ${nombreAnterior}\n` +
                    `**Nombre nuevo:** ${nombreNuevo}\n` +
                    `**Tramitado por:** <@${interaction.user.id}> (\`${interaction.user.id}\`)`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `> **Roles quitados**\n` +
                    (rolesQuitados.length > 0
                        ? rolesQuitados.map(r => `<:${process.env.emoji_redtick}> ${r}`).join('\n')
                        : `<:${process.env.emoji_greytick}> Ninguno`)
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `-# ${date} a las ${time}`
                )
            );

        await canalCK.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

        const confirmContainer = new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> CK tramitado correctamente para <@${targetUser.id}>.`)
            );
        await interaction.editReply({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
    },
};
