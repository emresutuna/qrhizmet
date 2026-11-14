import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";

const menuStore = () => getStore({ name: "masaqr-menus", region: "eu-central-1" });
const accountStore = () => getStore({ name: "masaqr-accounts", region: "eu-central-1" });
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
const adminEmails = new Set((process.env.ADMIN_EMAILS || "emre.sutuna1998@gmail.com").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));

async function requireAdmin() {
  const user = await getUser();
  return user && adminEmails.has(String(user.email || "").toLowerCase()) ? user : null;
}

function menuSummary(id, record) {
  const data = record?.data || {};
  return {
    id,
    accountId: record?.accountId || "",
    email: record?.accountEmail || "",
    phone: record?.adminPhone || "",
    name: data.brand?.name || "İsimsiz işletme",
    type: data.brand?.type || "restaurant",
    productCount: Array.isArray(data.products) ? data.products.length : 0,
    status: record?.status || "approved",
    note: record?.adminNote || "",
    createdAt: record?.createdAt || record?.submittedAt || record?.updatedAt || "",
    submittedAt: record?.submittedAt || record?.updatedAt || "",
    updatedAt: record?.updatedAt || "",
  };
}

export default async (request) => {
  try {
    const admin = await requireAdmin();
    if (!admin) return json({ error: "Bu yönetim alanına erişim yetkin yok." }, 403);

    const url = new URL(request.url);
    const menus = menuStore();
    const id = url.searchParams.get("id");

    if (request.method === "GET" && id) {
      if (!/^[a-f0-9]{18}$/.test(id)) return json({ error: "Menü adresi geçersiz." }, 400);
      const record = await menus.get(`menus/${id}`, { type: "json" });
      if (!record?.data) return json({ error: "Menü bulunamadı." }, 404);
      const { ownerHash, ...safeRecord } = record;
      return json({ menu: menuSummary(id, record), record: safeRecord });
    }

    if (request.method === "GET") {
      const [accountList, menuList] = await Promise.all([
        accountStore().list({ prefix: "accounts/" }),
        menus.list({ prefix: "menus/" }),
      ]);
      const accountMap = new Map();
      accountMap.set(admin.id, { accountId: admin.id, email: admin.email || "", createdAt: "", lastSeenAt: new Date().toISOString() });
      for (const blob of accountList.blobs) {
        const account = await accountStore().get(blob.key, { type: "json" });
        if (account?.accountId) accountMap.set(account.accountId, account);
      }
      const menuRows = [];
      for (const blob of menuList.blobs) {
        const record = await menus.get(blob.key, { type: "json" });
        if (!record?.data) continue;
        const id = blob.key.slice("menus/".length);
        const summary = menuSummary(id, record);
        const account = accountMap.get(record.accountId);
        summary.email ||= account?.email || (record.accountId === admin.id ? admin.email || "" : "");
        summary.accountCreatedAt = account?.createdAt || "";
        summary.lastSeenAt = account?.lastSeenAt || "";
        menuRows.push(summary);
        if (record.accountId && !accountMap.has(record.accountId)) {
          accountMap.set(record.accountId, { accountId: record.accountId, email: summary.email, createdAt: summary.accountCreatedAt, lastSeenAt: summary.lastSeenAt });
        }
      }
      const accounts = [...accountMap.values()].map((account) => ({
        id: account.accountId,
        email: account.email || "E-posta kaydı yok",
        createdAt: account.createdAt || "",
        lastSeenAt: account.lastSeenAt || "",
        menus: menuRows.filter((menu) => menu.accountId === account.accountId),
      }));
      return json({ accounts, menus: menuRows, pendingCount: menuRows.filter((menu) => menu.status === "pending").length });
    }

    if (request.method === "PATCH") {
      if (!id || !/^[a-f0-9]{18}$/.test(id)) return json({ error: "Menü adresi geçersiz." }, 400);
      const body = await request.json();
      if (!["approved", "changes_requested"].includes(body?.status)) return json({ error: "Onay durumu geçersiz." }, 400);
      const record = await menus.get(`menus/${id}`, { type: "json" });
      if (!record?.data) return json({ error: "Menü bulunamadı." }, 404);
      const updatedAt = new Date().toISOString();
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
      await menus.setJSON(`menus/${id}`, {
        ...record,
        status: body.status,
        adminNote: body.status === "changes_requested" ? note : "",
        reviewedAt: updatedAt,
        reviewedBy: admin.email || "",
        updatedAt,
      });
      return json({ id, status: body.status, note: body.status === "changes_requested" ? note : "", updatedAt });
    }

    return json({ error: "Bu işlem desteklenmiyor." }, 405, { Allow: "GET, PATCH" });
  } catch (error) {
    console.error("Admin function error", error);
    return json({ error: "Yönetim işlemi tamamlanamadı." }, 500);
  }
};
