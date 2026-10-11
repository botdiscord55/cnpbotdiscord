const userData = new Map();

function getUserData(userId) {
    if (!userData.has(userId)) {
        userData.set(userId, {
            nombre: null,
            dni: null,
            edad: null,
            pg: null,
            mg: null,
            bd: null,
            vdm: null,
            licConducir: null,
            licArmas: null,
            multas: null,
        });
    }
    return userData.get(userId);
}

function clearUserData(userId) {
    userData.delete(userId);
}

module.exports = { getUserData, clearUserData };
