# Netlify yayına alma

## Deploy

1. Bu klasörü GitHub deposuna gönder ve Netlify'da **Add new site → Import an existing project** ile bağla.
2. Build ayarları `netlify.toml` içinde hazır: `npm run build`, yayın klasörü `dist`, Functions klasörü `netlify/functions`.
3. Deploy tamamlanınca Netlify projesinde **Identity → Enable Identity** yoluyla Identity’yi etkinleştir. **Identity → Registration** altında kayıt tercihini **Open** yap ki işletmeler kendi hesaplarını açabilsin. E-posta doğrulama açık kalır; doğrulama ve şifre yenileme e-postalarının gönderim ayarlarını **Identity → Emails** bölümünden kontrol et. Sonra `https://qrhizmet.site` üzerinden hesap kaydını dene.
4. Netlify → **Domain management → Add a domain** bölümünden `qrhizmet.site` alan adını projeye ekle. Domain sağlayıcısında Netlify’ın gösterdiği DNS kayıtlarını gir; Netlify alan adını doğrulayıp HTTPS sertifikasını etkinleştirince `https://qrhizmet.site` kullanılabilir.

Menüler `@netlify/blobs` üzerinde tutulur; deploy sırasında dosya sistemine yazılmaz ve yeni deploylarda kalır. İşletme hesabı Netlify Identity ile açılır; menü hesabın kimliğine bağlandığı için başka cihazdan giriş yapınca da yüklenir. Ödeme adımı yoktur.

## Yönetici paneli ve QR onayı

`yonetici.html` yönetici panelidir. Netlify Identity ile giriş yapıldıktan sonra API, e-posta adresini `ADMIN_EMAILS` ortam değişkenindeki virgülle ayrılmış yönetici listesiyle karşılaştırır. Netlify → Site configuration → Environment variables bölümüne `ADMIN_EMAILS` ekleyip yönetici e-posta adreslerini gir; değişkeni güncelledikten sonra deploy et. Kodda mevcut yönetici hesabı için geçici varsayılan `emre.sutuna1998@gmail.com` bulunur.

Yeni menüler onay beklerken QR görseli üretilebilir ancak public menü verisi gösterilmez. Yönetici panelinden **Onayla ve QR'ı aktifleştir** seçilince aynı QR bağlantısı açılır. **Düzenleme iste** seçeneği işletme panelinde nedeni gösterir; işletme tekrar gönderince menü yeniden onay kuyruğuna gelir. Mevcut, durumu kaydedilmemiş menüler eski bağlantılarını korumak için aktif kabul edilir.

## İşletme üyeliği

`hesap.html` kayıt ve giriş ekranıdır. Şifreyi bu uygulama saklamaz; Netlify Identity kayıt, oturum ve parola yenileme işlemlerini yönetir. `@netlify/identity` Functions tarafında hesabı doğrular; `menus` fonksiyonu menü düzenleme, oluşturma ve listelemeyi hesap sahibiyle sınırlar. QR menülerinin herkese açık GET adresi müşterilerin kullanımı için açık kalır. Eski, hesapsız menü aynı tarayıcıdaki düzenleme anahtarıyla ilk güncellemede hesaba bağlanabilir.

## Otomatik çeviri

Google Cloud projesinde Cloud Translation API'yi etkinleştir, bir API anahtarı oluştur ve Netlify → Site configuration → Environment variables bölümüne ekle:

| Değişken | Değer |
| --- | --- |
| `GOOGLE_TRANSLATE_API_KEY` | Google Cloud Translation API key; required for automatic translations when a guest selects English, Arabic, German, or French. |

Netlify'da değişkeni ekledikten sonra yeni deploy başlat. Misafir QR menüsünde İngilizce, Arapça, Almanca veya Fransızca seçtiğinde çeviri otomatik üretilip kaydedilir. İstersen işletme panelindeki çeviri alanından dilleri önceden hazırlayabilirsin. Google Cloud Translation kullanımı ücretlidir; anahtar yalnızca Function tarafında kalır.

## WhatsApp fiyat güncelleme

Meta Developers'ta WhatsApp Cloud API'yi kur, bir WhatsApp Business telefon numarası bağla ve uygulamada Webhooks için `messages` alanına abone ol. Webhook callback adresi:

`https://<site-adı>.netlify.app/.netlify/functions/whatsapp`

Netlify ortam değişkenleri:

| Değişken | Değer |
| --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Webhook kurulurken senin belirlediğin rastgele doğrulama metni |
| `WHATSAPP_APP_SECRET` | Meta uygulamasının App Secret değeri |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API erişim token'ı |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business telefon numarası ID'si |
| `WHATSAPP_GRAPH_API_VERSION` | İsteğe bağlı; varsayılan `v27.0` |

Webhook'u Meta tarafında doğrularken yukarıdaki callback adresini ve `WHATSAPP_VERIFY_TOKEN` değerini gir. Menü panelindeki **WhatsApp fiyat güncelleme yetkili numarası** alanına ülke koduyla yalnızca rakamlardan oluşan yetkili numarayı yaz; menüyü QR ile yeniden yayımla. Yetkili numaradan örneğin `Çay fiyatını 40 yap` mesajı gönderilir. Bot değişikliği önce önizleme olarak yollar; `ONAYLA`, `İPTAL` ve son güncelleme için `GERİ AL` komutları desteklenir.

WhatsApp yanıtları Meta'nın mesajlaşma penceresi ve hesap kurallarına tabidir. API token'ı, App Secret ve Google API anahtarı HTML'e veya GitHub deposuna eklenmemelidir.

## Arama motorları

Ana sayfada sayfa başlığı, açıklama, Open Graph etiketleri ve yapılandırılmış yazılım bilgisi bulunur. `/robots.txt` tüm herkese açık sayfaların taranmasına izin verir; `/sitemap.xml` ana sayfa, demo ve yayımlanmış QR menülerini listeler. İşletme ve yönetici panelleri `noindex` olarak işaretlenmiştir. Onaylanmış her menü, örneğin `/menu.html?menu=<menü-id>` adresinden taranabilir.

`qrhizmet.site` Google Search Console'a alan adı mülkü olarak ekle, DNS doğrulamasını tamamla ve `https://qrhizmet.site/sitemap.xml` adresini gönder. Google'ın sonuçlara eklemesi zaman alabilir. `robots.txt` ve sitemap bu alan adını kanonik adres olarak kullanır.

## Yerel geliştirme notu

Blobs ve Functions yerel ortamda test edilecekse Node.js 22 ve Netlify CLI gerekir; `netlify dev` ile bağlı Netlify site bağlamında çalıştır. `npm run build` yalnızca dağıtım dosyalarını `dist` içine kopyalar. Canlı kayıt için Netlify deploy'u ve ortam değişkenleri gereklidir.
