export const CASS3D_PACKS = {
  dragonDice: [
    "dragon-dice.00.txt", "dragon-dice.01.txt", "dragon-dice.02.txt", "dragon-dice.03.txt"
  ],
  dragonCup: [
    "dragon-cup.00.txt", "dragon-cup.01.txt", "dragon-cup.02.txt", "dragon-cup.03.txt", "dragon-cup.04.txt",
    "dragon-cup.05.txt", "dragon-cup.06.txt", "dragon-cup.07.txt", "dragon-cup.08.txt"
  ],
  cardDeck: [
    "card-deck.00.txt", "card-deck.01.txt", "card-deck.02.txt", "card-deck.03.txt", "card-deck.04.txt", "card-deck.05.txt", "card-deck.06.txt",
    "card-deck.07.txt", "card-deck.08.txt", "card-deck.09.txt", "card-deck.10.txt", "card-deck.11.txt", "card-deck.12.txt", "card-deck.13.txt"
  ]
};

const ROOT = "modules/cassinooo/assets/cass3d";
const CACHE = new Map();

function base64Bytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gunzipText(base64) {
  if (typeof DecompressionStream !== "function") throw new Error("Este cliente não oferece DecompressionStream/gzip.");
  const bytes = base64Bytes(base64);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export function decodeFloat32(base64) {
  const bytes = base64Bytes(base64);
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Float32Array(copy);
}

export async function imageFromDataURI(uri) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Falha ao carregar textura Cass3D."));
    image.src = uri;
  });
}

export async function loadCass3DPack(name) {
  if (CACHE.has(name)) return CACHE.get(name);
  const files = CASS3D_PACKS[name];
  if (!files) throw new Error(`Pacote Cass3D desconhecido: ${name}`);
  const promise = (async () => {
    const chunks = await Promise.all(files.map(async (file) => {
      const response = await fetch(`${ROOT}/${file}`);
      if (!response.ok) throw new Error(`Falha carregando ${file}`);
      return (await response.text()).trim();
    }));
    return JSON.parse(await gunzipText(chunks.join("")));
  })();
  CACHE.set(name, promise);
  try { return await promise; }
  catch (error) { CACHE.delete(name); throw error; }
}

export function clearCass3DCache() { CACHE.clear(); }
