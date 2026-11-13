import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const json = (body, status = 200) => Response.json(body, { status });
const normalizePhone = (value = "") => String(value).replace(/\D/g, "");
const normalizeText = (value = "") => String(value).toLocaleLowerCase("tr").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const hash = (value) => createHash("sha256").update(value).digest("hex");

function validSignature(rawBody, signature) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  let supplied;
  try { supplied = Buffer.from(signature.slice(7), "hex"); } catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function sendText(to, body) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || "v27.0";
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
  });
  if (!response.ok) console.error("WhatsApp message send failed", response.status, await response.text());
}

async function findOwnerMenu(from) {
  const menus = getStore({ name: "masaqr-menus", region: "eu-central-1" });
  const { blobs } = await menus.list({ prefix: "menus/" });
  for (const blob of blobs) {
    const record = await menus.get(blob.key, { type: "json" });
    if (normalizePhone(record?.adminPhone) === from && from) return { id: blob.key.slice("menus/".length), record };
  }
  return null;
}

export default async (request) => {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge || "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const raw = Buffer.from(await request.arrayBuffer());
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) return json({ error: "Invalid webhook signature" }, 401);

  try {
    const payload = JSON.parse(raw.toString("utf8"));
    const entry = payload.entry?.[0];
    const messages = entry?.changes?.flatMap((change) => change.value?.messages || []) || [];
    const value = entry?.changes?.[0]?.value || {};
    const waId = value.metadata?.phone_number_id;
    const pendingStore = getStore({ name: "masaqr-whatsapp-pending", region: "eu-central-1" });
    const undoStore = getStore({ name: "masaqr-whatsapp-undo", region: "eu-central-1" });
    const processed = getStore({ name: "masaqr-whatsapp-processed", region: "eu-central-1" });

    for (const message of messages) {
      if (message.type !== "text" || !message.from || !message.id || !waId) continue;
      if (await processed.get(message.id)) continue;
      const from = normalizePhone(message.from);
      const owner = await findOwnerMenu(from);
      if (!owner) continue;
      const pendingKey = `pending/${owner.id}/${hash(from)}`;
      const undoKey = `undo/${owner.id}/${hash(from)}`;
      const text = String(message.text?.body || "").trim();
      const normalized = normalizeText(text);

      if (["iptal", "vazgec", "vaz gec"].includes(normalized)) {
        await pendingStore.delete(pendingKey);
        await sendText(message.from, "Bekleyen menü değişikliği iptal edildi.");
      } else if (["onayla", "evet", "tamam"].includes(normalized)) {
        const pending = await pendingStore.get(pendingKey, { type: "json" });
        if (!pending || pending.expiresAt < Date.now()) {
          await sendText(message.from, "Onaylanacak güncelleme bulamadım. Yeni bir fiyat komutu gönder.");
        } else {
          const menuStore = getStore({ name: "masaqr-menus", region: "eu-central-1" });
          const current = await menuStore.get(`menus/${owner.id}`, { type: "json" });
          const undo = [];
          for (const change of pending.changes) {
            const product = current.data.products.find((item) => item.id === change.productId);
            if (!product) continue;
            undo.push({ productId: product.id, price: product.price });
            product.price = change.newPrice;
          }
          await menuStore.setJSON(`menus/${owner.id}`, { ...current, updatedAt: new Date().toISOString() });
          await undoStore.setJSON(undoKey, { changes: undo, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
          await pendingStore.delete(pendingKey);
          await sendText(message.from, `✅ ${pending.changes.map((change) => `${change.name}: ₺${change.oldPrice} → ₺${change.newPrice}`).join("\n")} güncellendi. Menü QR sayfasına yansıdı.`);
        }
      } else if (["geri al", "gerial"].includes(normalized)) {
        const previous = await undoStore.get(undoKey, { type: "json" });
        if (!previous || previous.expiresAt < Date.now()) {
          await sendText(message.from, "Geri alınabilecek son güncelleme bulunamadı.");
        } else {
          const menuStore = getStore({ name: "masaqr-menus", region: "eu-central-1" });
          const current = await menuStore.get(`menus/${owner.id}`, { type: "json" });
          for (const change of previous.changes) {
            const product = current.data.products.find((item) => item.id === change.productId);
            if (product) product.price = change.price;
          }
          await menuStore.setJSON(`menus/${owner.id}`, { ...current, updatedAt: new Date().toISOString() });
          await undoStore.delete(undoKey);
          await sendText(message.from, "↶ Son fiyat güncellemesi geri alındı.");
        }
      } else {
        const amountMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:₺|tl)?\s*(?:yap)?\s*$/i);
        if (!amountMatch) {
          await sendText(message.from, "Örnek: Çay fiyatını 40 yap. Değişiklik önce onayına gelir.");
        } else {
          let productQuery = text.slice(0, amountMatch.index).trim().replace(/\s+fiyat(?:ı|i|ını|ini)?$/i, "").replace(/\s+fiyatını$/i, "").trim();
          const query = normalizeText(productQuery);
          const matches = owner.record.data.products.filter((item) => {
            const name = normalizeText(item.name);
            return name === normalizeText(productQuery) || name === query || name.startsWith(query + " ");
          });
          if (matches.length !== 1) {
            await sendText(message.from, matches.length ? "Bu adla birden fazla ürün buldum. Ürün adını biraz daha açık yaz." : "Ürünü bulamadım. Ürün adını menüde göründüğü gibi yaz. Örnek: Çay fiyatını 40 yap.");
          } else {
            const product = matches[0];
            const newPrice = Number(amountMatch[1].replace(",", "."));
            if (!Number.isFinite(newPrice) || newPrice < 0 || newPrice > 1000000) {
              await sendText(message.from, "Fiyatı kontrol et ve tekrar gönder.");
            } else {
              const pending = { changes: [{ productId: product.id, name: product.name, oldPrice: product.price, newPrice }], expiresAt: Date.now() + 10 * 60 * 1000 };
              await pendingStore.setJSON(pendingKey, pending);
              await sendText(message.from, `Önizleme:\n• ${product.name}: ₺${product.price} → ₺${newPrice}\n\nUygulamak için ONAYLA, vazgeçmek için İPTAL yaz. Bu önizleme 10 dakika geçerli.`);
            }
          }
        }
      }
      await processed.set(message.id, "1", { metadata: { processedAt: new Date().toISOString() } });
    }
    return json({ received: true });
  } catch (error) {
    console.error("WhatsApp webhook error", error);
    return json({ received: true });
  }
};
