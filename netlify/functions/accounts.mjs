import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

const accounts = () => getStore({ name: "masaqr-accounts", region: "eu-central-1" });
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Bu işlem desteklenmiyor." }, 405);
  try {
    const user = await getUser();
    if (!user) return json({ error: "Hesabına giriş yap." }, 401);
    const store = accounts();
    const key = `accounts/${user.id}`;
    const existing = await store.get(key, { type: "json" });
    const now = new Date().toISOString();
    await store.setJSON(key, {
      accountId: user.id,
      email: user.email || existing?.email || "",
      createdAt: existing?.createdAt || now,
      lastSeenAt: now,
    });
    return json({ ok: true });
  } catch (error) {
    console.error("Account registration error", error);
    return json({ error: "Hesap bilgisi kaydedilemedi." }, 500);
  }
};
