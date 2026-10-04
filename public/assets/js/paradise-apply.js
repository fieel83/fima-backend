(() => {
  "use strict";

  const surfaceI18n = window.FimaSurfaceI18n?.mount({
    sourceLocale: "tr",
    translations: {
      "← Tüm başvuru türlerini gör": "← View all application types",
      "Başvuru rota özeti": "Application route summary",
      "İnceleme": "Review",
      "Özel Discord kuyruğu": "Private Discord queue",
      "Gönderim": "Submission",
      "Manuel karar · otomatik rol yok": "Manual decision · no automatic role",
      "Topluluk operasyonunda sorumluluk al ve ekipler arası günlük akışı destekle.": "Take responsibility for community operations and support daily coordination between teams.",
      "Üye sorunlarını anlaşılır, sabırlı ve güvenli bir destek akışıyla çöz.": "Resolve member issues through clear, patient and safe support.",
      "Eğitimleri planla, sun ve katılımcıların gelişimini takip et.": "Plan and deliver training, and track participant progress.",
      "Topluluk etkinliklerini planla, yürüt ve güvenli katılımı destekle.": "Plan and run community events, and support safe participation.",
      "Çekilişleri şeffaf kurallarla ve doğrulanabilir sonuçlarla yönet.": "Manage giveaways with transparent rules and verifiable results.",
      "FIMA ürünleri ve topluluğu için özgün, yararlı içerikler üret.": "Create original, useful content for FIMA products and the community.",
      "Banner, thumbnail, etkinlik görselleri ve FIMA tasarım dilini geliştir.": "Develop banners, thumbnails, event visuals and the FIMA design language.",
      "FIMA ürünleri için güvenli, test edilebilir yazılım katkıları öner.": "Propose secure, testable software contributions to FIMA products.",
      "FIMA ekosistemi kullanıcılarına ürün odaklı teknik destek sun.": "Provide product-focused technical support to FIMA ecosystem users.",
      "FIMA Macro kullanıcılarının kurulum ve kullanım süreçlerini destekle.": "Help FIMA Macro users install and use the product.",
      "FFlag taleplerini güvenlik, uyumluluk ve açıklık sınırlarıyla değerlendir.": "Review FFlag requests for safety, compatibility and clarity.",
      "Sunucu, ürün veya kampanya için ölçülebilir ve karşılıklı değer sunan ortaklık öner.": "Propose a partnership that offers measurable, mutual value for a server, product or campaign.",
      "İçerik, video, yaratıcı tasarım veya geliştirme iş birliğini FIMA ile buluştur.": "Bring your content, video, creative design or development collaboration to FIMA.",
      "Net sahiplik, tanıtım ve hesap güvenliği sınırlarıyla ticari iş birliği öner.": "Propose a business collaboration with clear ownership, promotion and account-security boundaries.",
      "Ayrı başvuru sayfaları": "Dedicated application pages",
      "Katkı alanını doğrudan seç": "Choose how you want to contribute",
      "Her pozisyon kendi kalıcı bağlantısıyla açılır. FIMA hesabı ve Discord doğrulaması tamamlandığında seçimin formda korunur.": "Each position has its own permanent link. Your selection stays in the form after FIMA account and Discord verification.",
      "Topluluk desteği": "Community support",
      "Yeni üyelere rehberlik et, soruları çöz ve güvenli topluluk deneyimini destekle.": "Guide new members, answer questions and support a safe community experience.",
      "Helper başvurusunu aç →": "Open Helper application →",
      "Güven ve düzen": "Trust and order",
      "Kuralları tutarlı uygula, olayları kanıtla değerlendir ve topluluğu koru.": "Apply rules consistently, review incidents using evidence and protect the community.",
      "Moderator başvurusunu aç →": "Open Moderator application →",
      "Video üretimi": "Video production",
      "FIMA yayınları, kısa videolar ve topluluk anları için güçlü hikâyeler üret.": "Create compelling stories for FIMA streams, short videos and community moments.",
      "Video Team başvurusunu aç →": "Open Video Team application →",
      "Görsel kimlik": "Visual identity",
      "Banner, thumbnail, etkinlik görselleri ve FIMA tasarım dilini birlikte geliştir.": "Help develop banners, thumbnails, event visuals and the FIMA design language.",
      "Creative Team başvurusunu aç →": "Open Creative Team application →",
      "İçeriğe geç": "Skip to content",
      "FIMA ana sayfa": "FIMA home page",
      "Başvuru merkezi": "Application Center",
      "Başvuru": "Apply",
      "Destek": "Support",
      "Arayüz dili": "Interface language",
      "FIMA Hesabı": "FIMA Account",
      "Doğrulanmış website-first başvuru": "Verified website-first applications",
      "FIMA'ya katıl.": "Join FIMA.",
      "İz bırak.": "Make an impact.",
      "Community, Partnership, Creator / Media ve Reseller / Affiliate başvurularını tek güvenli merkezde hazırla. Clan ve Competitive / TSBTR ailelerini katalogda incele; public başvuru yalnız doğrulanmış açık rotalarda kullanılabilir. Hesabını ve Discord üyeliğini doğrula, taslağını sakla ve kararı özel Discord inceleme kuyruğundan takip et.": "Prepare Community, Partnership, Creator / Media and Reseller / Affiliate applications in one secure center. Explore Clan and Competitive / TSBTR families in the catalog; public applications are available only on verified open routes. Verify your account and Discord membership, save your draft and follow the decision through the private Discord review queue.",
      "Başvuru özeti": "Application summary",
      "5–10 dakika": "5–10 minutes",
      "Otomatik taslak": "Automatic draft",
      "Yalnız özel staff incelemesi": "Private staff review only",
      "Başvuru güvenceleri": "Application safeguards",
      "Güvenli başvuru rotası": "Secure application route",
      "STAFF + BUSINESS · AÇIK": "STAFF + BUSINESS · OPEN",
      "Doğrulanmış açık rotalar": "Verified open routes",
      "Community ve Business türleri public incelemeye açılabilir; Clan ile Competitive aileleri özel sunucu akışı kurulana kadar kapalıdır.": "Community and Business types may be opened for public review; Clan and Competitive families remain closed until a private server workflow is configured.",
      "Özel inceleme": "Private review",
      "Cevapların genel kanallarda veya herkese açık sayfalarda görünmez.": "Your answers never appear in public channels or public pages.",
      "Güvenli kanıt": "Secure evidence",
      "Dosya türü, boyutu ve gerçek imzası sunucuda yeniden doğrulanır.": "File type, size and true signature are verified again on the server.",
      "Başvuru aşamaları": "Application stages",
      "Hesabını doğrula": "Verify your account",
      "FIMA + Discord + sunucu üyeliği": "FIMA + Discord + server membership",
      "Başvurunu hazırla": "Prepare your application",
      "Cevap, zorunlu kanıt ve FIMA hesabı taslağı": "Answers, required evidence and FIMA account draft",
      "Gözden geçir ve onayla": "Review and confirm",
      "Sunucu, cevap ve kanıt metadata özeti": "Server, answers and evidence metadata summary",
      "Discord incelemesi": "Discord review",
      "Private ticket ve staff kararı": "Private ticket and staff decision",
      "Başvuru kataloğu": "Application catalog",
      "Tek bir rolden fazlası: altı ayrı katkı ailesi": "More than one role: six contribution families",
      "FIMA başvuru aileleri": "FIMA application families",
      "Public review": "Public review",
      "Community operasyonu, moderasyon, eğitim, etkinlik, içerik, video, yaratıcı tasarım, geliştirme veya FIMA ürün desteği için başvur. Her rota manuel ve özel incelemeden geçer.": "Apply for community operations, moderation, training, events, content creation, video production, creative design, development or FIMA product support. Every route receives a private manual review.",
      "Community rollerini keşfet": "Explore Community roles",
      "Private setup": "Private setup",
      "Clan operasyon, destek, eğitim ve savaş rolleri katalogda görünür; doğrulanmış özel sunucu akışı açılana kadar public website başvurusu kabul edilmez.": "Clan operations, support, training and war roles remain visible in the catalog; public website applications are not accepted until a verified private server workflow is opened.",
      "Public başvuru kapalı": "Public applications closed",
      "Moderasyon, hakemlik, etkinlik ve medya rolleri planlama için görünür; doğrulanmış sunucuya özel akış kurulana kadar public başvuru kapalıdır.": "Moderation, referee, event and media roles remain visible for planning; public applications stay closed until a verified server-specific workflow is configured.",
      "Sunucu, ürün veya kampanya için ölçülebilir ve karşılıklı değer sunan ortaklık önerileri.": "Partnership proposals that offer measurable, mutual value for a server, product or campaign.",
      "Ortaklık öner": "Propose a partnership",
      "Content, Video, Creative ve Development collaboration çalışmalarını Creator rotasında sun.": "Submit Content, Video, Creative and Development collaborations through the Creator route.",
      "Creator rotasını aç": "Open the Creator route",
      "Net sahiplik, tanıtım ve hesap güvenliği sınırlarıyla reseller veya affiliate ilişkisi.": "Reseller or affiliate relationships with clear ownership, promotion and account-security boundaries.",
      "Reseller rotasını aç": "Open the Reseller route",
      "Seçim ve inceleme politikası:": "Selection and review policy:",
      "Community’de Helper, Staff, Moderator, Support, Training Hoster, Event, Giveaway, Content Creator, Video Team, Creative Team, Developer ve ürün destek başvuruları açılabilir. Clan ile Competitive / TSBTR public akışta kapalıdır. Helper dahil hiçbir rol otomatik verilmez. Seçilebilir türler doğrulanmış sunucu politikasının": "Community may open Helper, Staff, Moderator, Support, Training Hoster, Event, Giveaway, Content Creator, Video Team, Creative Team, Developer and product-support applications. Clan and Competitive / TSBTR remain closed in the public workflow. No role, including Helper, is granted automatically. Selectable types come from the verified server policy's",
      "listesinden gelir ve bütün website / Discord başvuruları aynı özel Discord inceleme kuyruğuna gönderilir.": "list, and all website / Discord applications are sent to the same private Discord review queue.",
      "Erişim kapısı": "Access gate",
      "Gönderim kilidi": "Submission lock",
      "Form açılmadan önce bu üç güvenlik kontrolünün doğrulanması gerekir.": "These three security checks must pass before the form opens.",
      "Bu sayfa hiçbir zaman Discord şifresi veya ödeme bilgisi istemez.": "This page never asks for a Discord password or payment information.",
      "FIMA oturumu kontrol ediliyor…": "Checking FIMA session…",
      "Discord bağlantısı kontrol ediliyor…": "Checking Discord connection…",
      "Sunucu üyeliği kontrol ediliyor…": "Checking server membership…",
      "FIMA ile giriş yap": "Sign in with FIMA",
      "Discord bağla": "Connect Discord",
      "Discord sunucusuna katıl": "Join Discord server",
      "FIMA hiçbir zaman Discord şifreni istemez. Bağlantı resmi Discord OAuth ekranında tamamlanır ve başvuruda ödeme bilgisi alınmaz.": "FIMA never asks for your Discord password. Connection is completed on the official Discord OAuth screen and no payment information is collected in applications.",
      "Başvuru akışı": "Application workflow",
      "Başvurunu hazırla": "Prepare your application",
      "Cevapların FIMA hesabında güvenli taslak olarak saklanır; kanıt dosyaları taslağa eklenmez.": "Your answers are stored as a secure draft in your FIMA account; evidence files are never added to drafts.",
      "Form hazırlanıyor": "Preparing form",
      "Başvuru tamamlama": "Application completion",
      "Discord sunucusu": "Discord server",
      "Uygun sunucular yükleniyor…": "Loading eligible servers…",
      "Yalnızca üyesi olduğun ve FIMA botunun kurulu olduğu sunucular gösterilir.": "Only servers you belong to and where FIMA Bot is installed are shown.",
      "Pozisyon / başvuru türü": "Position / application type",
      "Önce sunucu seç": "Select a server first",
      "Açık türler doğrulanmış sunucu politikasının izin verdiği role göre belirlenir.": "Open types are determined by the roles permitted by the verified server policy.",
      "Açık rotalar": "Open routes",
      "Bu sunucudaki doğrulanmış başvurular": "Verified applications on this server",
      "Community; Helper, Staff, Moderator, Support, Training Hoster, Event, Giveaway, Content Creator, Video Team, Developer ve ürün destek rollerini açabilir. Clan ve Competitive / TSBTR public akışta kapalıdır. Business akışı Partnership, Creator / Media ve Reseller / Affiliate seçeneklerini açabilir.": "Community may open Helper, Staff, Moderator, Support, Training Hoster, Event, Giveaway, Content Creator, Video Team, Developer and product-support roles. Clan and Competitive / TSBTR remain closed in the public workflow. The Business workflow may open Partnership, Creator / Media and Reseller / Affiliate options.",
      "Sunucunu seçtiğinde yalnızca o sunucunun açtığı başvuru rotaları burada görünecek.": "After choosing a server, only the application routes enabled by that server will appear here.",
      "Kanıt dosyası güvenliği": "Evidence file security",
      "PNG, JPEG veya WebP görselleri isteğe bağlıdır. Tarama yapılamayan dosyalar güvenli kabul edilmez ve karantinaya alınır.": "PNG, JPEG or WebP images are optional. Files that cannot be scanned are not considered safe and are quarantined.",
      "Başvuruyu Discord inceleme kuyruğuna gönder": "Send application to Discord review queue",
      "İptal": "Cancel",
      "Başvurular özel staff kanalında incelenir. Şifre, token, cookie, tam lisans anahtarı, ödeme kartı veya özel hesap verisi yazma.": "Applications are reviewed in a private staff channel. Never enter passwords, tokens, cookies, full license keys, payment-card details or private account data.",
      "İş ortaklığı başvurunu hazırla": "Prepare your business application",
      "Topluluk başvurunu hazırla": "Prepare your community application",
      "İş birliği türü": "Collaboration type",
      "Başvuru pozisyonu": "Application position",
      "Göndermeye hazır": "Ready to submit",
      "Başvuru rolünü seç": "Select an application role",
      "Sunucu ve rol seç": "Select server and role",
      "Zorunlu görsel kanıt": "Required visual evidence",
      "İsteğe bağlı görsel kanıt": "Optional visual evidence",
      "GEREKLİ": "REQUIRED",
      "OPSİYONEL": "OPTIONAL",
      "Görsel kanıt ekle": "Add visual evidence",
      "PNG, JPG veya WebP seç": "Choose PNG, JPG or WebP",
      "Dosyalar taslağa kaydedilmez. Şifre, token, cookie, lisans anahtarı veya özel hesap verisi yükleme.": "Files are never saved to drafts. Do not upload passwords, tokens, cookies, license keys or private account data.",
      "FIMA hesabı bağlı": "FIMA account connected",
      "Discord hesabı bağlı": "Discord account connected",
      "FIMA kurulu uygun bir sunucuda üyelik bulunamadı": "No membership found in an eligible server with FIMA installed",
      "FIMA hesabına giriş gerekli": "FIMA account sign-in required",
      "Girişten sonra Discord bağlantısı kontrol edilir": "Discord connection will be checked after sign-in",
      "Önce FIMA hesabına giriş yap. Ardından Discord hesabını bağlayıp sunucu üyeliğini doğrulayacağız.": "Sign in to your FIMA account first. Then connect Discord and we will verify your server membership.",
      "Başvuruyu gözden geçir": "Review application",
      "Bekleniyor": "Waiting",
      "Discord hesabını bağlamalısın": "Connect your Discord account",
      "Discord bağlantısı bekleniyor": "Waiting for Discord connection",
      "Başvurun ve kanıt dosyaların doğrulanıyor…": "Validating your application and evidence files…",
      "Taslak temizlendi; başvuru kaydı sunucuda tutuluyor.": "Draft cleared; the application record remains on the server.",
      "Yerel taslak alanına erişilemedi; cevapların FIMA hesabınla eşitlenmeye çalışılıyor.": "Local draft storage is unavailable; we are still trying to sync your answers with your FIMA account.",
      "Başka bir cihazdaki daha yeni FIMA taslağı geri yüklendi; kanıt dosyalarını yeniden seçmelisin.": "A newer FIMA draft from another device was restored; select your evidence files again.",
      "FIMA hesabı taslak eşitlemesi şu anda kullanılamıyor; yerel kopya korunuyor ve başvuru göndermeyi engellemiyor.": "FIMA account draft sync is currently unavailable; the local copy is preserved and does not block submission.",
      "Cevapların FIMA hesabında güvenli taslak olarak saklanır; kanıt dosyaları saklanmaz.": "Your answers are stored as a secure draft in your FIMA account; evidence files are not stored.",
      "Yerel taslak geri yüklendi; FIMA hesabı eşitlemesi yeniden denenecek. Kanıt dosyaları saklanmaz.": "The local draft was restored; FIMA account sync will be retried. Evidence files are not stored.",
      "FIMA hesabı taslak eşitlemesi şu anda kullanılamıyor; yazdığın cevaplar bu cihazda geçici olarak korunacak.": "FIMA account draft sync is currently unavailable; your answers will be kept temporarily on this device.",
      "Cevapların FIMA hesabında güvenli taslak olarak saklanır; kanıt dosyaları hiçbir taslağa eklenmez.": "Your answers are stored as a secure draft in your FIMA account; evidence files are never added to any draft.",
      "Zorunlu görsel kanıt alanlarından en az biri boş.": "At least one required visual-evidence field is empty.",
      "Kanıt dosyası yalnızca PNG, JPG/JPEG veya WebP olabilir.": "Evidence files must be PNG, JPG/JPEG or WebP.",
      "başvurular kapalı": "applications closed",
      "aktif blacklist kaydı": "active blocklist record",
      "İş birliği türü seç": "Select a collaboration type",
      "Pozisyon seç": "Select a position",
      "Önce Discord sunucusuna katıl": "Join the Discord server first",
      "Sunucu seç": "Select a server",
      "Başvuru göndermek için Discord hesabını FIMA hesabına bağla.": "Connect your Discord account to your FIMA account to submit an application.",
      "Başvuru servisi şu anda yüklenemedi. Biraz sonra tekrar dene.": "The application service could not be loaded. Try again shortly.",
      "Özel Discord inceleme kuyruğuna gönderildi.": "Sent to the private Discord review queue.",
      "Bu akışta zaten incelemede olan bir başvurun var.": "You already have an application under review in this workflow.",
      "Başvuru bekleme süren henüz bitmedi.": "Your application cooldown has not ended yet.",
      "Seçilen Discord sunucusunda üye olmalısın.": "You must be a member of the selected Discord server.",
      "Özel Discord inceleme bileti şu anda açılamıyor. Başvurun kaydedilmedi; lütfen daha sonra tekrar dene.": "A private Discord review ticket cannot be opened right now. Your application was not saved; try again later.",
      "Bu sunucuda başvurular şu anda kapalı.": "Applications are currently closed on this server.",
      "Aktif blacklist kaydı olan kullanıcılar başvuramaz.": "Users with an active blocklist record cannot apply.",
      "Bir cevabın istenen uzunluğa uymuyor.": "One of your answers does not meet the required length.",
      "Bu başvuru türü seçilen akışta kullanılamıyor.": "This application type is unavailable in the selected workflow.",
      "Toplam kanıt dosyası sınırı aşıldı.": "The total evidence-file limit was exceeded.",
      "Kanıt dosyalarından biri geçersiz.": "One of the evidence files is invalid.",
      "Bir kanıt dosyası geçersiz bir soruya bağlandı.": "An evidence file was attached to an invalid question.",
      "Yalnızca PNG, JPEG ve WebP kanıt dosyaları kabul edilir.": "Only PNG, JPEG and WebP evidence files are accepted.",
      "Bir kanıt dosyası güvenli biçimde okunamadı.": "An evidence file could not be read safely.",
      "Bir kanıt dosyası boyut sınırını aşıyor veya boş.": "An evidence file exceeds the size limit or is empty.",
      "Bir kanıt dosyasının uzantısı, MIME türü ve gerçek imzası eşleşmiyor.": "An evidence file's extension, MIME type and true signature do not match.",
      "Bir soru için en fazla iki kanıt dosyası yüklenebilir.": "At most two evidence files may be uploaded for one question.",
      "Kanıt dosyalarının toplam boyutu sınırı aşıyor.": "The total size limit for evidence files was exceeded.",
      "Bir kanıt dosyası tarayıcı tarafından okunamadı.": "An evidence file could not be read by the browser.",
      "Kanıt dosyalarını belirtilen sınırlara göre yeniden seç.": "Select the evidence files again within the stated limits.",
      "Başvuru gönderilemedi. Alanları kontrol edip tekrar dene.": "The application could not be submitted. Check the fields and try again."
    },
    patterns: [
      { match: /^(.+) · doğrulanmış başvuru rotası$/u, replace: match => `${match[1]} · verified application route` },
      { match: /^(.+) başvurusu$/u, replace: match => `${match[1]} application` },
      { match: /^(.+) başvurunu hazırla$/u, replace: match => `Prepare your ${match[1]} application` },
      { match: /^(.+) rotası (.+) için açık\. Soruları tamamlayarak başvurunu hazırlayabilirsin\.$/u, replace: match => `${match[1]} applications are open for ${match[2]}. Complete the questions to prepare your application.` },
      { match: /^(.+) rolü (.+) için etkin değil\. Başka bir doğrulanmış sunucu seç veya başvuru merkezinden açık olan başka bir rolü seç\.$/u, replace: match => `The ${match[1]} role is not enabled for ${match[2]}. Choose another verified server or an open role from the application center.` },
      { match: /^(\d+)\/(\d+) zorunlu adım hazır$/u, replace: match => `${match[1]}/${match[2]} required steps ready` },
      { match: /^(\d+) soru · özel Discord incelemesi$/u, replace: match => `${match[1]} questions · private Discord review` },
      { match: /^(\d+) uygun sunucuda üyelik doğrulandı$/u, replace: match => `Membership verified in ${match[1]} eligible server${match[1] === "1" ? "" : "s"}` },
      { match: /^(\d+) dosya · (\d+) KiB$/u, replace: match => `${match[1]} file${match[1] === "1" ? "" : "s"} · ${match[2]} KiB` },
      { match: /^(\d+)–(\d+) karakter$/u, replace: match => `${match[1]}–${match[2]} characters` },
      { match: /^Her soru için en fazla (\d+) kanıt dosyası seçebilirsin\.$/u, replace: match => `You may choose at most ${match[1]} evidence files per question.` },
      { match: /^Her kanıt dosyası en fazla (\d+) KiB olabilir\.$/u, replace: match => `Each evidence file may be at most ${match[1]} KiB.` },
      { match: /^Toplam en fazla (\d+) kanıt dosyası seçebilirsin\.$/u, replace: match => `You may choose at most ${match[1]} evidence files in total.` },
      { match: /^Kanıt dosyalarının toplamı en fazla (\d+) KiB olabilir\.$/u, replace: match => `Evidence files may total at most ${match[1]} KiB.` },
      { match: /^aktif (.+) başvurusu$/u, replace: match => `active ${match[1]} application` },
      { match: /^bekleme süresi (.+)$/u, replace: match => `cooldown until ${match[1]}` },
      { match: /^Taslak kaydedildi · (.+)\. FIMA hesabınla eşitleniyor; kanıt dosyaları saklanmaz\.$/u, replace: match => `Draft saved · ${match[1]}. Syncing with your FIMA account; evidence files are not stored.` },
      { match: /^Taslak FIMA hesabına kaydedildi · (.+)\. Kanıt dosyaları saklanmaz\.$/u, replace: match => `Draft saved to your FIMA account · ${match[1]}. Evidence files are not stored.` },
      { match: /^FIMA taslağı geri yüklendi · (.+)\. Kanıt dosyalarını yeniden seçmelisin\.$/u, replace: match => `FIMA draft restored · ${match[1]}. Select evidence files again.` },
      { match: /^Yerel taslak geri yüklendi · (.+)\. FIMA hesabınla eşitleniyor; kanıt dosyaları saklanmaz\.$/u, replace: match => `Local draft restored · ${match[1]}. Syncing with your FIMA account; evidence files are not stored.` },
      { match: /^Sorulara göre isteğe bağlı veya zorunlu PNG, JPEG ya da WebP: soru başına (\d+), toplam (\d+) dosya; dosya başına (\d+) KiB\. Tarama yapılamayan dosyalar güvenli kabul edilmez, incelemeye eklenmez ve karantinaya alınır\.$/u, replace: match => `Optional or required PNG, JPEG or WebP depending on the question: ${match[1]} per question, ${match[2]} files total, ${match[3]} KiB per file. Files that cannot be scanned are not considered safe, are excluded from review and are quarantined.` },
      { match: /^Başvurun alındı: (.+) · #([^\.]+)\. Özel Discord inceleme kuyruğuna gönderildi\.(?: Kanıt: (\d+) taranıp kabul edildi, (\d+) karantinaya alındı\.)?$/u, replace: match => `Application received: ${match[1]} · #${match[2]}. Sent to the private Discord review queue.${match[3] ? ` Evidence: ${match[3]} scanned and accepted, ${match[4]} quarantined.` : ""}` }
    ],
    metadata: {
      tr: {
        title: "FIMA Başvuru Merkezi",
        description: "FIMA Community ve Business başvurularını güvenli, özel Discord inceleme akışıyla hazırla."
      },
      en: {
        title: "FIMA Application Center",
        description: "Prepare FIMA Community and Business applications through a secure, private Discord review workflow."
      }
    }
  });
  const activeLocale = () => surfaceI18n?.getLanguage() === "en" ? "en-US" : "tr-TR";

  const loopbackHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(window.location.hostname);
  const defaultApiBase = loopbackHost ? window.location.origin : "https://api.fimamacro.com";
  const apiBase = String(window.FIMA_API_BASE_URL || defaultApiBase).replace(/\/+$/, "");
  const query = new URLSearchParams(window.location.search);
  const applicationRoutes = Object.freeze({
    "/fima-bot/apply/helper": Object.freeze({ type: "helper", workflow: "staff", label: "Helper", family: "Community", description: "Yeni üyelere rehberlik et, soruları çöz ve güvenli topluluk deneyimini destekle." }),
    "/fima-bot/apply/staff": Object.freeze({ type: "staff", workflow: "staff", label: "Staff", family: "Community", description: "Topluluk operasyonunda sorumluluk al ve ekipler arası günlük akışı destekle." }),
    "/fima-bot/apply/moderator": Object.freeze({ type: "moderator", workflow: "staff", label: "Moderator", family: "Community", description: "Kuralları tutarlı uygula, olayları kanıtla değerlendir ve topluluğu koru." }),
    "/fima-bot/apply/support": Object.freeze({ type: "support", workflow: "staff", label: "Support", family: "Community", description: "Üye sorunlarını anlaşılır, sabırlı ve güvenli bir destek akışıyla çöz." }),
    "/fima-bot/apply/training-hoster": Object.freeze({ type: "training_hoster", workflow: "staff", label: "Training Hoster", family: "Community", description: "Eğitimleri planla, sun ve katılımcıların gelişimini takip et." }),
    "/fima-bot/apply/event-staff": Object.freeze({ type: "event_staff", workflow: "staff", label: "Event Staff", family: "Community", description: "Topluluk etkinliklerini planla, yürüt ve güvenli katılımı destekle." }),
    "/fima-bot/apply/giveaway-staff": Object.freeze({ type: "giveaway_staff", workflow: "staff", label: "Giveaway Staff", family: "Community", description: "Çekilişleri şeffaf kurallarla ve doğrulanabilir sonuçlarla yönet." }),
    "/fima-bot/apply/content-creator": Object.freeze({ type: "content_creator", workflow: "staff", label: "Content Creator", family: "Media", description: "FIMA ürünleri ve topluluğu için özgün, yararlı içerikler üret." }),
    "/fima-bot/apply/video-team": Object.freeze({ type: "video_team", workflow: "staff", label: "Video Team", family: "Media", description: "FIMA yayınları, kısa videolar ve topluluk anları için güçlü hikâyeler üret." }),
    "/fima-bot/apply/creative-team": Object.freeze({ type: "creative_team", workflow: "staff", label: "Creative Team", family: "Media", description: "Banner, thumbnail, etkinlik görselleri ve FIMA tasarım dilini geliştir." }),
    "/fima-bot/apply/developer": Object.freeze({ type: "developer", workflow: "staff", label: "Developer", family: "Product", description: "FIMA ürünleri için güvenli, test edilebilir yazılım katkıları öner." }),
    "/fima-bot/apply/fima-support": Object.freeze({ type: "fima_support", workflow: "staff", label: "FIMA Support", family: "Product", description: "FIMA ekosistemi kullanıcılarına ürün odaklı teknik destek sun." }),
    "/fima-bot/apply/macro-staff": Object.freeze({ type: "macro_staff", workflow: "staff", label: "Macro Staff", family: "Product", description: "FIMA Macro kullanıcılarının kurulum ve kullanım süreçlerini destekle." }),
    "/fima-bot/apply/fflag-staff": Object.freeze({ type: "fflag_staff", workflow: "staff", label: "FFlag Staff", family: "Product", description: "FFlag taleplerini güvenlik, uyumluluk ve açıklık sınırlarıyla değerlendir." }),
    "/fima-bot/apply/partnership": Object.freeze({ type: "partnership", workflow: "business", label: "Partnership", family: "Business", description: "Sunucu, ürün veya kampanya için ölçülebilir ve karşılıklı değer sunan ortaklık öner." }),
    "/fima-bot/apply/creator": Object.freeze({ type: "creator", workflow: "business", label: "Creator / Media Partner", family: "Business", description: "İçerik, video, yaratıcı tasarım veya geliştirme iş birliğini FIMA ile buluştur." }),
    "/fima-bot/apply/reseller": Object.freeze({ type: "reseller", workflow: "business", label: "Reseller / Affiliate", family: "Business", description: "Net sahiplik, tanıtım ve hesap güvenliği sınırlarıyla ticari iş birliği öner." })
  });
  const pathnameRoute = applicationRoutes[window.location.pathname] || null;
  document.body.dataset.applicationPage = pathnameRoute ? "detail" : "catalog";
  const requestedWorkflow = String(
    pathnameRoute?.workflow || (query.has("workflow") ? query.get("workflow") : "staff")
  ).trim().toLowerCase();
  const workflow = ["staff", "business"].includes(requestedWorkflow) ? requestedWorkflow : "staff";
  const routeDefaultType = pathnameRoute?.workflow === workflow ? pathnameRoute.type : "";
  const defaultType = routeDefaultType || (workflow === "business" ? "partnership" : "");
  const requestedType = String(pathnameRoute?.type || (query.has("type") ? query.get("type") : defaultType)).trim().toLowerCase();
  const preferredType = /^[a-z][a-z0-9_]{0,47}$/.test(requestedType) ? requestedType : defaultType;
  const allowedEvidenceExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const defaultEvidencePolicy = Object.freeze({
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    maxPerQuestion: 2,
    maxFiles: 4,
    maxFileBytes: 160 * 1024,
    maxTotalBytes: 480 * 1024,
    scannerUnavailableAction: "quarantine"
  });

  const byId = id => document.getElementById(id);
  const form = byId("applicationForm");
  if (!form) return;
  const guildSelect = byId("guildSelect");
  const typeSelect = byId("typeSelect");
  const typeCards = byId("typeCards");
  const typeCardsEmpty = byId("typeCardsEmpty");
  const fields = byId("questionFields");
  const submitButton = byId("submitButton");
  const notice = byId("notice");
  const applicationRouteStatus = byId("applicationRouteStatus");
  const draftState = byId("draftState");
  const evidencePolicyText = byId("evidencePolicyText");
  const progressText = byId("applicationProgressText");
  const progressPercent = byId("applicationProgressPercent");
  const progressBar = byId("applicationProgressBar");
  const progressTrack = progressBar?.parentElement || null;
  const reviewPanel = byId("applicationReviewPanel");
  const reviewGuildName = byId("reviewGuildName");
  const reviewApplicationType = byId("reviewApplicationType");
  const reviewAnswers = byId("reviewAnswers");
  const reviewEvidence = byId("reviewEvidence");
  const reviewEditButton = byId("reviewEditButton");
  const confirmSubmitButton = byId("confirmSubmitButton");
  const journeySteps = {
    verify: byId("journeyVerify"),
    prepare: byId("journeyPrepare"),
    review: byId("journeyReview")
  };
  let contexts = [];
  let csrfToken = "";
  let evidencePolicy = { ...defaultEvidencePolicy };
  let draftTimer = null;
  let serverDraftTimer = null;
  let draftSyncSerial = 0;
  let serverDraftRevision = 0;
  let volatileDraft = null;
  let submissionPending = false;

  const applicationQuery = new URLSearchParams({ workflow });
  if (preferredType) applicationQuery.set("type", preferredType);
  const applicationBasePath = pathnameRoute ? window.location.pathname : "/fima-bot/apply";
  const applicationPath = `${applicationBasePath}?${applicationQuery.toString()}`;
  byId("loginLink").href = `/login?returnTo=${encodeURIComponent(applicationPath)}`;
  byId("discordLink").href = `${apiBase}/auth/discord/start?returnTo=${encodeURIComponent(applicationPath)}`;
  document.querySelectorAll("[data-application-route]").forEach(link => {
    const active = link.dataset.applicationRoute === preferredType
      && link.dataset.applicationWorkflow === workflow;
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  const activeWorkflowId = workflow === "business" ? "businessWorkflow" : "staffWorkflow";
  document.querySelectorAll(".workflow-tab").forEach(tab => {
    const active = tab.id === activeWorkflowId;
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  if (pathnameRoute) {
    byId("applicationRouteBreadcrumb").textContent = pathnameRoute.label;
    byId("applicationRouteFamily").textContent = `${pathnameRoute.family} · doğrulanmış başvuru rotası`;
    byId("applicationRouteTitle").textContent = `${pathnameRoute.label} başvurusu`;
    byId("applicationRouteDescription").textContent = pathnameRoute.description;
    updateRouteTitle();
  }
  byId("formTitle").textContent = workflow === "business"
    ? `${pathnameRoute?.label || "İş ortaklığı"} başvurunu hazırla`
    : `${pathnameRoute?.label || "Topluluk"} başvurunu hazırla`;
  typeSelect.closest(".field").querySelector("label").textContent = workflow === "business"
    ? "İş birliği türü"
    : "Başvuru pozisyonu";

  function updateProgress() {
    const context = selectedContext();
    const type = selectedType();
    const answerInputs = [...fields.querySelectorAll("[data-answer-key]")];
    const requiredEvidence = evidenceInputs().filter(input => input.dataset.evidenceRequired === "true");
    const total = 2 + (type?.questions?.length || 0) + requiredEvidence.length;
    let completed = Number(Boolean(guildSelect.value)) + Number(Boolean(typeSelect.value));

    completed += answerInputs.filter(input => {
      const minimum = Number(input.minLength || 0);
      return input.value.trim().length >= minimum;
    }).length;
    completed += requiredEvidence.filter(input => input.files.length > 0).length;

    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    const label = percent === 100
      ? "Göndermeye hazır"
      : type
        ? `${completed}/${total} zorunlu adım hazır`
        : guildSelect.value
          ? "Başvuru rolünü seç"
          : "Sunucu ve rol seç";

    if (progressText) progressText.textContent = label;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(percent));
    const ready = Boolean(
      context
      && !disabledContextReason(context)
      && type
      && completed === total
      && form.checkValidity()
      && validateEvidenceSelection({ quiet: true })
    );
    submitButton.disabled = submissionPending || !ready;
  }

  function setStatus(id, text, state = "") {
    const node = byId(id);
    node.textContent = text;
    node.className = `status-chip ${state}`;
  }

  function setJourneyStage(stage) {
    const order = ["verify", "prepare", "review"];
    const activeIndex = Math.max(0, order.indexOf(stage));
    order.forEach((key, index) => {
      const node = journeySteps[key];
      if (!node) return;
      node.classList.toggle("complete", index < activeIndex);
      node.classList.toggle("active", index === activeIndex);
      node.setAttribute("aria-current", index === activeIndex ? "step" : "false");
    });
  }

  function showNotice(text, kind = "") {
    notice.textContent = text;
    notice.className = `notice ${kind}`;
  }

  function hideNotice() {
    notice.textContent = "";
    notice.className = "notice hidden";
  }

  async function jsonFetch(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      cache: "no-store",
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(body.error || "request_failed"), {
        status: response.status,
        body
      });
    }
    return body;
  }

  async function getCsrf() {
    if (csrfToken) return csrfToken;
    const data = await jsonFetch("/api/csrf-token");
    csrfToken = data.csrfToken || data.token || "";
    return csrfToken;
  }

  function selectedContext() {
    return contexts.find(item => item.guildId === guildSelect.value) || null;
  }

  function selectedType() {
    return selectedContext()?.types.find(item => item.type === typeSelect.value) || null;
  }

  function draftScope() {
    if (!guildSelect.value || !typeSelect.value) return null;
    return {
      workflow,
      guildId: guildSelect.value,
      type: typeSelect.value
    };
  }

  function draftKey(scope = draftScope()) {
    if (!scope) return "";
    return `fima.paradise.application.v3:${scope.workflow}:${scope.guildId}:${scope.type}`;
  }

  function validDraft(value, scope = draftScope()) {
    return Boolean(
      scope
      && value
      && typeof value === "object"
      && value.workflow === scope.workflow
      && value.guildId === scope.guildId
      && value.type === scope.type
      && value.answers
      && typeof value.answers === "object"
      && !Array.isArray(value.answers)
    );
  }

  function readDraft(scope = draftScope()) {
    const key = draftKey(scope);
    if (!key) return null;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (validDraft(value, scope)) return value;
    } catch {
      // The authenticated server copy and the in-memory fallback remain available.
    }
    return validDraft(volatileDraft, scope) ? volatileDraft : null;
  }

  function currentAnswers() {
    return Object.fromEntries(
      [...fields.querySelectorAll("[data-answer-key]")]
        .map(input => [input.dataset.answerKey, input.value])
    );
  }

  function createLocalDraft() {
    const scope = draftScope();
    if (!scope) return null;
    return {
      ...scope,
      answers: currentAnswers(),
      revision: serverDraftRevision,
      updatedAt: new Date().toISOString()
    };
  }

  function writeLocalDraft(draft, { announce = false } = {}) {
    const key = draftKey(draft);
    const scope = draft && typeof draft === "object"
      ? { workflow: draft.workflow, guildId: draft.guildId, type: draft.type }
      : null;
    if (!key || !validDraft(draft, scope)) return false;
    volatileDraft = draft;
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      if (!announce) return true;
      draftState.textContent = `Taslak kaydedildi · ${new Date().toLocaleTimeString(activeLocale(), {
        hour: "2-digit",
        minute: "2-digit"
      })}. FIMA hesabınla eşitleniyor; kanıt dosyaları saklanmaz.`;
      return true;
    } catch {
      if (announce) draftState.textContent = "Yerel taslak alanına erişilemedi; cevapların FIMA hesabınla eşitlenmeye çalışılıyor.";
      return false;
    }
  }

  function saveLocalDraft({ announce = true } = {}) {
    const draft = createLocalDraft();
    if (!draft) return null;
    writeLocalDraft(draft, { announce });
    return draft;
  }

  function draftTime(value) {
    const timestamp = Date.parse(value?.updatedAt || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function newestDraft(localDraft, serverDraft) {
    if (!localDraft) return serverDraft || null;
    if (!serverDraft) return localDraft;
    const localTime = draftTime(localDraft);
    const serverTime = draftTime(serverDraft);
    if (localTime !== serverTime) return localTime > serverTime ? localDraft : serverDraft;
    return Number(serverDraft.revision || 0) >= Number(localDraft.revision || 0) ? serverDraft : localDraft;
  }

  function applyDraftAnswers(draft) {
    if (!validDraft(draft)) return;
    for (const input of fields.querySelectorAll("[data-answer-key]")) {
      input.value = String(draft.answers?.[input.dataset.answerKey] || "");
      const counter = input.closest(".question-field")?.querySelector(".question-counter");
      if (counter) updateCounter(input, counter);
    }
    updateProgress();
  }

  async function saveServerDraft(localDraft, { retryOnConflict = true } = {}) {
    const scope = draftScope();
    const key = draftKey(scope);
    if (!scope || !validDraft(localDraft, scope)) return null;
    try {
      const token = await getCsrf();
      const result = await jsonFetch("/api/fima-bot/applications/draft", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-fima-csrf": token
        },
        body: JSON.stringify({
          ...scope,
          answers: localDraft.answers,
          expectedRevision: serverDraftRevision
        })
      });
      if (draftKey() !== key || !validDraft(result?.draft, scope)) return null;
      serverDraftRevision = Number(result.draft.revision || 0);
      writeLocalDraft(result.draft);
      draftState.textContent = `Taslak FIMA hesabına kaydedildi · ${new Date(result.draft.updatedAt).toLocaleTimeString(activeLocale(), {
        hour: "2-digit",
        minute: "2-digit"
      })}. Kanıt dosyaları saklanmaz.`;
      return result.draft;
    } catch (error) {
      if (draftKey() !== key) return null;
      const current = error.status === 409 && validDraft(error.body?.draft, scope) ? error.body.draft : null;
      if (current) {
        serverDraftRevision = Number(current.revision || 0);
        const winner = newestDraft(localDraft, current);
        if (winner === localDraft && retryOnConflict) {
          return saveServerDraft(localDraft, { retryOnConflict: false });
        }
        applyDraftAnswers(current);
        writeLocalDraft(current);
        draftState.textContent = "Başka bir cihazdaki daha yeni FIMA taslağı geri yüklendi; kanıt dosyalarını yeniden seçmelisin.";
        return current;
      }
      draftState.textContent = "FIMA hesabı taslak eşitlemesi şu anda kullanılamıyor; yerel kopya korunuyor ve başvuru göndermeyi engellemiyor.";
      return null;
    }
  }

  async function syncServerDraft(localDraft) {
    const scope = draftScope();
    const key = draftKey(scope);
    if (!scope) return;
    const serial = ++draftSyncSerial;
    try {
      const query = new URLSearchParams(scope);
      const result = await jsonFetch(`/api/fima-bot/applications/draft?${query.toString()}`);
      if (serial !== draftSyncSerial || draftKey() !== key) return;
      const serverDraft = validDraft(result?.draft, scope) ? result.draft : null;
      serverDraftRevision = Number(serverDraft?.revision || 0);
      const winner = newestDraft(localDraft, serverDraft);
      if (!winner) {
        draftState.textContent = "Cevapların FIMA hesabında güvenli taslak olarak saklanır; kanıt dosyaları saklanmaz.";
        return;
      }
      applyDraftAnswers(winner);
      writeLocalDraft(winner);
      if (winner === localDraft && draftTime(localDraft) > draftTime(serverDraft)) {
        await saveServerDraft(localDraft);
        return;
      }
      const savedAt = new Date(winner.updatedAt).toLocaleString(activeLocale());
      draftState.textContent = `FIMA taslağı geri yüklendi · ${savedAt}. Kanıt dosyalarını yeniden seçmelisin.`;
    } catch {
      if (serial !== draftSyncSerial || draftKey() !== key) return;
      draftState.textContent = localDraft
        ? "Yerel taslak geri yüklendi; FIMA hesabı eşitlemesi yeniden denenecek. Kanıt dosyaları saklanmaz."
        : "FIMA hesabı taslak eşitlemesi şu anda kullanılamıyor; yazdığın cevaplar bu cihazda geçici olarak korunacak.";
    }
  }

  function scheduleDraftSave() {
    window.clearTimeout(draftTimer);
    window.clearTimeout(serverDraftTimer);
    draftTimer = window.setTimeout(() => saveLocalDraft(), 250);
    serverDraftTimer = window.setTimeout(() => {
      const localDraft = readDraft();
      if (localDraft) void saveServerDraft(localDraft);
    }, 1200);
  }

  function resetDraftSyncScope() {
    window.clearTimeout(draftTimer);
    window.clearTimeout(serverDraftTimer);
    draftTimer = null;
    serverDraftTimer = null;
    draftSyncSerial += 1;
    serverDraftRevision = 0;
  }

  async function clearDraft(token = "") {
    const scope = draftScope();
    const key = draftKey(scope);
    if (!scope || !key) return;
    window.clearTimeout(draftTimer);
    window.clearTimeout(serverDraftTimer);
    draftSyncSerial += 1;
    serverDraftRevision = 0;
    volatileDraft = null;
    try {
      localStorage.removeItem(key);
    } catch {
      // Private browsing can deny storage access. Submission has already succeeded.
    }
    try {
      const csrf = token || await getCsrf();
      await jsonFetch("/api/fima-bot/applications/draft", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-fima-csrf": csrf
        },
        body: JSON.stringify(scope)
      });
    } catch {
      // The submit endpoint also performs authoritative cleanup after private review is queued.
    }
  }

  function updateCounter(input, counter) {
    counter.textContent = `${input.value.length}/${input.maxLength}`;
  }

  function closeReview() {
    reviewPanel?.classList.add("hidden");
    submitButton.hidden = false;
    updateProgress();
  }

  function appendReviewItem(container, label, value) {
    const item = document.createElement("li");
    const heading = document.createElement("strong");
    heading.textContent = `${label}: `;
    item.append(heading, document.createTextNode(value));
    container.append(item);
  }

  function openReview() {
    const context = selectedContext();
    const type = selectedType();
    if (!context || !type || !form.reportValidity() || !validateEvidenceSelection()) {
      updateProgress();
      return false;
    }

    reviewGuildName.textContent = context.guildName || context.guildId;
    reviewApplicationType.textContent = type.label || type.type;
    reviewAnswers.replaceChildren();
    for (const question of type.questions || []) {
      const answer = fields.querySelector(`[data-answer-key="${question.key}"]`)?.value.trim() || "—";
      appendReviewItem(reviewAnswers, question.label || question.key, answer);
    }
    reviewEvidence.replaceChildren();
    const evidence = selectedEvidenceFiles();
    if (!evidence.length) {
      const empty = document.createElement("li");
      empty.textContent = "No evidence files selected.";
      reviewEvidence.append(empty);
    } else {
      for (const entry of evidence) {
        const question = type.questions?.find(item => item.key === entry.questionKey);
        appendReviewItem(reviewEvidence, question?.label || entry.questionKey, `${entry.file.name} (${Math.ceil(entry.file.size / 1024)} KiB)`);
      }
    }
    showNotice("");
    reviewPanel?.classList.remove("hidden");
    submitButton.hidden = true;
    reviewPanel?.focus();
    return true;
  }

  function extensionOf(name) {
    const normalized = String(name || "").normalize("NFKC").toLowerCase();
    const index = normalized.lastIndexOf(".");
    return index >= 0 ? normalized.slice(index) : "";
  }

  function evidenceInputs() {
    return [...fields.querySelectorAll('input[type="file"][data-question-key]')];
  }

  function selectedEvidenceFiles() {
    return evidenceInputs().flatMap(input => [...input.files].map(file => ({
      input,
      questionKey: input.dataset.questionKey,
      file
    })));
  }

  function validateEvidenceSelection({ quiet = false, skipRequired = false } = {}) {
    let totalBytes = 0;
    let totalFiles = 0;
    const allowedMimeTypes = new Set(evidencePolicy.allowedMimeTypes || defaultEvidencePolicy.allowedMimeTypes);
    for (const input of evidenceInputs()) {
      const files = [...input.files];
      if (!skipRequired && input.dataset.evidenceRequired === "true" && files.length < 1) {
        if (!quiet) showNotice("Zorunlu görsel kanıt alanlarından en az biri boş.", "error");
        input.focus();
        return false;
      }
      if (files.length > evidencePolicy.maxPerQuestion) {
        if (!quiet) showNotice(`Her soru için en fazla ${evidencePolicy.maxPerQuestion} kanıt dosyası seçebilirsin.`, "error");
        input.value = "";
        return false;
      }
      for (const file of files) {
        totalFiles += 1;
        totalBytes += file.size;
        if (!allowedMimeTypes.has(file.type) || !allowedEvidenceExtensions.has(extensionOf(file.name))) {
          if (!quiet) showNotice("Kanıt dosyası yalnızca PNG, JPG/JPEG veya WebP olabilir.", "error");
          input.value = "";
          return false;
        }
        if (file.size < 1 || file.size > evidencePolicy.maxFileBytes) {
          if (!quiet) showNotice(`Her kanıt dosyası en fazla ${Math.floor(evidencePolicy.maxFileBytes / 1024)} KiB olabilir.`, "error");
          input.value = "";
          return false;
        }
      }
    }
    if (totalFiles > evidencePolicy.maxFiles) {
      if (!quiet) showNotice(`Toplam en fazla ${evidencePolicy.maxFiles} kanıt dosyası seçebilirsin.`, "error");
      return false;
    }
    if (totalBytes > evidencePolicy.maxTotalBytes) {
      if (!quiet) showNotice(`Kanıt dosyalarının toplamı en fazla ${Math.floor(evidencePolicy.maxTotalBytes / 1024)} KiB olabilir.`, "error");
      return false;
    }
    if (!quiet) hideNotice();
    return true;
  }

  function updateEvidenceList(input) {
    const list = input.parentElement.querySelector(".evidence-list");
    const summary = input.parentElement.querySelector(".evidence-summary");
    list.replaceChildren();
    let totalBytes = 0;
    for (const file of input.files) {
      totalBytes += file.size;
      const item = document.createElement("span");
      item.textContent = `${file.name} · ${Math.ceil(file.size / 1024)} KiB`;
      list.append(item);
    }
    if (summary) {
      summary.textContent = input.files.length
        ? `${input.files.length} dosya · ${Math.ceil(totalBytes / 1024)} KiB`
        : "PNG, JPG veya WebP seç";
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("evidence_read_failed"));
      reader.readAsDataURL(file);
    });
  }

  async function collectEvidence() {
    if (!validateEvidenceSelection()) throw new Error("invalid_evidence_selection");
    const entries = selectedEvidenceFiles();
    return Promise.all(entries.map(async ({ questionKey, file }) => ({
      questionKey,
      name: file.name,
      mimeType: file.type,
      data: await readFileAsDataUrl(file)
    })));
  }

  function disabledContextReason(context) {
    if (!context.applicationsOpen) return "başvurular kapalı";
    if (context.blacklisted) return "aktif blacklist kaydı";
    if (context.activeApplication) return `aktif ${context.activeApplication.label} başvurusu`;
    if (context.cooldownUntil) return `bekleme süresi ${new Date(context.cooldownUntil).toLocaleString(activeLocale())}`;
    return "";
  }

  function syncTypeCardSelection() {
    for (const button of typeCards.querySelectorAll("[data-application-type]")) {
      button.setAttribute("aria-pressed", String(button.dataset.applicationType === typeSelect.value));
    }
  }

  function renderTypeCards(items = []) {
    typeCards.replaceChildren();
    const availableTypes = Array.isArray(items)
      ? items.filter(item => item && typeof item.type === "string" && typeof item.label === "string")
      : [];
    typeCards.hidden = availableTypes.length === 0;
    typeCardsEmpty.hidden = availableTypes.length > 0;

    for (const item of availableTypes) {
      const wrapper = document.createElement("article");
      wrapper.className = "type-card-item";
      wrapper.setAttribute("role", "listitem");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "type-card";
      button.dataset.applicationType = item.type;
      button.setAttribute("aria-pressed", "false");

      const title = document.createElement("span");
      title.className = "type-card-title";
      title.textContent = item.label;
      const meta = document.createElement("span");
      meta.className = "type-card-meta";
      const questionCount = Array.isArray(item.questions) ? item.questions.length : 0;
      meta.textContent = `${questionCount} soru · özel Discord incelemesi`;

      button.append(title, meta);
      button.addEventListener("click", () => {
        typeSelect.value = item.type;
        typeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      wrapper.append(button);
      typeCards.append(wrapper);
    }
  }

  function renderTypes() {
    resetDraftSyncScope();
    const context = selectedContext();
    typeSelect.replaceChildren(new Option(workflow === "business" ? "İş birliği türü seç" : "Pozisyon seç", ""));
    renderTypeCards();
    fields.replaceChildren();
    submitButton.disabled = true;
    if (applicationRouteStatus) {
      applicationRouteStatus.hidden = true;
      applicationRouteStatus.classList.add("hidden");
      applicationRouteStatus.classList.remove("unavailable");
      applicationRouteStatus.textContent = "";
    }
    if (!context) {
      updateProgress();
      return;
    }

    evidencePolicy = { ...defaultEvidencePolicy, ...(context.evidencePolicy || {}) };
    evidencePolicyText.textContent =
      `Sorulara göre isteğe bağlı veya zorunlu PNG, JPEG ya da WebP: soru başına ${evidencePolicy.maxPerQuestion}, toplam ${evidencePolicy.maxFiles} dosya; `
      + `dosya başına ${Math.floor(evidencePolicy.maxFileBytes / 1024)} KiB. `
      + "Tarama yapılamayan dosyalar güvenli kabul edilmez, incelemeye eklenmez ve karantinaya alınır.";

    for (const item of context.types || []) {
      typeSelect.append(new Option(item.label, item.type));
    }
    renderTypeCards(context.types);
    const routeTypeAvailable = context.types?.some(item => item.type === preferredType);
    if (routeTypeAvailable) {
      typeSelect.value = preferredType;
    } else if (!pathnameRoute && context.types?.length === 1) {
      typeSelect.value = context.types[0].type;
    }
    if (pathnameRoute && applicationRouteStatus) {
      const guildName = context.guildName || "Seçilen sunucu";
      applicationRouteStatus.hidden = false;
      applicationRouteStatus.classList.remove("hidden");
      applicationRouteStatus.classList.toggle("unavailable", !routeTypeAvailable);
      applicationRouteStatus.textContent = routeTypeAvailable
        ? `${pathnameRoute.label} rotası ${guildName} için açık. Soruları tamamlayarak başvurunu hazırlayabilirsin.`
        : `${pathnameRoute.label} rolü ${guildName} için etkin değil. Başka bir doğrulanmış sunucu seç veya başvuru merkezinden açık olan başka bir rolü seç.`;
    }
    syncTypeCardSelection();
    if (typeSelect.value) renderQuestions();
    else updateProgress();
  }

  function renderQuestions() {
    resetDraftSyncScope();
    const type = selectedType();
    fields.replaceChildren();
    submitButton.disabled = true;
    if (!type) {
      updateProgress();
      return;
    }

    const draft = readDraft();
    const englishQuestions = surfaceI18n?.getLanguage() === "en"
      ? window.FimaApplicationQuestionEnglish?.[type.type]
      : null;
    type.questions.forEach((question, questionIndex) => {
      const localizedQuestion = englishQuestions?.[question.key] || question;
      const wrap = document.createElement("div");
      wrap.className = "field question-field";

      const heading = document.createElement("div");
      heading.className = "question-heading";
      const questionNumber = document.createElement("span");
      questionNumber.className = "question-number";
      questionNumber.textContent = String(questionIndex + 1).padStart(2, "0");

      const label = document.createElement("label");
      label.htmlFor = `answer_${question.key}`;
      label.className = "question-title";
      label.textContent = localizedQuestion.label || question.label;
      heading.append(questionNumber, label);

      const input = document.createElement(question.multiline ? "textarea" : "input");
      input.id = `answer_${question.key}`;
      input.name = question.key;
      input.dataset.answerKey = question.key;
      input.placeholder = localizedQuestion.placeholder || question.placeholder || "";
      input.minLength = question.min;
      input.maxLength = question.max;
      input.required = true;
      input.value = String(draft?.answers?.[question.key] || "");

      const help = document.createElement("small");
      help.className = "question-meta";
      const limits = document.createElement("span");
      limits.textContent = `${question.min}–${question.max} karakter`;
      const counter = document.createElement("span");
      counter.className = "question-counter";
      help.append(limits, counter);
      updateCounter(input, counter);
      input.addEventListener("input", () => {
        updateCounter(input, counter);
        scheduleDraftSave();
        updateProgress();
      });

      const evidenceBlock = document.createElement("div");
      evidenceBlock.className = "evidence-block";
      const evidenceHeading = document.createElement("div");
      evidenceHeading.className = "evidence-heading";
      const evidenceLabel = document.createElement("label");
      evidenceLabel.htmlFor = `evidence_${question.key}`;
      const evidenceRequired = question.evidenceRequirement === "required";
      evidenceLabel.textContent = evidenceRequired ? "Zorunlu görsel kanıt" : "İsteğe bağlı görsel kanıt";
      const evidenceBadge = document.createElement("span");
      evidenceBadge.className = `evidence-badge${evidenceRequired ? " required" : ""}`;
      evidenceBadge.textContent = evidenceRequired ? "GEREKLİ" : "OPSİYONEL";
      evidenceHeading.append(evidenceLabel, evidenceBadge);

      const evidenceInput = document.createElement("input");
      evidenceInput.id = `evidence_${question.key}`;
      evidenceInput.type = "file";
      evidenceInput.className = "evidence-input";
      evidenceInput.accept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
      evidenceInput.multiple = true;
      evidenceInput.required = evidenceRequired;
      evidenceInput.dataset.questionKey = question.key;
      evidenceInput.dataset.evidenceRequired = String(evidenceRequired);

      const evidenceTrigger = document.createElement("label");
      evidenceTrigger.className = "evidence-trigger";
      evidenceTrigger.htmlFor = evidenceInput.id;
      const evidenceTriggerTitle = document.createElement("strong");
      evidenceTriggerTitle.textContent = "Görsel kanıt ekle";
      const evidenceSummary = document.createElement("span");
      evidenceSummary.className = "evidence-summary";
      evidenceSummary.textContent = "PNG, JPG veya WebP seç";
      evidenceTrigger.append(evidenceTriggerTitle, evidenceSummary);

      const evidenceHelp = document.createElement("small");
      evidenceHelp.textContent = "Dosyalar taslağa kaydedilmez. Şifre, token, cookie, lisans anahtarı veya özel hesap verisi yükleme.";
      const evidenceList = document.createElement("div");
      evidenceList.className = "evidence-list";
      evidenceInput.addEventListener("change", () => {
        if (validateEvidenceSelection({ skipRequired: true })) updateEvidenceList(evidenceInput);
        else updateEvidenceList(evidenceInput);
        updateProgress();
      });

      evidenceBlock.append(evidenceHeading, evidenceInput, evidenceTrigger, evidenceHelp, evidenceList);
      wrap.append(heading, input, help, evidenceBlock);
      fields.append(wrap);
    });

    if (draft) {
      const savedAt = draft.updatedAt ? new Date(draft.updatedAt).toLocaleString(activeLocale()) : activeLocale() === "en-US" ? "previous session" : "önceki oturum";
      draftState.textContent = `Yerel taslak geri yüklendi · ${savedAt}. FIMA hesabınla eşitleniyor; kanıt dosyaları saklanmaz.`;
    } else {
      draftState.textContent = "Cevapların FIMA hesabında güvenli taslak olarak saklanır; kanıt dosyaları hiçbir taslağa eklenmez.";
    }
    updateProgress();
    void syncServerDraft(draft);
  }

  async function load() {
    try {
      const data = await jsonFetch(`/api/fima-bot/applications/context?workflow=${encodeURIComponent(workflow)}`);
      contexts = data.contexts || [];
      setStatus("loginStatus", "FIMA hesabı bağlı", "good");
      setStatus("discordStatus", "Discord hesabı bağlı", "good");

      if (!contexts.length) {
        setStatus("memberStatus", "FIMA kurulu uygun bir sunucuda üyelik bulunamadı", "bad");
        guildSelect.replaceChildren(new Option("Önce Discord sunucusuna katıl", ""));
        const settings = await fetch(`${apiBase}/api/public/site-settings`, { cache: "no-store" })
          .then(response => response.json())
          .catch(() => null);
        const invite = settings?.settings?.discordInviteUrl;
        if (invite) {
          byId("joinServer").href = invite;
          byId("joinServer").classList.remove("hidden");
        }
        return;
      }

      setStatus("memberStatus", `${contexts.length} uygun sunucuda üyelik doğrulandı`, "good");
      setJourneyStage("prepare");
      guildSelect.replaceChildren(new Option("Sunucu seç", ""));
      for (const context of contexts) {
        const reason = disabledContextReason(context);
        const option = new Option(
          `${context.guildName} · ${context.activeSetupMode}${reason ? ` · ${reason}` : ""}`,
          context.guildId
        );
        option.disabled = Boolean(reason);
        guildSelect.append(option);
      }

      const available = contexts.filter(context => !disabledContextReason(context));
      if (available.length === 1) {
        guildSelect.value = available[0].guildId;
        renderTypes();
      }
    } catch (error) {
      if (error.status === 401) {
        setStatus("loginStatus", "FIMA hesabına giriş gerekli", "bad");
        setStatus("discordStatus", "Girişten sonra Discord bağlantısı kontrol edilir", "warn");
        setStatus("memberStatus", "Bekleniyor", "warn");
        showNotice("Önce FIMA hesabına giriş yap. Ardından Discord hesabını bağlayıp sunucu üyeliğini doğrulayacağız.", "error");
      } else if (error.body?.error === "discord_link_required") {
        setStatus("loginStatus", "FIMA hesabı bağlı", "good");
        setStatus("discordStatus", "Discord hesabını bağlamalısın", "bad");
        setStatus("memberStatus", "Discord bağlantısı bekleniyor", "warn");
        showNotice("Başvuru göndermek için Discord hesabını FIMA hesabına bağla.", "error");
      } else {
        showNotice("Başvuru servisi şu anda yüklenemedi. Biraz sonra tekrar dene.", "error");
      }
    }
  }

  guildSelect.addEventListener("change", () => {
    renderTypes();
    updateProgress();
  });
  typeSelect.addEventListener("change", () => {
    syncTypeCardSelection();
    renderQuestions();
    updateProgress();
  });
  function updateRouteTitle() {
    if (pathnameRoute) document.title = activeLocale() === "en-US"
      ? `${pathnameRoute.label} Application · FIMA`
      : `${pathnameRoute.label} Başvurusu · FIMA`;
  }
  document.addEventListener("fima:language-change", () => {
    updateRouteTitle();
    if (!typeSelect.value || submissionPending) return;
    saveLocalDraft({ announce: false });
    renderTypeCards(selectedContext()?.types || []);
    syncTypeCardSelection();
    renderQuestions();
  });

  async function submitConfirmedApplication() {
    submissionPending = true;
    submitButton.disabled = true;
    if (confirmSubmitButton) confirmSubmitButton.disabled = true;
    showNotice("Başvurun ve kanıt dosyaların doğrulanıyor…");
    try {
      const evidence = await collectEvidence();
      const token = await getCsrf();
      const result = await jsonFetch("/api/fima-bot/applications/submit", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fima-csrf": token
        },
        body: JSON.stringify({
          guildId: guildSelect.value,
          type: typeSelect.value,
          workflow,
          answers: currentAnswers(),
          evidence
        })
      });
      if (result?.success !== true || result?.application?.reviewQueued !== true || result?.application?.status !== "pending") {
        const error = new Error("application_private_review_unavailable");
        error.body = { error: "application_private_review_unavailable" };
        throw error;
      }
      await clearDraft(token);
      const evidenceResult = result.application.evidence || { total: 0, accepted: 0, quarantined: 0 };
      const evidenceSummary = evidenceResult.total
        ? ` Kanıt: ${evidenceResult.accepted} taranıp kabul edildi, ${evidenceResult.quarantined} karantinaya alındı.`
        : "";
      const queueSummary = "Özel Discord inceleme kuyruğuna gönderildi.";
      showNotice(
        `Başvurun alındı: ${result.application.label} · #${result.application.id}. ${queueSummary}${evidenceSummary}`,
        "success"
      );
      form.querySelectorAll("input,textarea,select,button").forEach(node => {
        node.disabled = true;
      });
      reviewPanel?.classList.add("hidden");
      setJourneyStage("review");
      draftState.textContent = "Taslak temizlendi; başvuru kaydı sunucuda tutuluyor.";
    } catch (error) {
      submissionPending = false;
      const code = error.body?.error || error.message;
      const messages = {
        active_application_exists: "Bu akışta zaten incelemede olan bir başvurun var.",
        application_cooldown_active: "Başvuru bekleme süren henüz bitmedi.",
        discord_membership_required: "Seçilen Discord sunucusunda üye olmalısın.",
        application_private_review_unavailable: "Özel Discord inceleme bileti şu anda açılamıyor. Başvurun kaydedilmedi; lütfen daha sonra tekrar dene.",
        applications_closed: "Bu sunucuda başvurular şu anda kapalı.",
        blacklisted_users_cannot_apply: "Aktif blacklist kaydı olan kullanıcılar başvuramaz.",
        invalid_application_answer: "Bir cevabın istenen uzunluğa uymuyor.",
        application_type_unavailable: "Bu başvuru türü seçilen akışta kullanılamıyor.",
        invalid_evidence_count: "Toplam kanıt dosyası sınırı aşıldı.",
        invalid_evidence_file: "Kanıt dosyalarından biri geçersiz.",
        invalid_evidence_question: "Bir kanıt dosyası geçersiz bir soruya bağlandı.",
        unsupported_evidence_type: "Yalnızca PNG, JPEG ve WebP kanıt dosyaları kabul edilir.",
        invalid_evidence_encoding: "Bir kanıt dosyası güvenli biçimde okunamadı.",
        invalid_evidence_size: "Bir kanıt dosyası boyut sınırını aşıyor veya boş.",
        evidence_signature_mismatch: "Bir kanıt dosyasının uzantısı, MIME türü ve gerçek imzası eşleşmiyor.",
        too_many_evidence_files_for_question: "Bir soru için en fazla iki kanıt dosyası yüklenebilir.",
        evidence_total_size_exceeded: "Kanıt dosyalarının toplam boyutu sınırı aşıyor.",
        required_evidence_missing: "Zorunlu görsel kanıt alanlarından en az biri boş.",
        evidence_read_failed: "Bir kanıt dosyası tarayıcı tarafından okunamadı.",
        invalid_evidence_selection: "Kanıt dosyalarını belirtilen sınırlara göre yeniden seç."
      };
      showNotice(messages[code] || "Başvuru gönderilemedi. Alanları kontrol edip tekrar dene.", "error");
      if (confirmSubmitButton) confirmSubmitButton.disabled = false;
      updateProgress();
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    openReview();
  });
  reviewEditButton?.addEventListener("click", closeReview);
  confirmSubmitButton?.addEventListener("click", () => {
    if (submissionPending || !openReview()) return;
    void submitConfirmedApplication();
  });

  setJourneyStage("verify");
  updateProgress();
  load();
})();
