module.exports = {
    name: 'guildMemberAdd',
    execute: async (member) => {
        const rolSinPlantilla = process.env.rol_sinplantilla;
        if (!rolSinPlantilla) return;

        try {
            await member.roles.add(rolSinPlantilla);
        } catch (error) {
            console.error(`No se pudo asignar el rol sin plantilla a ${member.user.tag}:`, error.message);
        }
    },
};
