import { createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

const languages = new Set(["en", "de", "ar", "ru", "fr", "es"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(record, token) {
  if (typeof token !== "string" || token.length < 40 || !record?.ownerHash) return false;
  const supplied = Buffer.from(hash(token), "hex");
  const expected = Buffer.from(record.ownerHash, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export default async (request) => {
  if (request.method !== "POST") return reply({ error: "POST gerekli." }, 405);
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) return reply({ error: "Otomatik çeviri henüz etkin değil. Netlify ayarlarına GOOGLE_TRANSLATE_API_KEY ekle." }, 503);
  try {
    const { id, language } = await request.json();
    if (!/^[a-f0-9]{18}$/.test(id || "") || !languages.has(language)) return reply({ error: "Menü veya hedef dil geçersiz." }, 400);
    const store = getStore({ name: "masaqr-menus", region: "eu-central-1" });
    const record = await store.get(`menus/${id}`, { type: "json" });
    const user = await getUser();
    if (!user || (record?.accountId ? record.accountId !== user.id : !authorized(record, request.headers.get("x-owner-token")))) return reply({ error: "Bu menüyü çevirme yetkin yok." }, user ? 403 : 401);

    const data = record.data;
    const entries = [];
    const add = (path, value) => { if (typeof value === "string" && value.trim()) entries.push({ path, value }); };
    add(["brand", "name"], data.brand?.name);
    add(["brand", "intro"], data.brand?.intro);
    (data.categories || []).forEach((value, index) => add(["categories", index], value));
    (data.products || []).forEach((product, index) => {
      add(["products", index, "name"], product.name);
      add(["products", index, "description"], product.description);
      add(["products", index, "category"], product.category);
      add(["products", index, "allergens"], product.allergens);
    });

    const translated = { brand: {}, categories: [...(data.categories || [])], products: (data.products || []).map((product) => ({ id: product.id, name: product.name, description: product.description, category: product.category, allergens: product.allergens })) };
    for (let i = 0; i < entries.length;) {
      const batch = [];
      let size = 0;
      while (i < entries.length && batch.length < 128 && size + entries[i].value.length < 4500) {
        batch.push(entries[i++]);
        size += batch[batch.length - 1].value.length;
      }
      const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: batch.map((item) => item.value), source: "tr", target: language, format: "text" }),
      });
      const result = await response.json();
      if (!response.ok) return reply({ error: result?.error?.message || "Çeviri servisi şu an yanıt vermiyor." }, 502);
      const outputs = result?.data?.translations || [];
      if (outputs.length !== batch.length) return reply({ error: "Çeviri yanıtı eksik geldi. Tekrar dene." }, 502);
      batch.forEach((item, index) => {
        const [group, row, field] = item.path;
        if (group === "brand") translated.brand[row] = outputs[index].translatedText;
        else if (group === "categories") translated.categories[row] = outputs[index].translatedText;
        else translated.products[row][field] = outputs[index].translatedText;
      });
    }
    const translations = { ...(record.translations || {}), [language]: translated };
    await store.setJSON(`menus/${id}`, { ...record, translations, updatedAt: new Date().toISOString() });
    return reply({ language, translation: translated });
  } catch (error) {
    console.error("Translation error", error);
    return reply({ error: "Menü çevrilemedi. Biraz sonra tekrar dene." }, 500);
  }
};
