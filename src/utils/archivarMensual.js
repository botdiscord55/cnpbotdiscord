const fs = require('fs');
const path = require('path');
const { getAllPlantillas } = require('../database/plantillas');

const ARCHIVOS_DIR = path.join(__dirname, '..', 'database', 'archivos');

function claveMes(iso) {
    const d = new Date(iso || 0);
    if (isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function archivarMensual() {
    try {
        if (!fs.existsSync(ARCHIVOS_DIR)) {
            fs.mkdirSync(ARCHIVOS_DIR, { recursive: true });
        }

        const plantillas = getAllPlantillas();
        const porMes = new Map();

        for (const p of plantillas) {
            const clave = claveMes(p.fechaCreacion);
            if (!clave) continue;
            if (!porMes.has(clave)) porMes.set(clave, []);
            porMes.get(clave).push(p);
        }

        let nuevos = 0;
        let actualizados = 0;

        for (const [clave, items] of porMes) {
            const archivo = path.join(ARCHIVOS_DIR, `plantillas-${clave}.json`);
            const contenido = JSON.stringify({
                mes: clave,
                total: items.length,
                generado: new Date().toISOString(),
                plantillas: items,
            }, null, 2);

            const existed = fs.existsSync(archivo);
            if (existed) {
                try {
                    const previo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
                    if (previo.total === items.length) continue;
                } catch {}
            }

            fs.writeFileSync(archivo, contenido);
            if (existed) actualizados++;
            else nuevos++;
        }

        if (nuevos || actualizados) {
            console.log(`[Archivos] Histórico mensual: ${nuevos} nuevo(s), ${actualizados} actualizado(s).`);
        }
    } catch (e) {
        console.error('[Archivos] Error archivando:', e.message);
    }
}

function iniciarArchivador() {
    archivarMensual();
    setInterval(archivarMensual, 6 * 60 * 60 * 1000);
}

module.exports = { archivarMensual, iniciarArchivador };
