const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlagsBitField,
} = require('discord.js');
const { getPlantilla, updatePlantilla } = require('../database/plantillas');
const { resolverReclamacion } = require('../database/reclamaciones');
const { logAction } = require('../utils/actionLog');

const EMOJI_MAP = {
    bien: `<:${process.env.emoji_greentick}>`,
    dudoso: `<:${process.env.emoji_greytick}>`,
    mal: `<:${process.env.emoji_redtick}>`,
};

function buildPlantillaContainer(plantilla, footerText, motivo) {
    const evaluacion = plantilla.evaluacion || {};
    const razones = evaluacion.razones || {};

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### SOLICITUD DE INGRESO - ACADEMIA DE POLICÍA')
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Información OOC del solicitante:** <@${plantilla.userId}>\n` +
                `**ID Única:** \`${plantilla.userId}\`\n` +
                `-# ID de la solicitud: \`${plantilla.id}\``
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Ficha de Identificación General**\n' +
                `> ***Nombre Completo:*** ${plantilla.nombre}\n` +
                `> ***Número de DNI:*** ${plantilla.dni}\n` +
                `> ***Edad OOC:*** ${plantilla.edad}`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Evaluación de Conocimientos Teóricos**\n' +
                `> ${EMOJI_MAP[evaluacion.pg] || ''} ***Concepto de PG:*** ${plantilla.pg}${razones.pg ? `\n> -# ${razones.pg}` : ''}\n` +
                `> ${EMOJI_MAP[evaluacion.mg] || ''} ***Concepto de MG:*** ${plantilla.mg}${razones.mg ? `\n> -# ${razones.mg}` : ''}\n` +
                `> ${EMOJI_MAP[evaluacion.bd] || ''} ***Concepto de BD:*** ${plantilla.bd}${razones.bd ? `\n> -# ${razones.bd}` : ''}\n` +
                `> ${EMOJI_MAP[evaluacion.vdm] || ''} ***Concepto de VDM:*** ${plantilla.vdm}${razones.vdm ? `\n> -# ${razones.vdm}` : ''}`
            )
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '**Estatus de Trámites y Permisos**\n' +
                `> ${plantilla.licConducir === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Conducir:*** ${plantilla.licConducir}\n` +
                `> ${plantilla.licArmas === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Armas:*** ${plantilla.licArmas}\n` +
                `> ${plantilla.multas === 'Sí' ? `<:${process.env.emoji_yellowtick}>` : `<:${process.env.emoji_greentick}>`} ***Multas/Antecedentes:*** ${plantilla.multas}`
            )
        );

    const razonGeneral = evaluacion.razon_general || '';
    if (razonGeneral) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Razón de la evaluación:**\n${razonGeneral}`)
        );
    }

    if (motivo) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Razón del instructor:**\n${motivo}`)
        );
    }

    if (footerText) {
        container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`*${footerText}*`)
            );
    }

    return container;
}

module.exports = [
    {
        customId: 'modal_denegar_',
        execute: async (interaction) => {
            const plantillaId = interaction.customId.replace('modal_denegar_', '');
            const plantilla = getPlantilla(plantillaId);

            if (!plantilla) {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'denegar la plantilla', motivo: 'esta plantilla ya no existe' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya no existe.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            if (plantilla.estado !== 'reclamada') {
                logAction(interaction, { tipo: 'accion', estado: 'warning', nombre: 'denegar la plantilla', motivo: 'esta plantilla ya ha sido procesada' });
                const errorContainer = new ContainerBuilder()
                    .setAccentColor(0xed4245)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Esta plantilla ya ha sido procesada.`)
                    );
                return interaction.reply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2, ephemeral: true });
            }

            const motivo = interaction.fields.getTextInputValue('motivo');
            const member = await interaction.guild.members.fetch(interaction.user.id);
            const nickname = member.nickname || interaction.user.username;

            await interaction.deferUpdate();

            const esTest = plantilla.test === true;
            let intentos = 1;

            if (!esTest) {
                try {
                    const solicitante = await interaction.guild.members.fetch(plantilla.userId);
                    const rolDenegada1 = process.env.rolplantilla_denegada1;
                    const rolDenegada2 = process.env.rolplantilla_denegada2;

                    if (solicitante.roles.cache.has(rolDenegada1)) {
                        intentos = 2;
                        if (rolDenegada2) await solicitante.roles.add(rolDenegada2);
                        const newName = `PR 2/2 | ${plantilla.nombre}`;
                        try { await solicitante.setNickname(newName); } catch {}
                    } else {
                        if (rolDenegada1) await solicitante.roles.add(rolDenegada1);
                        const newName = `PR 1/2 | ${plantilla.nombre}`;
                        try { await solicitante.setNickname(newName); } catch {}
                    }
                } catch (e) {
                    console.error(`[Consola] Aviso: no se pudo actualizar roles/nickname de <@${plantilla.userId}> al denegar:`, e.message || e);
                }
            }

            updatePlantilla(plantillaId, {
                estado: 'denegada',
                denegadaPor: interaction.user.id,
                denegadaTag: interaction.user.tag,
                denegadaNickname: nickname,
                fechaDenegacion: new Date().toISOString(),
                motivo,
                intentos,
            });

            resolverReclamacion(plantillaId, {
                estado: 'denegada',
                resueltaPor: interaction.user.id,
                resueltaTag: interaction.user.tag,
                resueltaNickname: nickname,
            });

            const container = buildPlantillaContainer(plantilla, `<:${process.env.emoji_redtick}> Solicitud Denegada por ${nickname}`, motivo);
            container.setAccentColor(0xed4245);

            const activeClaims = interaction.client._activeClaims || new Map();
            const claimTimeout = activeClaims.get(plantillaId);
            if (claimTimeout) {
                clearTimeout(claimTimeout);
                activeClaims.delete(plantillaId);
            }

            await interaction.editReply({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            if (!esTest) {
                try {
                    const canalResultados = await interaction.client.channels.fetch(process.env.canalresultados_plantillasenviadas);
                    const denyContainer = new ContainerBuilder()
                        .setAccentColor(0xed4245)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`## <:${process.env.emoji_redtick}> PLANTILLA DENEGADA\n<@${plantilla.userId}>, su plantilla para el acceso a la **Escala Básica** del **Cuerpo Nacional de Policía** ha sido denegada. Tras la revisión de la plantilla aplicada a la CNP, hemos observado que el candidato no ha superado satisfactoriamente todos los criterios de evaluación establecidos. Para poder continuar con el proceso, el instructor encargado de revisar la plantilla dejará una anotación detallando los principales errores detectados. Recomendamos encarecidamente revisar dichas observaciones y aplicar los consejos indicados para futuras evaluaciones. ${intentos === 1 ? '**Te queda 1 intento.**' : '**Te has quedado sin intentos (2/2). No podrás volver a enviar plantillas.**'}`)
                        )
                        .addSeparatorComponents(
                            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                        )
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`**Motivo**\n${motivo}`)
                        );
                    await canalResultados.send({ components: [denyContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
                } catch (e) {
                    console.error('[Consola] Aviso: no se pudo enviar el aviso de denegación al canal de resultados:', e.message || e);
                }
            }

            const confirmContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> Has denegado la plantilla de <@${plantilla.userId}>.`)
                );
            await interaction.followUp({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 | MessageFlagsBitField.Flags.Ephemeral });
        },
    },
];
