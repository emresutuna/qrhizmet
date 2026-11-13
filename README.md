# QRHizmeti

QRHizmeti, restoran, kuaför, oto yıkama ve yerel işletmeler için QR ile açılan ürün ve hizmet sayfaları oluşturur.

## Özellikler

- İşletme hesabı, marka adı ve logo yönetimi
- Kategori ve ürün/hizmet düzenleme
- Kampanya görselleri ve canlı QR sayfa önizlemesi
- QR bağlantısı ve indirilebilir QR kodu
- Restoranlar için kalori, gramaj ve alerjen alanları
- Netlify Identity ile hesap doğrulama, Netlify Functions ve Blobs ile kayıt
- Çok dilli içerik ve menü analitiği altyapısı

## Netlify dağıtımı

1. Depoyu Netlify'da **Import an existing project** ile bağlayın.
2. Netlify Identity'yi etkinleştirin ve kayıt politikasını işletme hesaplarının açılmasına uygun ayarlayın.
3. `qrhizmet.site` alan adını Netlify projesine ekleyip DNS kayıtlarını Netlify'ın verdiği değerlere göre yapılandırın.
4. İsteğe bağlı çeviri ve WhatsApp entegrasyonları için gerekli ortam değişkenlerini ekleyin.

Ayrıntılı yayınlama, alan adı, otomatik çeviri ve WhatsApp kurulumu için [NETLIFY_SETUP.md](NETLIFY_SETUP.md) dosyasına bakın.

## Yerel geliştirme

Gereksinim: Node.js 22 veya üzeri ve Netlify CLI.

```sh
npm install
npm run build
netlify dev
```

`netlify dev`, Identity ve Functions içeren akışları Netlify site bağlamında çalıştırmak için kullanılır.
