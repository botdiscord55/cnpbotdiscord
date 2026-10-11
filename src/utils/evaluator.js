require('dotenv').config();

const AI_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = (process.env.AI_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 20000;

let avisoSinClaveEmitido = false;
let avisoErrorEmitido = false;
const cache = new Map();

const VEREDICTOS = ['bien', 'dudoso', 'mal'];

const DEFS = {
  pg: 'PG (Power Gaming): forzar acciones imposibles o muy poco realistas en la vida real, hacerse invencible o romper el realismo del roleplay.',
  mg: 'MG (Meta Gaming): usar informacion que se conoce fuera del rol (OOC) dentro del rol (IC) para sacar beneficio o ventaja propia.',
  bd: 'BD (Bad Driving): conducir de forma irreal, peligrosa o antinatural (exceso de velocidad, chocar, ignorar las normas).',
  vdm: 'VDM (Vehicle Death Match): utilizar un vehiculo como arma para atropellar o matar a otro jugador sin una razon de roleplay valida.',
};

function normalizarTexto(t) {
  if (t === undefined || t === null) return '';
  return String(t)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,;.!?¡¿]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function esBasura(t) {
  const n = normalizarTexto(t);
  if (!n) return true;
  if (n.length < 2) return true;
  const cortas = ['w', 'si', 'no', 'no se', 'nose', 'nse', 'nada', 'nda', 'hola', 'h', 'npi', 's.n', 'sin.n', 'xD', 'xdd', 'okk', 'ok', 'x', 'q', 'k', 'bno', 'bn'];
  if (cortas.includes(n)) return true;
  const soloLetra = n.replace(/\s/g, '');
  if (soloLetra.length >= 3 && /^(.)\1+$/.test(soloLetra)) return true;
  return false;
}

const RULES = {
  pg: {
    requisito: /power\s*gam\w+|power\s*garm\w+|powerplay|\bpg\b|poder\s*gam\w+|puwer\s*gamin|pover\s*gamin|powe\s*gamin|power\s*gami/,
    fuertes: [
      /power\s*gaming|powergaming|power\s*garming/,
      /imposibl/,
      /irreal/,
      /realidad/,
      /invencibl/,
      /forzar|forzando|forzada/,
      /antirrol/,
      /exagerad/,
      /sobrehumano|superpoder/,
      /no\s*(es|se\s*puede|puedes)\s*(hacer|realizar|ser)/,
      /no\s*(se\s*)?(puede|pueden|puedes)\s*(hacer|realizar|ser)/,
      /no\s+es\s+posible/,
      /hacer.*imposibl|imposibl.*hacer/,
      /acciones?\s*(imposibl|irreal)/,
    ],
    idea: [
      /imposibl/,
      /irreal/,
      /realidad/,
      /invencibl/,
      /forzar|forzando|forzada/,
      /antirrol/,
      /exagerad/,
      /sobrehumano|superpoder/,
      /no\s*(es|se\s*puede|puedes)\s*(hacer|realizar|ser)/,
      /no\s*(se\s*)?(puede|pueden|puedes)\s*(hacer|realizar|ser)/,
      /no\s+es\s+posible/,
      /hacer.*imposibl|imposibl.*hacer/,
      /acciones?\s*(imposibl|irreal)/,
    ],
    senal: /power|\bpg\b|poder\s*gam|puwer|pover/,
  },
  mg: {
    requisito: /meta\s*gam\w+|meta\s*garm\w+|\bmg\b|metagam\w+|meta\s*gami/,
    fuertes: [
      /metagaming|meta\s*gaming/,
      /ooc\b/,
      /informac/i,
      /\binfo\b/,
      /fuera\s*(del\s*)?(rol|juego|personaje)/,
      /ventaja/,
      /benefici/,
      /privilegi/,
      /intercambia.*informac|informac.*fuera|informac.*intercambi/,
      /saber.*fuera|fuera.*saber/,
      /conocer.*rol.*fuera|fuera.*rol.*conocer/,
    ],
    idea: [
      /ooc\b/,
      /informac/i,
      /\binfo\b/,
      /fuera\s*(del\s*)?(rol|juego|personaje)/,
      /ventaja/,
      /benefici/,
      /privilegi/,
      /intercambia.*informac|informac.*fuera|informac.*intercambi/,
      /saber.*fuera|fuera.*saber/,
      /conocer.*rol.*fuera|fuera.*rol.*conocer/,
    ],
    senal: /meta|\bmg\b/,
  },
  bd: {
    requisito: /bad\s*driv\w+|\bbd\b|baddriv\w+|bad\s*dri/,
    fuertes: [
      /bad\s*driving|baddriving/,
      /conduc/,
      /irrealista|irrealist/,
      /antinatural/,
      /aceler/,
      /\b180\b/,
      /choc/,
      /semaf/,
      /farol/,
      /acera/,
      /indestructibl/,
      /alta\s*velocidad|velocidad/,
      /mala\s*conduccion|conduccion\s*irreal/,
      /conducir\s*(mal|irreal|peligro|imposibl)/,
      /velocidad\s*(imposibl|irreal|excesiv)/,
    ],
    idea: [
      /conduc/,
      /irrealista|irrealist/,
      /antinatural/,
      /aceler/,
      /\b180\b/,
      /choc/,
      /semaf/,
      /farol/,
      /acera/,
      /indestructibl/,
      /alta\s*velocidad|velocidad/,
      /mala\s*conduccion|conduccion\s*irreal/,
      /conducir\s*(mal|irreal|peligro|imposibl)/,
      /velocidad\s*(imposibl|irreal|excesiv)/,
    ],
    senal: /driv|\bbd\b/,
  },
  vdm: {
    requisito: /vehic\w*\s*dea\w*\s*ma\w+|vehic\w*death\w+|vehicledeath\w+|\bvdm\b|vehiculo.*muerte|vehicul.*match/,
    fuertes: [
      /vehicle\s*death\s*match|vehicledeathmatch/,
      /\bvdm\b/,
      /atropell/,
      /vehicul.*arma|arma.*vehicul|coche.*(arma|matar)|vehicul.*(arma|matar|dan)/,
      /matar|mata\b/,
      /pegar|golpear|empujar/,
      /dan[oa]ndo|dano\b/,
      /atropelar|atropellar/,
      /usar.*vehiculo.*matar|matar.*vehiculo/,
    ],
    idea: [
      /atropell/,
      /vehicul.*arma|arma.*vehicul|coche.*(arma|matar)|vehicul.*(arma|matar|dan)/,
      /matar|mata\b/,
      /pegar|golpear|empujar/,
      /dan[oa]ndo|dano\b/,
      /atropelar|atropellar/,
      /usar.*vehiculo.*matar|matar.*vehiculo/,
    ],
    senal: /\bvdm\b/,
  },
};

function evaluarConceptoLocal(key, texto) {
  if (esBasura(texto)) return 'mal';
  const n = normalizarTexto(texto);
  const regla = RULES[key];
  if (!regla) return 'mal';

  const mencionaTermino = regla.requisito.test(n);
  const coincide = regla.fuertes.some(r => r.test(n));

  const partes = n.split(/\s+/);
  let mencionaEnPartes = false;
  let coincideEnPartes = false;
  for (const parte of partes) {
    if (regla.requisito.test(parte)) mencionaEnPartes = true;
    if (regla.fuertes.some(r => r.test(parte))) coincideEnPartes = true;
  }

  if ((mencionaTermino || mencionaEnPartes) && (coincide || coincideEnPartes)) return 'bien';

  for (const [k2, r] of Object.entries(RULES)) {
    if (k2 === key) continue;
    if (r.senal.test(n)) return 'mal';
  }

  if (coincide || coincideEnPartes) return 'dudoso';
  if (mencionaTermino || mencionaEnPartes) return 'dudoso';
  return 'mal';
}

function evaluarLocal(data) {
  const r = {
    pg: evaluarConceptoLocal('pg', data.pg),
    mg: evaluarConceptoLocal('mg', data.mg),
    bd: evaluarConceptoLocal('bd', data.bd),
    vdm: evaluarConceptoLocal('vdm', data.vdm),
  };
  r.razones = {};
  const textos = { pg: data.pg, mg: data.mg, bd: data.bd, vdm: data.vdm };
  for (const k of ['pg', 'mg', 'bd', 'vdm']) {
    const n = normalizarTexto(textos[k] ?? '');
    if (esBasura(textos[k])) {
      r.razones[k] = 'Respuesta vacía o insuficiente.';
    } else if (r[k] === 'bien') {
      r.razones[k] = 'Correcto, define bien el concepto.';
    } else if (r[k] === 'dudoso') {
      const tieneNombreCompleto = /power\s*gaming|meta\s*gaming|bad\s*driv|vehicle\s*death\s*match|\(pg\)|\(mg\)|\(bd\)|\(vdm\)|\[pg\]|\[mg\]|\[bd\]|\[vdm\]|\{pg\}|\{mg\}|\{bd\}|\{vdm\}/i.test(n);
      const tieneIdea = RULES[k].idea.some(re => re.test(n));
      if (tieneIdea && !tieneNombreCompleto) {
        r.razones[k] = 'Define bien pero le falta la sigla (usa parentesis o corchetes para que sea correcta).';
      } else {
        r.razones[k] = 'Parcialmente correcto, le falta profundidad.';
      }
    } else {
      r.razones[k] = 'Incorrecto o no relacionado con el concepto.';
    }
  }
  return r;
}

function extraerJSON(content) {
  if (!content) return null;
  let c = String(content).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const inicio = c.indexOf('{');
  const fin = c.lastIndexOf('}');
  if (inicio === -1 || fin === -1 || fin <= inicio) return null;
  try { return JSON.parse(c.slice(inicio, fin + 1)); } catch (e) { return null; }
}

function textoPlano(s, max = 160) {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max);
}

