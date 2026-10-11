const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
} = require('discord.js');
const { getSuspendidas, addSuspendida, resetSuspendidas } = require('../database/suspendidas');
const { logAction } = require('../utils/actionLog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resultado')
        .setDescription('Resultado de oposiciones')
        .addSubcommand(sub =>
            sub.setName('oposicion')
                .setDescription('Registrar resultado de oposición')
                .addUserOption(opt =>
                    opt.setName('usuario')
                        .setDescription('Usuario evaluado')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('resultado')
                        .setDescription('Resultado: aprobado o suspendido')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Aprobado', value: 'aprobado' },
                            { name: 'Suspendido', value: 'suspendido' },
                        ))),

    execute: async (interaction) => {
        const targetUser = interaction.options.getUser('usuario');
        const resultado = interaction.options.getString('resultado');

        const member = await interaction.guild.members.fetch(targetUser.id);
        const rolAgente = process.env.rolagente_cnp;
        const rolSuspendida1 = process.env.rol_suspendida1;
        const rolSuspendida2 = process.env.rol_suspendida2;

        if (rolAgente && member.roles.cache.has(rolAgente)) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/resultado oposicion', motivo: 'ya es Agente CNP' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> **${targetUser.username}** ya es Agente CNP. No se puede aplicar ningún resultado.`)
                );
            return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });
        }

        const canal = await interaction.client.channels.fetch(process.env.canalresultado_oposiciones);

        if (resultado === 'aprobado') {
            if (rolSuspendida2 && member.roles.cache.has(rolSuspendida2)) {
                logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/resultado oposicion', motivo: 'ya tiene 2/2 de oposiciones - necesita CK' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> **${targetUser.username}** tiene 2/2 de oposiciones. No se puede aprobar, necesita CK.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });
            }

            const rolEnOposiciones = process.env.rolen_oposiciones;
            const rolesQuitar = [rolSuspendida1, rolSuspendida2, rolEnOposiciones].filter(Boolean);
            for (const roleId of rolesQuitar) {
                if (member.roles.cache.has(roleId)) {
                    try { await member.roles.remove(roleId); } catch {}
                }
            }

            if (rolAgente && !member.roles.cache.has(rolAgente)) {
                try { await member.roles.add(rolAgente); } catch {}
            }

            resetSuspendidas(targetUser.id);

            const currentNick = member.nickname || targetUser.username;
            const nombrePersonaje = currentNick.includes('|') ? currentNick.split('|').slice(1).join('|').trim() : currentNick;
            const newName = `CNP | ${nombrePersonaje}`;
            try { await member.setNickname(newName); } catch {}

            const container = new ContainerBuilder()
                .setAccentColor(0xfee75c)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} AGENTE NUEVO`)
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <@${targetUser.id}> ha aprobado las oposiciones satisfactoriamente.`)
                );

            await canal.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            const replyContainer = new ContainerBuilder()
                .setAccentColor(0x57f287)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> **${targetUser.username}** ha aprobado. Se le ha asignado Agente CNP.`)
                );
            await interaction.reply({ components: [replyContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });

        } else if (resultado === 'suspendido') {
            if (rolSuspendida2 && member.roles.cache.has(rolSuspendida2)) {
                logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/resultado oposicion', motivo: 'ya tiene 2/2 de oposiciones' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> **${targetUser.username}** ya tiene 2/2 de oposiciones. No se puede aplicar otro suspendido.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });
            }

            const info = addSuspendida(targetUser.id);
            const count = info.count;

            const rolEnOposiciones = process.env.rolen_oposiciones;
            const rolesQuitarSusp = [rolEnOposiciones].filter(Boolean);
            for (const roleId of rolesQuitarSusp) {
                if (member.roles.cache.has(roleId)) {
                    try { await member.roles.remove(roleId); } catch {}
                }
            }

            const rolPlantillaAceptada = process.env.rolplantilla_aceptada;
            if (rolPlantillaAceptada && !member.roles.cache.has(rolPlantillaAceptada)) {
                try { await member.roles.add(rolPlantillaAceptada); } catch {}
            }

            if (count === 1) {
                if (rolSuspendida1 && !member.roles.cache.has(rolSuspendida1)) {
                    try { await member.roles.add(rolSuspendida1); } catch {}
                }

                const currentNick = member.nickname || targetUser.username;
                const nombrePersonaje = currentNick.includes('|') ? currentNick.split('|').slice(1).join('|').trim() : currentNick;
                const newName = `OS 1/2 | ${nombrePersonaje}`;
                try { await member.setNickname(newName); } catch {}

                const container = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} OPOSITOR SUSPENDIDO 1/2`)
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <@${targetUser.id}> ha suspendido las oposiciones, le queda un intento.`)
                    );

                await canal.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

                const replyContainer = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_yellowtick}> **${targetUser.username}** suspendido (1/2). Se le mantiene Plantilla Aceptada.`)
                    );
                await interaction.reply({ components: [replyContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });

            } else if (count >= 2) {
                if (rolSuspendida1 && !member.roles.cache.has(rolSuspendida1)) {
                    try { await member.roles.add(rolSuspendida1); } catch {}
                }
                if (rolSuspendida2 && !member.roles.cache.has(rolSuspendida2)) {
                    try { await member.roles.add(rolSuspendida2); } catch {}
                }

                const currentNick = member.nickname || targetUser.username;
                const nombrePersonaje = currentNick.includes('|') ? currentNick.split('|').slice(1).join('|').trim() : currentNick;
                const newName = `OS 2/2 | ${nombrePersonaje}`;
                try { await member.setNickname(newName); } catch {}

                const container = new ContainerBuilder()
                    .setAccentColor(0xfee75c)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} OPOSITOR SUSPENDIDO 2/2`)
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <@${targetUser.id}> ha suspendido las oposiciones, ya no puede opositar más.`)
                    );

                await canal.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

                const replyContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> **${targetUser.username}** suspendido (2/2). No podrá opositar más hasta que no se haga un CK. Se le mantiene Plantilla Aceptada.`)
                    );
                await interaction.reply({ components: [replyContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });
            }
        }
    },
};
