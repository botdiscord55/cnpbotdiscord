const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    AttachmentBuilder,
} = require('discord.js');
const path = require('path');
const { createOposicion } = require('../database/oposiciones');
const { logAction } = require('../utils/actionLog');

function hasPermission(member) {
    if (member.id === process.env.userid_noafc) return true;
    const rolesPermitidos = (process.env.rolaceptar_oposiciones || '').split(',').filter(Boolean);
    if (rolesPermitidos.length === 0) return true;
    return rolesPermitidos.some(r => member.roles.cache.has(r));
}

module.exports = [
    {
        customId: 'aceptar_oposicion|',
        execute: async (interaction) => {
            await interaction.deferUpdate();

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!hasPermission(member)) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'aceptar la solicitud de oposición', motivo: 'no tienes permiso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No tienes permiso para realizar esta acción.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const parts = interaction.customId.replace('aceptar_oposicion|', '').split('|');
            const userId = parts[0];
            const fecha = parts[1];
            const hora = parts[2];

            const now = new Date();
            const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

            const code = createOposicion({
                userId,
                userTag: `<@${userId}>`,
                fecha,
                hora,
                aceptadoPor: `<@${interaction.user.id}>`,
                aceptadoPorTag: `${interaction.member.nickname || interaction.user.username} (<@${interaction.user.id}>)`,
            });

                const container = new ContainerBuilder()
                    .setAccentColor(0x57f287)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> **Solicitud de oposición aceptada por** ${interaction.member.nickname || interaction.user.username} (<@${interaction.user.id}>)`)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `-# Solicitada por <@${userId}> • Aceptada el ${date} a las ${time}`
                        )
                    );
            await interaction.editReply({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            try {
                const canalOposicion = await interaction.client.channels.fetch(process.env.canaloposicion_pendiente);

                try {
                    let lastId;
                    while (true) {
                        const options = { limit: 100 };
                        if (lastId) options.before = lastId;
                        const messages = await canalOposicion.messages.fetch(options);
                        if (messages.size === 0) break;
                        for (const [, msg] of messages) {
                            try { await msg.delete(); } catch {}
                        }
                        lastId = messages.last().id;
                        if (messages.size < 100) break;
                    }
                } catch {}

                const imagePath = path.join(__dirname, '..', '..', 'convocatoriasimagen.png');
                const attachment = new AttachmentBuilder(imagePath, { name: 'convocatoria.png' });

                const mentions = [`<@&${process.env.rolplantilla_aceptada}>`, `<@&${process.env.rolagente_cnp}>`];
                if (process.env.rolinstructores) mentions.push(`<@&${process.env.rolinstructores}>`);

                await canalOposicion.send({ content: mentions.join(' ') });

                const container = new ContainerBuilder()
                    .setAccentColor(0x2b2d31)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('**CONVOCATORIA OFICIAL DE OPOSICIONES A LA POLICÍA NACIONAL**\n*Cuerpo Nacional de Policía – Proceso Selectivo*')
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            'Se informa a todos los opositores que las **oposiciones** para el ingreso al **Cuerpo Nacional de Policía** se celebrará el siguiente día:'
                        )
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `> 🗓️ **Fecha:** ${fecha}\n> 🕕 **Hora:** ${hora}`
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                    )
                    .addMediaGalleryComponents(
                        new MediaGalleryBuilder().addItems(
                            new MediaGalleryItemBuilder().setURL('attachment://convocatoria.png')
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `- Para obtener una **calificación extraordinaria**, deberá estudiar todo el temario que se encuentra en <#${process.env.canalmaterial_estudio}>.`
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '**🧰 EQUIPAMIENTO NECESARIO PARA LA PRUEBA:**\n' +
                            'Todos los opositores deberán contar con el siguiente material reglamentario:\n\n' +
                            '> • **Glock 17** con sus cargadores.\n' +
                            '> • **Táser** X26.\n' +
                            '> • Un par de **grilletes**.\n' +
                            '> • **Porra** reglamentaria.\n' +
                            '> • **Spray de pimienta**.'
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '**CONFIRMACIÓN DE ASISTENCIA:**\n\n' +
                            `> • Los opositores <@&${process.env.rolplantilla_aceptada}> que asistan reaccionen a: 🖐️\n` +
                            `> • Los instructores <@&${process.env.rolinstructores}> que asistan reaccionen a: 👮\n` +
                            `> • Los que no sean opositores <@&${process.env.rolagente_cnp}> que asistan reaccionen a: 🚓\n` +
                            '-# Quien reaccione como asistente y no asista, perderá su rol de Plantilla Aceptada.'
                        )
                    )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            '¡Mucha suerte a todos! ¡Demuestren su valía y compromiso con el **Cuerpo Nacional de Policía**!'
                        )
                    );

                const sentMsg = await canalOposicion.send({
                    components: [container],
                    files: [attachment],
                    flags: MessageFlagsBitField.Flags.IsComponentsV2,
                });

                try {
                    await sentMsg.react('🖐️');
                    await sentMsg.react('👮');
                    await sentMsg.react('🚓');
                } catch {}

                try {
                    const user = await interaction.client.users.fetch(userId);
                    const dmContainer = new ContainerBuilder()
                        .setAccentColor(0xfee75c)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`### ${process.env.emoji_oposiciones} OPOSICIÓN ACEPTADA`)
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `Tu solicitud de oposición ha sido **aceptada**.\n` +
                                `> 🗓️ **Fecha:** ${fecha}\n` +
                                `> 🕕 **Hora:** ${hora}\n` +
                                `> 🔑 **Codigo:** \`${code}\``
                            )
                        )
                    .addSeparatorComponents(
                        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                    )
                    .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `-# Usa \`/estado oposicion codigo: ${code}\` para iniciar tu oposición.`
                            )
                        );
                    await user.send({ components: [dmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                    console.log(`[DM] Enviado a ${user.tag} (${userId})`);
                } catch (dmError) {
                    console.error(`[DM] Error al enviar a ${userId}:`, dmError.message);
                }
            } catch (error) {
                console.error('Error al procesar aceptación de oposición:', error);
            }
        },
    },
    {
        customId: 'denegar_oposicion_',
        execute: async (interaction) => {
            await interaction.deferUpdate();

            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!hasPermission(member)) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'denegar la solicitud de oposición', motivo: 'no tienes permiso' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> No tienes permiso para realizar esta acción.`)
                    );
                return interaction.followUp({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const userId = interaction.customId.replace('denegar_oposicion_', '');

            const now = new Date();
            const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            const date = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

            const container = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Solicitud de oposición denegada por <@${interaction.user.id}>.`)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# Solicitada por <@${userId}> • ${date} a las ${time}`
                    )
                );
            await interaction.editReply({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        },
    },
];
