import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

const reply = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const hash = (value) => createHash("sha256").update(value).digest("hex");
function authorized(record, token) {
  if (typeof token !== "string" || token.length < 40 || !record?.ownerHash) return false;
  const a = Buffer.from(hash(token), "hex"), b = Buffer.from(record.ownerHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (request) => {
  const eventStore = getStore({ name: "masaqr-analytics", region: "eu-central-1" });
  const menuStore = getStore({ name: "masaqr-menus", region: "eu-central-1" });
  try {
    if (request.method === "POST") {
      const body = await request.json();
      if (!/^[a-f0-9]{18}$/.test(body.id || "") || !["menu_open", "category_view", "product_open", "language_select"].includes(body.type)) return reply({ error: "Geçersiz analitik olayı." }, 400);
      const allowed = (value) => typeof value === "string" ? value.slice(0, 80) : "";
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const hour = String(now.getUTCHours()).padStart(2, "0");
      const key = `events/${body.id}/${date}/${hour}/${randomUUID()}`;
      await eventStore.setJSON(key, { type: body.type, category: allowed(body.category), productId: allowed(body.productId), productName: allowed(body.productName), language: allowed(body.language), at: now.toISOString() });
      return reply({ ok: true }, 202);
    }

    if (request.method !== "GET") return reply({ error: "GET veya POST gerekli." }, 405);
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!/^[a-f0-9]{18}$/.test(id || "")) return reply({ error: "Menü bulunamadı." }, 404);
    const menu = await menuStore.get(`menus/${id}`, { type: "json" });
    const user = await getUser();
    if (!user || (menu?.accountId ? menu.accountId !== user.id : !authorized(menu, request.headers.get("x-owner-token")))) return reply({ error: "Analitiği görme yetkin yok." }, user ? 403 : 401);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const { blobs } = await eventStore.list({ prefix: `events/${id}/` });
    const events = [];
    for (let i = 0; i < blobs.length; i += 50) {
      const group = await Promise.all(blobs.slice(i, i + 50).map((blob) => eventStore.get(blob.key, { type: "json" })));
      group.forEach((event) => { if (event && Date.parse(event.at) >= cutoff) events.push(event); });
    }
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    const byDayHour = Array.from({ length: 7 }, (_, day) => ({ day, hours: Array(24).fill(0) }));
    const products = {}, categories = {}, languages = {};
    const types = { menu_open: 0, category_view: 0, product_open: 0, language_select: 0 };
    for (const event of events) {
      types[event.type] = (types[event.type] || 0) + 1;
      const date = new Date(event.at);
      // Store and render analytics in UTC so the hourly buckets match the
      // ISO date/hour used in the event keys and the panel label.
      const hour = date.getUTCHours();
      const day = (date.getUTCDay() + 6) % 7;
      byHour[hour].count++;
      byDayHour[day].hours[hour]++;
      if (event.productName) products[event.productName] = (products[event.productName] || 0) + 1;
      if (event.category) categories[event.category] = (categories[event.category] || 0) + 1;
      if (event.language) languages[event.language] = (languages[event.language] || 0) + 1;
    }
    return reply({ total: events.length, types, byHour, byDayHour, products: Object.entries(products).sort((a,b)=>b[1]-a[1]).slice(0,8), categories: Object.entries(categories).sort((a,b)=>b[1]-a[1]).slice(0,8), languages: Object.entries(languages).sort((a,b)=>b[1]-a[1]), updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Analytics error", error);
    return reply({ error: "Analitik yüklenemedi." }, 500);
  }
};
