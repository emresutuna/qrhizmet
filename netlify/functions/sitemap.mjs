import { getStore } from "@netlify/blobs";

export default async (request) => {
  const origin = "https://qrhizmet.site";
  const paths = ["/", "/fiyatlar.html", "/demo.html"];
  try {
    const store = getStore({ name: "masaqr-menus", region: "eu-central-1" });
    const { blobs } = await store.list({ prefix: "menus/" });
    for (const blob of blobs) {
      const id = blob.key.slice("menus/".length);
      if (/^[a-f0-9]{18}$/.test(id)) paths.push(`/menu.html?menu=${id}`);
    }
  } catch (error) {
    console.error("Sitemap menu listing failed", error);
  }
  const urls = paths.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};
