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
const { savePlantilla, hasPlantillaPendiente } = require('../database/plantillas');
const { evaluarPlantilla } = require('../utils/evaluator');
const { createVeto, updateVeto } = require('../database/vetos');
const { logAction } = require('../utils/actionLog');

const EMOJI_MAP = {
    bien: `<:${process.env.emoji_greentick}>`,
    dudoso: `<:${process.env.emoji_greytick}>`,
    mal: `<:${process.env.emoji_redtick}>`,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enviar')
        .setDescription('Envía una plantilla de usuario')
        .addSubcommand(sub =>
            sub.setName('plantilla')
                .setDescription('Envía la plantilla de usuario')
                .addStringOption(opt =>
                    opt.setName('nombre_completo')
                        .setDescription('Nombre completo del personaje')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('numero_dni')
                        .setDescription('Número de DNI')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('edad_ooc')
                        .setDescription('Edad OOC')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('pg')
                        .setDescription('Coloca la sigla y definición de PG')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('mg')
                        .setDescription('Coloca la sigla y definición de MG')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('bd')
                        .setDescription('Coloca la sigla y definición de BD')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('vdm')
                        .setDescription('Coloca la sigla y definición de VDM')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('licencia_conducir')
                        .setDescription('¿Posee licencia de conducir?')
                        .addChoices(
                            { name: 'Sí', value: 'Sí' },
                            { name: 'No', value: 'No' },
                        )
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('licencia_armas')
                        .setDescription('¿Posee licencia de armas?')
                        .addChoices(
                            { name: 'Sí', value: 'Sí' },
                            { name: 'No', value: 'No' },
                        )
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('multas_antecedentes')
                        .setDescription('¿Tiene multas o antecedentes?')
                        .addChoices(
                            { name: 'Sí', value: 'Sí' },
                            { name: 'No', value: 'No' },
                        )
                        .setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const canalPermitido = process.env.canalenviar_plantillaenviar;
        if (interaction.channelId !== canalPermitido) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/enviar plantilla', motivo: 'canal incorrecto' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> Canal incorrecto, debes usar el comando en <#${canalPermitido}>.`)
                );
            return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);
        const rolDenegada2 = process.env.rolplantilla_denegada2;
        const rolAceptada = process.env.rolplantilla_aceptada;

        if (rolAceptada && member.roles.cache.has(rolAceptada)) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/enviar plantilla', motivo: 'ya tienes el rol de plantilla aceptada' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Ya tienes el rol de plantilla aceptada. No puedes enviar más solicitudes.`)
                );
            return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        }

        if (rolDenegada2 && member.roles.cache.has(rolDenegada2)) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/enviar plantilla', motivo: 'has agotado tus 2 intentos de plantilla' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Has agotado tus 2 intentos de plantilla. No puedes enviar más solicitudes.`)
                );
            return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        }

        const rolSuspendida2 = process.env.rol_suspendida2;
        if (rolSuspendida2 && member.roles.cache.has(rolSuspendida2)) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/enviar plantilla', motivo: 'has suspendido las oposiciones 2 veces' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Has suspendido las oposiciones 2 veces. No puedes enviar más plantillas.`)
                );
            return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        }

        if (hasPlantillaPendiente(interaction.user.id)) {
            logAction(interaction, { tipo: 'comando', estado: 'warning', nombre: '/enviar plantilla', motivo: 'ya tienes una plantilla pendiente' });
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Ya tienes una plantilla pendiente de revisión. Espera a que sea aceptada o denegada antes de enviar otra.`)
                );
            return interaction.editReply({ components: [errorContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        }

        const nombre = interaction.options.getString('nombre_completo');
        const dni = interaction.options.getString('numero_dni');
        const edad = interaction.options.getString('edad_ooc');
        const pg = interaction.options.getString('pg');
        const mg = interaction.options.getString('mg');
        const bd = interaction.options.getString('bd');
        const vdm = interaction.options.getString('vdm');
        const licConducir = interaction.options.getString('licencia_conducir');
        const licArmas = interaction.options.getString('licencia_armas');
        const multas = interaction.options.getString('multas_antecedentes');

        const evaluacion = await evaluarPlantilla({ pg, mg, bd, vdm });

        const canalRegistro = await interaction.client.channels.fetch(process.env.canalregistro_plantillaenviar);

        const plantillaId = `${interaction.user.id}_${Date.now()}`;

        if (parseInt(edad) < 14) {
            savePlantilla(plantillaId, {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                userName: interaction.user.username,
                nombre,
                dni,
                edad,
                pg,
                mg,
                bd,
                vdm,
                licConducir,
                licArmas,
                multas,
                evaluacion,
                estado: 'denegada',
                motivo: 'Menor de 14 años - pendiente de veto',
            });

            const memberVeto = await interaction.guild.members.fetch(interaction.user.id);
            const nicknameVeto = memberVeto.nickname || interaction.user.username;

            const vetoId = createVeto({
                userId: interaction.user.id,
                motivo: 'edad ooc insuficiente',
                duracion: null,
                creadoPor: interaction.user.id,
                creadoPorTag: interaction.user.tag,
                creadoPorNickname: nicknameVeto,
            });

            const vetoRoleId = process.env.vetoedadooc_insuficiente;
            if (vetoRoleId) {
                try {
                    if (!memberVeto.roles.cache.has(vetoRoleId)) {
                        await memberVeto.roles.add(vetoRoleId);
                    }
                } catch {}
            }

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`<@&${process.env.rolsuperioresacademia}>`)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('### SOLICITUD DE INGRESO - ACADEMIA DE POLICÍA')
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**Información OOC del solicitante:** <@${interaction.user.id}>\n` +
                        `**ID Única:** \`${interaction.user.id}\`\n` +
                        `-# ID de la solicitud: \`${plantillaId}\``
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '**Ficha de Identificación General**\n' +
                        `> ***Nombre Completo:*** ${nombre}\n` +
                        `> ***Número de DNI:*** ${dni}\n` +
                        `> ***Edad OOC:*** ${edad}`
                    )
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '**Evaluación de Conocimientos Teóricos**\n' +
                        `> ${EMOJI_MAP[evaluacion.pg]} ***Concepto de PG:*** ${pg}\n` +
                        `> ${EMOJI_MAP[evaluacion.mg]} ***Concepto de MG:*** ${mg}\n` +
                        `> ${EMOJI_MAP[evaluacion.bd]} ***Concepto de BD:*** ${bd}\n` +
                        `> ${EMOJI_MAP[evaluacion.vdm]} ***Concepto de VDM:*** ${vdm}`
                    )
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '**Estatus de Trámites y Permisos**\n' +
                        `> ${licConducir === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Conducir:*** ${licConducir}\n` +
                        `> ${licArmas === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Armas:*** ${licArmas}\n` +
                        `> ${multas === 'Sí' ? `<:${process.env.emoji_yellowtick}>` : `<:${process.env.emoji_greentick}>`} ***Multas/Antecedentes:*** ${multas}`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`*<:${process.env.emoji_redtick}> Solicitud Denegada automáticamente - Menor de 14 años. Se le ha establecido el veto académico por **edad ooc insuficiente** (ID: \`${vetoId}\`), revisen la situación.*`)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`autorizar_${vetoId}`)
                            .setLabel('Autorizar veto')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji(process.env.emoji_redtick),
                        new ButtonBuilder()
                            .setCustomId(`rechazar_plantilla_${vetoId}`)
                            .setLabel('Denegar veto')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji(process.env.emoji_greentick),
                    )
                );

            await canalRegistro.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

            const ephemeralContainer = new ContainerBuilder()
                .setAccentColor(0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`> <:${process.env.emoji_redtick}> Tiene menos de 14 años. Se le ha rechazado la plantilla y ha recibido un veto por **edad ooc insuficiente**. Esto será revisado por superiores y se podrá revocar si se trata de un error.`)
                );
            return interaction.editReply({ components: [ephemeralContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
        }

            savePlantilla(plantillaId, {
                userId: interaction.user.id,
                userTag: interaction.user.tag,
                userName: interaction.user.username,
                nombre,
                dni,
                edad,
                pg,
                mg,
                bd,
                vdm,
                licConducir,
                licArmas,
                multas,
                evaluacion,
            });

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('### SOLICITUD DE INGRESO - ACADEMIA DE POLICÍA')
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `**Información OOC del solicitante:** <@${interaction.user.id}>\n` +
                    `**ID Única:** \`${interaction.user.id}\`\n` +
                    `-# ID de la solicitud: \`${plantillaId}\``
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '**Ficha de Identificación General**\n' +
                    `> ***Nombre Completo:*** ${nombre}\n` +
                    `> ***Número de DNI:*** ${dni}\n` +
                    `> ***Edad OOC:*** ${edad}`
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '**Evaluación de Conocimientos Teóricos**\n' +
                    `> ${EMOJI_MAP[evaluacion.pg]} ***Concepto de PG:*** ${pg}\n` +
                    `> ${EMOJI_MAP[evaluacion.mg]} ***Concepto de MG:*** ${mg}\n` +
                    `> ${EMOJI_MAP[evaluacion.bd]} ***Concepto de BD:*** ${bd}\n` +
                    `> ${EMOJI_MAP[evaluacion.vdm]} ***Concepto de VDM:*** ${vdm}`
                )
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    '**Estatus de Trámites y Permisos**\n' +
                    `> ${licConducir === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Conducir:*** ${licConducir}\n` +
                    `> ${licArmas === 'Sí' ? `<:${process.env.emoji_greentick}>` : `<:${process.env.emoji_redtick}>`} ***Licencia de Armas:*** ${licArmas}\n` +
                    `> ${multas === 'Sí' ? `<:${process.env.emoji_yellowtick}>` : `<:${process.env.emoji_greentick}>`} ***Multas/Antecedentes:*** ${multas}`
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large)
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`reclamar_${plantillaId}`)
                        .setLabel('Reclamar')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(process.env.emoji_greentick),
                    new ButtonBuilder()
                        .setCustomId(`retirar_${plantillaId}`)
                        .setLabel('Retirar')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(process.env.emoji_yellowtick),
                )
            );

        await canalRegistro.send({ components: [container], flags: MessageFlagsBitField.Flags.IsComponentsV2 });

        const rolDenegada1 = process.env.rolplantilla_denegada1;
        const intentoMsg = (rolDenegada1 && member.roles.cache.has(rolDenegada1))
            ? 'Has enviado tu segunda y última solicitud. En caso de ser rechazada, no podrás volver a enviar.'
            : 'En caso de ser rechazada, te quedará 1 intento más.';

        const confirmContainer = new ContainerBuilder()
            .setAccentColor(0x57f287)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`> <:${process.env.emoji_greentick}> Felicidades, has enviado tu plantilla al **Cuerpo Nacional de Policía**.`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${intentoMsg}**`)
            );
        await interaction.editReply({ components: [confirmContainer], flags: MessageFlagsBitField.Flags.IsComponentsV2 });
    },
};