function verificarVeredictos(json) {
  if (!json || typeof json !== 'object') return null;
  const out = {};
  for (const k of ['pg', 'mg', 'bd', 'vdm']) {
    const v = String(json[k] ?? '').toLowerCase().trim();
    if (VEREDICTOS.includes(v)) out[k] = v;
  }
  if (!Object.keys(out).length) return null;
  out.razones = json.razones && typeof json.razones === 'object' ? json.razones : {};
  return out;
}

async function evaluarConIA(data) {
  if (!AI_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const system = [
    'Eres un instructor de la Escuela Nacional de Policia que evalua definiciones de conceptos de roleplay de alumnos que aplican a la CNP.',
    'Definiciones de referencia de la academia:',
    ...Object.keys(DEFS).map(k => `- ${DEFS[k]}`),
    'CRITERIOS por concepto:',
    '- "bien": menciona el nombre COMPLETO del concepto (Power Gaming, Meta Gaming, Bad Driving, Vehicle Death Match) o la sigla con parentesis/corchetes [(PG)], Y la definicion capta la idea principal. Las faltas de ortografia y la ausencia de tildes NO afectan la nota.',
    '- "dudoso": explica la idea pero solo pone la sigla sin parentesis/corchetes, o la definicion es muy corta o parcial.',
    '- "mal": respuesta vacia o basura, solo repite la sigla sin explicar, describe otro concepto o esta claramente equivocada.',
    'Si la respuesta trae varios conceptos mezclados (ej: "powergaming,hacer"), separalos y evalua cada parte; una falta ortografica puntual ("haser" en vez de "hacer") no penaliza si la idea es clara.',
    'NO consideres falta de ortografia: ausencia de tildes, mayusculas, ni abreviaciones ("xq", "k", "q").',
    'Pon "faltas": true SOLO si hay 3 o mas palabras realmente mal escritas (ej: "gamig", "velocidat", "conucir"); si no, "faltas": false.',
    'Responde EXCLUSIVAMENTE con un JSON valido en UNA sola linea, sin markdown ni comentarios, con exactamente esta forma:',
    '{"pg":"bien","mg":"dudoso","bd":"mal","vdm":"bien","faltas":false,"razones":{"pg":"razon","mg":"razon","bd":"razon","vdm":"razon"},"razon_general":"resumen"}',
    'Cada razon individual debe ser UNA sola frase breve (max 12 palabras), sin saltos de linea. Textos tipicos: "Correcto, define bien el concepto.", "Define bien pero le falta la sigla.", "NO APTO. No menciona el concepto.", "Incorrecto, describe otro concepto.", "Respuesta vacia o insuficiente.".',
    'razon_general: resumen directo de 1-2 frases (max 30 palabras) sobre el conjunto de las 4 respuestas, sin hablar en tercera persona de "el alumno". Debe ser COHERENTE con tus veredictos: si un concepto es "bien", NO digas que le falta la sigla, que esta mal o que carece de algo; solo menciona los conceptos "dudoso" o "mal". Ejemplos: "Entiende Power Gaming y Meta Gaming pero no ha colocado las siglas de Bad Driving y Vehicle Death Match junto a sus definiciones.", "No demuestra conocimiento de los conceptos basicos de roleplay.", "Buen dominio de todos los conceptos, se recomienda avanzar."',
    'EJEMPLOS:',
    '- PG: "Power Gaming: forzar acciones imposibles o poco realistas en el rol" -> pg "bien".',
    '- PG: "PG: hacer cosas imposibles" (sigla sin parentesis) -> pg "dudoso", razon "Define bien pero le falta la sigla.".',
    '- MG: "MG" -> mg "mal", razon "NO APTO. Solo repite la sigla sin definir.".',
    '- BD: "Bad Driving: conducir de forma irresponsable y antinatural" -> bd "bien".',
    '- VDM: "Vehicle Death Match: atropellar a un jugador con un vehiculo sin motivo de rol valido" -> vdm "bien".',
    '- MG: "(MG): usar informacion del OOC dentro del rol para sacar ventaja" -> mg "bien".',
  ].join('\n');
  const user = [
    `Alumno:`,
    `PG: ${data.pg ?? ''}`,
    `MG: ${data.mg ?? ''}`,
    `BD: ${data.bd ?? ''}`,
    `VDM: ${data.vdm ?? ''}`,
  ].join('\n');
  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
        max_tokens: 2500,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${texto.slice(0, 200)}`);
    }
    const j = await res.json();
    const content = j?.choices?.[0]?.message?.content;
    const json = extraerJSON(content);
    const veredictos = verificarVeredictos(json);
    if (!veredictos) return null;
    veredictos.faltas = json?.faltas === true || json?.faltas === 'true';
    veredictos.razon_general = textoPlano(json?.razon_general, 400);
    return veredictos;
  } catch (e) {
    if (!avisoErrorEmitido) {
      avisoErrorEmitido = true;
      console.log(`Evaluador IA: usando modo local (${e.message})`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const PATRONES_FALTA = [
  /\bconducion\b/,
  /\bconducccion\b/,
  /\bexesiv/,
  /\butilisa/,
  /\bhaser\b/,
  /\bhasia\b/,
  /\bdesir\b/,
  /\bdesiendo\b/,
  /\bimpossib/,
  /\bireal\b/,
  /\binformasiu?on\b|\binformasi/,
  /\bdrivig\b|\bdrivingg\b/,
  /\bgamig\b|\bgarmin\b/,
  /\bdeat\b/,
  /\bmetagamig\b/,
  /\bvehicuar\b/,
  /\bantinaturak\b/,
  /\binvensibl\b/,
  /\bsupohumano\b/,
  /\bporwer\b|\bpover\b|\bpuwer\b/,
  /\bmetagamin\b/,
  /\bbaddrivig\b/,
  /\bvehicull\b/,
  /\bconduccir\b/,
  /\bconucir\b/,
  /\bvelocidat\b/,
];

function detectarFaltasLocal(data) {
  const textos = [data?.pg, data?.mg, data?.bd, data?.vdm].filter(Boolean);
  if (textos.length === 0) return false;
  const texto = normalizarTexto(textos.join(' | '));
  if (!texto) return false;
  let fallos = 0;
  for (const re of PATRONES_FALTA) {
    if (re.test(texto)) fallos++;
    if (fallos >= 2) return true;
  }
  const palabras = texto.split(/\s+/);
  let palabrasRaras = 0;
  for (const pal of palabras) {
    if (pal.length > 4) {
      if (/[aeiou]{3,}/.test(pal)) continue;
      if (/[^aeiou]{5,}/.test(pal)) palabrasRaras++;
    }
  }
  if (palabrasRaras >= 3) return true;
  return false;
}

const CLAVES_CONC = ['pg', 'mg', 'bd', 'vdm'];
const NOMBRES_CONC = { pg: 'power gaming', mg: 'meta gaming', bd: 'bad driving', vdm: 'vehicle death match' };

function razonGeneralCoherente(rg, r) {
  if (!rg) return false;
  if (CLAVES_CONC.every(k => r[k] === 'bien')) return false;
  const queja = /(falta|carec|omite|no define|no ha colocado|no menciona|no apto|incorrecto|equivocad|sin (parentesis|sigla|definir)|no usa|no lleva|vacia|insuficiente)/;
  if (!queja.test(normalizarTexto(rg))) return true;
  if (!CLAVES_CONC.some(k => r[k] !== 'bien')) return false;
  const frases = String(rg).split(/[.;]/);
  for (const f of frases) {
    const nf = normalizarTexto(f);
    if (!queja.test(nf)) continue;
    for (const k of CLAVES_CONC) {
      if (r[k] !== 'bien') continue;
      if (nf.includes(NOMBRES_CONC[k]) || new RegExp(`\\b${k}\\b`).test(nf)) return false;
    }
  }
  return true;
}

async function evaluarPlantilla(data) {
  if (!AI_KEY && !avisoSinClaveEmitido) {
    avisoSinClaveEmitido = true;
    console.log('Evaluador IA: sin AI_API_KEY, modo local.');
  }
  const claveCache = normalizarTexto([data?.pg, data?.mg, data?.bd, data?.vdm].join(' | '));
  if (cache.has(claveCache)) return cache.get(claveCache);

  const basura = {};
  let hayTextoReal = false;
  for (const k of CLAVES_CONC) {
    basura[k] = esBasura(data?.[k]);
    if (!basura[k]) hayTextoReal = true;
  }

  const local = evaluarLocal(data);
  let resultado = null;
  if (AI_KEY && hayTextoReal) {
    const ia = await evaluarConIA(data);
    if (ia) {
      resultado = { ...local, fuente: 'ia', razones: { ...local.razones }, razon_general: ia.razon_general || '', faltas: ia.faltas === true };
      for (const k of CLAVES_CONC) {
        if (ia[k]) resultado[k] = ia[k];
        const r = textoPlano(ia.razones?.[k]);
        if (r) resultado.razones[k] = r;
      }
    }
  }
  if (!resultado) resultado = { ...local, fuente: 'local' };

  for (const k of CLAVES_CONC) {
    if (basura[k]) {
      resultado[k] = 'mal';
      continue;
    }
    const n = normalizarTexto(data?.[k] ?? '');
    const palabras = n.split(' ').filter(Boolean).length;
    if (resultado[k] === 'bien' && !RULES[k].requisito.test(n)) {
      resultado[k] = 'dudoso';
      resultado.razones[k] = 'Define bien pero le falta la sigla (usa parentesis o corchetes para que sea correcta).';
    } else if (resultado[k] === 'dudoso' && RULES[k].requisito.test(n) && RULES[k].idea.some(re => re.test(n)) && palabras >= 3) {
      resultado[k] = 'bien';
      resultado.razones[k] = 'Correcto, define bien el concepto.';
    }
  }

  if (!resultado.faltas) resultado.faltas = detectarFaltasLocal(data);

  if (resultado.razon_general && !razonGeneralCoherente(resultado.razon_general, resultado)) {
    resultado.razon_general = '';
  }

  cache.set(claveCache, resultado);
  if (!resultado.razon_general) {
    const bien = CLAVES_CONC.filter(k => resultado[k] === 'bien').length;
    const mal = CLAVES_CONC.filter(k => resultado[k] === 'mal').length;
    const faltaSigla = CLAVES_CONC.filter(k => resultado.razones[k] && resultado.razones[k].includes('falta la sigla'));
    const nombresMap = { pg: 'Power Gaming', mg: 'Meta Gaming', bd: 'Bad Driving', vdm: 'Vehicle Death Match' };

    let base = '';
    if (mal >= 3) base = 'No se demuestra conocimiento de los conceptos básicos de roleplay. Se recomienda estudiar el material de la academia antes de reintentar.';
    else if (mal >= 2) base = 'Se observan deficiencias en varios conceptos. Debe reforzar su conocimiento antes de continuar con el proceso.';
    else if (bien >= 3) {
      const flojos = CLAVES_CONC.filter(k => resultado[k] !== 'bien').map(k => nombresMap[k]);
      base = flojos.length > 0
        ? `Buen dominio general, aunque debe reforzar ${flojos.join(' y ')}. Se recomienda revisar ese concepto antes de avanzar.`
        : 'Buen dominio de los conceptos de roleplay. Se recomienda avanzar en el proceso de selección. Esta plantilla la veo apta para ser aceptada.';
    }
    else base = 'Se observa un conocimiento parcial. Se recomienda revisar los conceptos marcados como incorrectos o dudosos.';

    if (faltaSigla.length > 0) {
      const faltan = faltaSigla.map(k => nombresMap[k]).join(', ');
      const entiende = CLAVES_CONC.filter(k => resultado[k] === 'bien').map(k => nombresMap[k]);
      if (entiende.length > 0) {
        base = `Entiende ${entiende.join(', ')} pero no ha colocado las siglas de ${faltan} junto a sus definiciones.`;
      } else {
        base = `No ha colocado las siglas completas de ${faltan} junto a sus definiciones.`;
      }
    }

    if (resultado.faltas) {
      base += ' Además, se observa que tiene mala ortografía.';
    }

    resultado.razon_general = base;
  }
  return resultado;
}

module.exports = { evaluarPlantilla };
