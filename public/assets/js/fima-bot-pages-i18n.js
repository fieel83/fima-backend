(() => {
  "use strict";

  const common = {
    "İçeriğe geç": "Skip to content",
    "FIMA Bot ürün menüsü": "FIMA Bot product menu",
    "FIMA Bot ana sayfası": "FIMA Bot home",
    "Dil / Language": "Language / Dil",
    "Arayüz dili": "Interface language",
    "Ürün": "Product",
    "Komutlar": "Commands",
    "Başvurular": "Applications",
    "Destek": "Support",
    "Gizlilik": "Privacy",
    "Güvenlik": "Security",
    "Alt menü": "Footer navigation"
  };

  const pages = {
    commands: {
      metadata: {
        tr: { title: "Komutlar | FIMA Bot", description: "FIMA Bot komutlarını kullanım amacı, yetki düzeyi ve sunucu şablonuna göre keşfet." },
        en: { title: "Commands | FIMA Bot", description: "Explore FIMA Bot commands by purpose, permission level and server template." }
      },
      translations: {
        ...common,
        "FIMA BOT / KOMUT REHBERİ": "FIMA BOT / COMMAND GUIDE",
        "Doğru komutu": "Find the right command",
        "hemen bul.": "right away.",
        "Üyelere açık araçlardan yetkili ekip iş akışlarına kadar komutları ara. Görebilmen, komutu kullanmaya yetkili olduğun anlamına gelmez; FIMA Bot her istekte sunucu rolünü ve kanal kapsamını yeniden doğrular.": "Search commands from member-facing tools to authorized staff workflows. Seeing a command does not mean you may use it; FIMA Bot revalidates the server role and channel scope for every request.",
        "FIMA Bot’u ekle": "Add FIMA Bot",
        "Sunucunu yönet": "Manage your server",
        "Komut kataloğu": "Command catalog",
        "Kullanılabilir komutlar sunucu şablonuna, etkin modüllere ve görevlinin yetkisine göre değişir.": "Available commands vary by server template, enabled modules and staff permissions.",
        "Komutlarda ara": "Search commands",
        "Komut veya özellik ara…": "Search for a command or feature…",
        "Komut kategorileri": "Command categories",
        "Tümü": "All", "Üye": "Member", "Ekip": "Staff", "Rekabetçi": "Competitive",
        "Yetki her çalıştırmada kontrol edilir.": "Permissions are checked on every run.",
        "Yönetim komutları gizli bir istemci anahtarına güvenmez; sunucu, rol, kanal ve modül sınırları backend tarafından doğrulanır.": "Administrative commands do not rely on a secret client key; server, role, channel and module boundaries are validated by the backend.",
        "ÜYE": "MEMBER", "EKİP": "STAFF",
        "Kullanıcının erişebildiği güvenli komutları ve ilgili rehberleri gösterir.": "Shows the safe commands and related guides available to the user.",
        "Tüm şablonlar": "All templates", "Üye güvenli": "Member-safe",
        "Yapılandırılmış destek alanında kullanıcıya özel bir destek talebi açar.": "Opens a user-specific support request in the configured support area.",
        "Topluluk": "Community",
        "Sunucunun açtığı staff, support, video team ve diğer uygun başvuru türlerinden birini başlatır.": "Starts one of the staff, support, video team or other eligible application types enabled by the server.",
        "Şablona özel": "Template-specific",
        "Destek talebini yetkili görevliye atar ve işlemi denetim kaydına ekler.": "Assigns the support request to an authorized staff member and adds the action to the audit log.",
        "Ticket yetkisi": "Ticket permission", "Kayıtlı işlem": "Logged action",
        "Talebi kapatmadan önce redakte edilmiş transcript akışını tamamlar.": "Completes the redacted transcript workflow before closing the request.",
        "Denetlenebilir": "Auditable",
        "Sunucu politikasına göre yapılandırılmış ve denetlenebilir bir uyarı kaydı oluşturur.": "Creates a structured, auditable warning record under the server policy.",
        "Rol kontrollü": "Role-controlled",
        "Clan ve TSBTR şablonlarında doğrulanmış oyuncu profili oluşturma akışını başlatır.": "Starts the verified player-profile workflow in Clan and TSBTR templates.",
        "Uygun bir rakiple denetlenebilir challenge talebi ve özel işlem alanı oluşturur.": "Creates an auditable challenge request and private workspace with an eligible opponent.",
        "Kanal kapsamlı": "Channel-scoped",
        "Yetkili host için aktif eğitim duyurusu ve katılım akışını başlatır.": "Starts an active training announcement and participation flow for an authorized host.",
        "Host yetkisi": "Host permission",
        "Bu aramayla eşleşen komut bulunamadı.": "No commands match this search.",
        "© FIMA · Güvenli Discord operasyonları": "© FIMA · Secure Discord operations"
      }
    },
    invite: {
      metadata: {
        tr: { title: "Discord’a Ekle | FIMA Bot", description: "FIMA Bot’u Discord sunucuna güvenli ve kontrollü biçimde ekle." },
        en: { title: "Add to Discord | FIMA Bot", description: "Add FIMA Bot to your Discord server securely and with clear controls." }
      },
      translations: {
        ...common,
        "FIMA BOT / GÜVENLİ KURULUM": "FIMA BOT / SECURE SETUP",
        "Sunucunu seç.": "Choose your server.", "Kontrol sende kalsın.": "Stay in control.",
        "Discord’a geçmeden önce kurulum adımlarını ve istenen erişimi burada görebilirsin. FIMA hiçbir zaman senden bot tokeni, parola, 2FA kodu veya security key bilgisi istemez.": "Review the setup steps and requested access here before continuing to Discord. FIMA will never ask for your bot token, password, 2FA code or security-key information.",
        "Discord’da doğrula": "Verify in Discord", "Yönetme yetkin olan sunuculardan hedefi seç.": "Choose the target from servers you are allowed to manage.",
        "Erişimi incele": "Review access", "Discord’un gösterdiği izin özetini onaylamadan önce kontrol et.": "Check Discord's permission summary before approving it.",
        "Dashboard’a dön": "Return to Dashboard", "Kurulumdan sonra sunucunu FIMA Bot merkezinden aç.": "Open your server in the FIMA Bot center after setup.",
        "Discord kurulum bağlantısı şu anda hazır değil. Daha sonra yeniden dene veya FIMA desteğe ulaş.": "The Discord setup link is not available right now. Try again later or contact FIMA support.",
        "Discord uygulaması · Resmî kurulum": "Discord application · Official setup", "Kurulum özeti": "Setup summary",
        "Sunucu seçimi Discord’un kendi ekranında yapılır.": "Server selection takes place on Discord's own screen.",
        "Bot ve slash komutları birlikte kurulur.": "The bot and slash commands are installed together.",
        "Kurulumdan sonra erişimi Discord ayarlarından kaldırabilirsin.": "You can remove access from Discord settings after setup.",
        "Discord’a devam et": "Continue to Discord",
        "Devam ettiğinde Discord’un resmî yetkilendirme sayfasına gidersin. Son onay yalnızca orada verilir.": "Continuing takes you to Discord's official authorization page. Final approval is given only there.",
        "← Sunucu merkezine dön": "← Return to server center",
        "© FIMA · Kontrollü Discord kurulumu": "© FIMA · Controlled Discord setup"
      }
    },
    premium: {
      metadata: {
        tr: { title: "Planlar | FIMA Bot", description: "FIMA Bot planlarını, modül kapsamlarını ve güvenlik sınırlarını karşılaştır." },
        en: { title: "Plans | FIMA Bot", description: "Compare FIMA Bot plans, module coverage and security boundaries." }
      },
      translations: {
        ...common,
        "FIMA BOT / PLANLAR": "FIMA BOT / PLANS", "İhtiyacın kadar güç.": "Power that fits your needs.", "Aynı güvenlik sınırı.": "The same security boundary.",
        "Her plan sunucuya özel yetki kontrolü, güvenli OAuth ve denetim kaydıyla çalışır. Ücretli planların herkese açık satışı henüz başlamadı; bu sayfa mevcut kapsamı şeffaf biçimde karşılaştırır.": "Every plan uses server-specific permission checks, secure OAuth and audit logging. Public sales of paid plans have not started; this page transparently compares the current scope.",
        "Mevcut planını gör": "View your current plan", "Plan hakkında sor": "Ask about a plan",
        "Sunucuna göre ölçeklen": "Scale for your server",
        "Plan yükseltmesi yalnız doğrulanmış FIMA hesabı ve açık kullanıcı onayıyla başlatılır. Bu sayfa ödeme veya abonelik oluşturmaz.": "A plan upgrade starts only with a verified FIMA account and explicit user approval. This page does not create a payment or subscription.",
        "Başlangıç": "Starter", "Topluluğunu güvenli temel araçlarla çalıştır.": "Run your community with secure essential tools.",
        "Temel ticket akışları": "Essential ticket workflows", "Başvuru kataloğu": "Application catalog", "Sunucuya özel dashboard özeti": "Server-specific dashboard summary", "Yetki ve kanal kontrolleri": "Permission and channel checks", "Botu ekle": "Add the bot",
        "PRO · YAKINDA": "PRO · COMING SOON", "Büyüyen ekipler": "Growing teams", "Daha yoğun operasyonlar için genişletilmiş otomasyon ve raporlama.": "Expanded automation and reporting for busier operations.",
        "Gelişmiş ekip iş akışları": "Advanced staff workflows", "Uzun dönem operasyon özeti": "Long-term operations summary", "Ek yapılandırma alanları": "Additional configuration controls", "Öncelikli destek kuyruğu": "Priority support queue", "İlgi bildir": "Register interest",
        "NETWORK · PLANLANIYOR": "NETWORK · PLANNED", "Çoklu sunucu": "Multi-server", "Birden fazla topluluğu tek politika altında yöneten ekipler için.": "For teams managing multiple communities under one policy.",
        "Sunucular arası görünürlük": "Cross-server visibility", "Merkezi politika şablonları": "Central policy templates", "Gelişmiş denetim dışa aktarımı": "Advanced audit export", "Kuruma özel onboarding": "Organization-specific onboarding", "Henüz kullanılamıyor": "Not available yet",
        "FIMA Bot plan özellikleri karşılaştırması": "FIMA Bot plan feature comparison", "Özellik": "Feature",
        "Sunucuya özel yetki doğrulaması": "Server-specific permission verification", "Dahil": "Included", "Temel ticket ve başvuru akışları": "Essential ticket and application workflows", "Gelişmiş operasyon raporları": "Advanced operations reports", "Özet": "Summary", "Planlanıyor": "Planned", "Çoklu sunucu politikası": "Multi-server policy",
        "© FIMA · Plan durumu dashboard’dan doğrulanır": "© FIMA · Plan status is verified in the Dashboard"
      }
    },
    feedback: {
      metadata: {
        tr: { title: "Destek ve Geri Bildirim | FIMA Bot", description: "FIMA Bot için doğru destek, geri bildirim ve güvenlik kanalını seç." },
        en: { title: "Support and Feedback | FIMA Bot", description: "Choose the right support, feedback or security channel for FIMA Bot." }
      },
      translations: {
        ...common,
        "FIMA BOT / DESTEK": "FIMA BOT / SUPPORT", "Sorunu doğru ekibe": "Send the issue to the right team", "güvenle ulaştır.": "securely.",
        "Hesap, bot kurulumu, başvuru veya güvenlik bildirimi için uygun yolu seç. Mesajına token, parola, 2FA kodu, ödeme bilgisi ya da özel Discord daveti ekleme.": "Choose the appropriate route for account, bot setup, application or security reports. Do not include a token, password, 2FA code, payment information or private Discord invite in your message.",
        "FIMA destek merkezini aç": "Open FIMA support center", "Önce komutlara bak": "Check commands first", "Doğru yolu seç": "Choose the right route",
        "Her talep yalnız gerekli bilgiyle ve ilgili ekibin erişebileceği kapsamda işlenir.": "Every request is handled with only the necessary information and within the relevant team's access scope.",
        "Kurulum ve kullanım desteği": "Setup and usage support", "Botu ekleme, komutlar, modüller ve dashboard erişimiyle ilgili sorunlar.": "Issues with adding the bot, commands, modules and Dashboard access.", "Destek aç": "Open support request",
        "Topluluk başvuruları": "Community applications", "Helper ile sınırlı değildir: staff, moderator, support, video team, developer ve açık iş ortaklığı türlerini içerir.": "Not limited to Helper: includes staff, moderator, support, video team, developer and open partnership types.", "Türleri gör": "View types",
        "Ürün fikri veya hata bildirimi": "Product idea or bug report", "Beklenen davranışı, gerçekleşen sonucu ve mümkünse gizli bilgi içermeyen ekran görüntüsünü paylaş.": "Share the expected behavior, actual result and, if possible, a screenshot without confidential information.", "Geri bildirim ver": "Send feedback",
        "Güvenlik bildirimi": "Security report", "Hassas bir açığı herkese açık kanalda paylaşma; destek merkezinde güvenlik kategorisini seç.": "Do not share a sensitive vulnerability in a public channel; select the security category in the support center.", "Güvenlik yolunu aç": "Open security route",
        "Göndermeden önce": "Before sending", "Etkilenen sunucunun adını yaz; gizli davet veya token ekleme.": "Provide the affected server's name; do not include a private invite or token.", "Ne beklediğini ve ne olduğunu kısa adımlarla açıkla.": "Describe what you expected and what happened in short steps.", "Varsa yaklaşık saat ve görünen hata kodunu ekle.": "Include the approximate time and visible error code, if any.", "Hesap, ödeme veya lisans bilgilerini yalnız maskeli göster.": "Show account, payment or license information only in masked form.",
        "Asla paylaşma:": "Never share:", "bot tokenı, API anahtarı, parola, 2FA kodu, session cookie veya security key parolası.": "bot token, API key, password, 2FA code, session cookie or security-key password.",
        "© FIMA · Gizlilik odaklı destek": "© FIMA · Privacy-focused support"
      }
    }
  };

  const surface = document.body?.dataset.fimaSurface;
  const config = pages[surface];
  if (!config || typeof window.FimaSurfaceI18n?.mount !== "function") return;
  window.FimaSurfaceI18n.mount({ sourceLocale: "tr", translations: config.translations, metadata: config.metadata });
})();
