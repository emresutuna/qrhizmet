import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

const store = () => getStore({ name: "masaqr-menus", region: "eu-central-1" });
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store", ...headers },
});
const hash = (value) => createHash("sha256").update(value).digest("hex");
const normalizePhone = (value) => typeof value === "string" ? value.replace(/\D/g, "").slice(0, 15) : "";
function legacyAuthorized(record, token) {
  if (typeof token !== "string" || token.length < 40 || !record?.ownerHash) return false;
  const supplied = Buffer.from(hash(token), "hex"), stored = Buffer.from(record.ownerHash, "hex");
  return supplied.length === stored.length && timingSafeEqual(supplied, stored);
}
function validMenu(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  if (!data.brand || typeof data.brand.name !== "string" || !data.brand.name.trim()) return false;
  if (!Array.isArray(data.categories) || data.categories.length > 50) return false;
  if (!Array.isArray(data.products) || data.products.length > 80) return false;
  if (!Array.isArray(data.campaigns) || data.campaigns.length > 12) return false;
  return data.products.every((item) => item && typeof item.name === "string" && typeof item.category === "string");
}
async function accountMenu(menus, userId) {
  const { blobs } = await menus.list({ prefix: "menus/" });
  for (const blob of blobs) {
    const record = await menus.get(blob.key, { type: "json" });
    if (record?.accountId === userId) return { id: blob.key.slice("menus/".length), record };
  }
  return null;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const menus = store();
  try {
    if (request.method === "GET" && url.searchParams.get("mine") === "1") {
      const user = await getUser();
      if (!user) return json({ error: "Hesabına giriş yap." }, 401);
      const owned = await accountMenu(menus, user.id);
      return json(owned ? { id: owned.id, data: { ...owned.record.data, menuId: owned.id }, adminPhone: owned.record.adminPhone || "", updatedAt: owned.record.updatedAt } : { menu: null });
    }
    if (request.method === "GET") {
      if (!id || !/^[a-f0-9]{18}$/.test(id)) return json({ error: "Menü bulunamadı." }, 404);
      const entry = await menus.get(`menus/${id}`, { type: "json" });
      if (!entry?.data) return json({ error: "Menü bulunamadı." }, 404);
      const language = url.searchParams.get("lang");
      return json({ id, data: { ...entry.data, menuId: id }, languages: Object.keys(entry.translations || {}), translation: language ? (entry.translations || {})[language] || null : null });
    }
    if (request.method !== "POST" && request.method !== "PUT") return json({ error: "Bu işlem desteklenmiyor." }, 405, { Allow: "GET, POST, PUT" });
    const user = await getUser();
    if (!user) return json({ error: "Menünü kaydetmek için işletme hesabına giriş yap." }, 401);

    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > 4_500_000) return json({ error: "Menü görselleri çok büyük. Görselleri küçültüp tekrar dene." }, 413);
    const body = await request.json(), data = body?.data;
    if (!validMenu(data)) return json({ error: "Menü bilgileri eksik veya geçersiz." }, 400);
    if (Buffer.byteLength(JSON.stringify(data), "utf8") > 4_500_000) return json({ error: "Menü görselleri çok büyük. Daha az veya küçük görsel kullan." }, 413);

    if (request.method === "POST") {
      const current = await accountMenu(menus, user.id);
      if (current) {
        const updatedAt = new Date().toISOString();
        await menus.setJSON(`menus/${current.id}`, { ...current.record, data: { ...data, menuId: current.id }, adminPhone: normalizePhone(body?.adminPhone), updatedAt });
        return json({ id: current.id, updatedAt, existing: true });
      }
      const clientIp = context.ip || "unknown";
      const rateLimits = getStore({ name: "masaqr-create-limits", region: "eu-central-1" });
      const rateKey = `create/${hash(clientIp)}`, currentWindow = Math.floor(Date.now() / 900_000);
      const rate = await rateLimits.get(rateKey, { type: "json" }), count = rate?.window === currentWindow ? rate.count : 0;
      if (count >= 8) return json({ error: "Çok sık menü oluşturuldu. Birkaç dakika sonra tekrar dene." }, 429);
      await rateLimits.setJSON(rateKey, { window: currentWindow, count: count + 1 });
      const menuId = randomBytes(9).toString("hex"), ownerToken = randomBytes(32).toString("base64url");
      await menus.setJSON(`menus/${menuId}`, { accountId: user.id, data: { ...data, menuId }, ownerHash: hash(ownerToken), adminPhone: normalizePhone(body?.adminPhone), translations: {}, updatedAt: new Date().toISOString() });
      return json({ id: menuId, ownerToken }, 201);
    }

    if (!id || !/^[a-f0-9]{18}$/.test(id)) return json({ error: "Menü adresi geçersiz." }, 400);
    const existing = await menus.get(`menus/${id}`, { type: "json" });
    if (!existing?.data) return json({ error: "Menü bulunamadı." }, 404);
    if (existing.accountId && existing.accountId !== user.id) return json({ error: "Bu menüyü düzenleme yetkin yok." }, 403);
    if (!existing.accountId && !legacyAuthorized(existing, body?.ownerToken)) return json({ error: "Bu eski menüyü hesabına bağlamak için önceki tarayıcıda kayıtlı yetki anahtarı gerekiyor." }, 403);
    const updatedAt = new Date().toISOString();
    await menus.setJSON(`menus/${id}`, { ...existing, accountId: user.id, data: { ...data, menuId: id }, adminPhone: normalizePhone(body?.adminPhone ?? existing.adminPhone), updatedAt });
    return json({ id, updatedAt });
  } catch (error) {
    console.error("Menu function error", error);
    return json({ error: "Menü kaydedilemedi. Biraz sonra tekrar dene." }, 500);
  }
};
