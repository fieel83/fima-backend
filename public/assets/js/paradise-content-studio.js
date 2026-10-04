(() => {
  "use strict";

  const surfaceI18n = window.FimaSurfaceI18n?.mount({
    sourceLocale: "en",
    translations: {
      "Language / Dil": "Dil / Language",
      "Interface language": "Arayüz dili",
      "FIMA Bot product navigation": "FIMA Bot ürün gezinmesi",
      "Product": "Ürün",
      "Commands": "Komutlar",
      "Applications": "Başvurular",
      "Invite": "Davet et",
      "Support": "Destek",
      "Owner-only Discord content workflow": "Yalnız owner için Discord içerik iş akışı",
      "FIMA Content Studio": "FIMA İçerik Stüdyosu",
      "Original protected": "Orijinal korunur",
      "Immutable source snapshot.": "Değiştirilemez kaynak anlık görüntüsü.",
      "Versioned drafts": "Sürümlü taslaklar",
      "Every save can roll back.": "Her kayıt geri alınabilir.",
      "Test guild only": "Yalnız test sunucusu",
      "Publishing stays isolated.": "Yayınlama izole kalır.",
      "Owner access required": "Owner erişimi gerekli",
      "Sign in with the FIMA owner account and connect the authorized Discord identity.": "FIMA owner hesabıyla giriş yap ve yetkili Discord kimliğini bağla.",
      "Sign in": "Giriş yap",
      "Connect Discord": "Discord'u bağla",
      "01 · Source": "01 · Kaynak",
      "Message library": "Mesaj kütüphanesi",
      "New draft": "Yeni taslak",
      "Managed server": "Yönetilen sunucu",
      "Publishing is isolated to the configured test guild.": "Yayınlama yalnızca yapılandırılmış test sunucusunda izole edilir.",
      "Saved messages": "Kayıtlı mesajlar",
      "Verified source imports": "Doğrulanmış kaynak içe aktarımları",
      "Outfits": "Kıyafetler",
      "Capes": "Pelerinler",
      "Captured read-only from the real owner messages. Editing creates an Improved Draft while preserving the immutable Original snapshot.": "Gerçek owner mesajlarından salt okunur yakalanır. Düzenleme, değiştirilemez Orijinal anlık görüntüsünü koruyarak İyileştirilmiş Taslak oluşturur.",
      "Validated server backup": "Doğrulanmış sunucu yedeği",
      "Loading checksum-verified owner, bot and webhook messages…": "Sağlama toplamı doğrulanmış owner, bot ve webhook mesajları yükleniyor…",
      "No archived message selected": "Arşivlenmiş mesaj seçilmedi",
      "Open as draft": "Taslak olarak aç",
      "Read-only archive import. This never restores, sends, edits or deletes Discord content automatically.": "Salt okunur arşiv içe aktarımı. Bu işlem Discord içeriğini asla otomatik olarak geri yüklemez, göndermez, düzenlemez veya silmez.",
      "Import existing Discord message": "Mevcut Discord mesajını içe aktar",
      "Channel ID": "Kanal kimliği",
      "Message ID": "Mesaj kimliği",
      "Import read-only copy": "Salt okunur kopyayı içe aktar",
      "Import never edits Discord. Save the imported draft before publishing.": "İçe aktarma Discord'u asla düzenlemez. Yayınlamadan önce içe aktarılan taslağı kaydet.",
      "Version history": "Sürüm geçmişi",
      "02 · Compose": "02 · Oluştur",
      "Message editor": "Mesaj düzenleyici",
      "Unsaved draft": "Kaydedilmemiş taslak",
      "Unsaved changes": "Kaydedilmemiş değişiklikler",
      "Saved version": "Kayıtlı sürüm",
      "Document name": "Belge adı",
      "Untitled message": "Adsız mesaj",
      "Delivery": "Teslim yöntemi",
      "FIMA bot": "FIMA botu",
      "Bot-managed webhook": "Bot tarafından yönetilen webhook",
      "No webhook URL or token is accepted.": "Hiçbir webhook URL'si veya token kabul edilmez.",
      "Content stage": "İçerik aşaması",
      "Starter Draft": "Başlangıç Taslağı",
      "Imported": "İçe Aktarıldı",
      "Improved Draft": "İyileştirilmiş Taslak",
      "Production Version": "Production Sürümü",
      "Editing an Imported copy advances it to Improved Draft. The Original snapshot remains immutable.": "İçe Aktarılmış kopyayı düzenlemek onu İyileştirilmiş Taslağa taşır. Orijinal anlık görüntüsü değiştirilemez kalır.",
      "Source lineage": "Kaynak geçmişi",
      "Original: not applicable · Current: Improved Draft": "Orijinal: uygulanamaz · Geçerli: İyileştirilmiş Taslak",
      "Target channel ID": "Hedef kanal kimliği",
      "Required to publish": "Yayınlamak için gerekli",
      "Target message ID": "Hedef mesaj kimliği",
      "Blank creates a new message": "Boş bırakmak yeni mesaj oluşturur",
      "Set only to edit an existing bot-owned message.": "Yalnızca bota ait mevcut bir mesajı düzenlemek için ayarla.",
      "Message content": "Mesaj içeriği",
      "Optional when an embed exists": "Embed varsa isteğe bağlı",
      "Embeds": "Embedler",
      "Add embed": "Embed ekle",
      "Confirm overwrite of the selected saved document": "Seçili kayıtlı belgenin üzerine yazmayı onayla",
      "Save version": "Sürümü kaydet",
      "Every successful save creates a rollback version. Concurrent updates are rejected and reloaded.": "Her başarılı kayıt geri alma sürümü oluşturur. Eşzamanlı güncellemeler reddedilir ve yeniden yüklenir.",
      "03 · Verify": "03 · Doğrula",
      "Discord preview": "Discord önizlemesi",
      "Desktop": "Masaüstü",
      "Mobile": "Mobil",
      "Validate with server": "Sunucuyla doğrula",
      "Test-guild publishing": "Test sunucusuna yayınlama",
      "Only the saved version can be sent. Type PUBLISH TEST CONTENT exactly.": "Yalnızca kayıtlı sürüm gönderilebilir. PUBLISH TEST CONTENT ifadesini aynen yaz.",
      "Publish saved version": "Kayıtlı sürümü yayınla",
      "Select the isolated test guild to enable publishing.": "Yayınlamayı etkinleştirmek için izole test sunucusunu seç.",
      "Remove": "Kaldır",
      "Name": "Ad",
      "Value": "Değer",
      "Inline": "Satır içi",
      "Field name": "Alan adı",
      "Field value": "Alan değeri",
      "None selected": "Seçim yok",
      "Clear": "Temizle",
      "FT tag badge": "FT etiket rozeti",
      "FT category thumbnail": "FT kategori küçük resmi",
      "FT visual library": "FT görsel kütüphanesi",
      "Preview-only assets. They are never converted into Discord forum-tag icons or arbitrary webhook data.": "Yalnız önizleme varlıklarıdır. Discord forum etiketi simgelerine veya keyfi webhook verisine asla dönüştürülmez.",
      "Remove embed": "Embedi kaldır",
      "Author": "Yazar",
      "Optional author": "İsteğe bağlı yazar",
      "Author URL (HTTPS)": "Yazar URL'si (HTTPS)",
      "Author icon (HTTPS)": "Yazar simgesi (HTTPS)",
      "Accent color": "Vurgu rengi",
      "Title": "Başlık",
      "Embed title": "Embed başlığı",
      "Title URL (HTTPS)": "Başlık URL'si (HTTPS)",
      "Description": "Açıklama",
      "Embed description": "Embed açıklaması",
      "Image URL (HTTPS)": "Görsel URL'si (HTTPS)",
      "Thumbnail URL (HTTPS)": "Küçük resim URL'si (HTTPS)",
      "Footer": "Alt bilgi",
      "Optional footer": "İsteğe bağlı alt bilgi",
      "Footer icon (HTTPS)": "Alt bilgi simgesi (HTTPS)",
      "Timestamp": "Zaman damgası",
      "ISO date/time": "ISO tarih/saat",
      "Fields": "Alanlar",
      "Add field": "Alan ekle",
      "No saved messages yet.": "Henüz kayıtlı mesaj yok.",
      "Save a document to create version history.": "Sürüm geçmişi oluşturmak için bir belge kaydet.",
      "Roll back": "Geri al",
      "Today at 12:00": "Bugün 12:00",
      "Start typing or add an embed.": "Yazmaya başla veya bir embed ekle.",
      "Only the isolated test guild can publish. Production and other guilds stay read-only.": "Yalnızca izole test sunucusu yayınlayabilir. Production ve diğer sunucular salt okunur kalır.",
      "Production and non-test guilds are read-only.": "Production ve test dışı sunucular salt okunur.",
      "Publishing is enabled only for the isolated test guild.": "Yayınlama yalnızca izole test sunucusunda etkindir.",
      "Discord permits at most 10 embeds in one message.": "Discord bir mesajda en fazla 10 embede izin verir.",
      "An embed can contain at most 25 fields.": "Bir embed en fazla 25 alan içerebilir.",
      "Loading saved document…": "Kayıtlı belge yükleniyor…",
      "Validating and saving a new version…": "Yeni sürüm doğrulanıyor ve kaydediliyor…",
      "Creating a rollback version…": "Geri alma sürümü oluşturuluyor…",
      "Enter valid Discord channel and message IDs.": "Geçerli Discord kanal ve mesaj kimliklerini gir.",
      "Importing a read-only copy from Discord…": "Discord'dan salt okunur kopya içe aktarılıyor…",
      "Discord message imported as an unsaved draft. No live message was changed.": "Discord mesajı kaydedilmemiş taslak olarak içe aktarıldı. Hiçbir canlı mesaj değiştirilmedi.",
      "Choose a message from the validated backup archive.": "Doğrulanmış yedek arşivinden bir mesaj seç.",
      "Opening a checksum-verified archive copy as an unsaved draft…": "Sağlama toplamı doğrulanmış arşiv kopyası kaydedilmemiş taslak olarak açılıyor…",
      "Archived Discord content opened as an unsaved draft. No live message or stored backup was changed.": "Arşivlenmiş Discord içeriği kaydedilmemiş taslak olarak açıldı. Hiçbir canlı mesaj veya kayıtlı yedek değiştirilmedi.",
      "Publishing the saved version to the isolated test guild…": "Kayıtlı sürüm izole test sunucusuna yayınlanıyor…",
      "Content Studio is locked until owner identity verification succeeds.": "Owner kimliği doğrulanana kadar İçerik Stüdyosu kilitlidir.",
      "Sign in with the FIMA owner account.": "FIMA owner hesabıyla giriş yap.",
      "Connect the authorized Discord owner identity.": "Yetkili Discord owner kimliğini bağla.",
      "This Discord account is not authorized as the FIMA owner.": "Bu Discord hesabı FIMA owner olarak yetkili değil.",
      "The owner action safety header was rejected.": "Owner eylemi güvenlik başlığı reddedildi.",
      "The request origin did not pass the owner safety policy.": "İstek kaynağı owner güvenlik politikasını geçemedi.",
      "The library changed in another session. It has been reloaded; review your draft before saving again.": "Kütüphane başka bir oturumda değişti. Yeniden yüklendi; tekrar kaydetmeden önce taslağını incele.",
      "A library revision is required. Reload the studio.": "Kütüphane revizyonu gerekli. Stüdyoyu yeniden yükle.",
      "Confirm overwrite before creating a new version of this document.": "Bu belgenin yeni sürümünü oluşturmadan önce üzerine yazmayı onayla.",
      "Add message content or at least one embed.": "Mesaj içeriği veya en az bir embed ekle.",
      "All embeds together may contain at most 6,000 characters.": "Tüm embedler toplamda en fazla 6.000 karakter içerebilir.",
      "Choose a valid managed Discord server.": "Geçerli bir yönetilen Discord sunucusu seç.",
      "Publishing is allowed only in the isolated test guild.": "Yayınlamaya yalnızca izole test sunucusunda izin verilir.",
      "Production Discord mutation is blocked.": "Production Discord değişikliği engellendi.",
      "Only the isolated test guild can be changed.": "Yalnızca izole test sunucusu değiştirilebilir.",
      "FIMA can edit only a message it owns.": "FIMA yalnızca kendisine ait bir mesajı düzenleyebilir.",
      "The message is not owned by the FIMA-managed webhook.": "Mesaj FIMA tarafından yönetilen webhook'a ait değil.",
      "Arbitrary webhook URLs and tokens are forbidden.": "Keyfi webhook URL'leri ve tokenlar yasaktır.",
      "No validated server backup is available for this server yet.": "Bu sunucu için henüz doğrulanmış sunucu yedeği yok.",
      "The validated backup contains no Content Studio archive.": "Doğrulanmış yedek İçerik Stüdyosu arşivi içermiyor.",
      "The server backup checksum failed. Archive import is locked.": "Sunucu yedeği sağlama toplamı başarısız. Arşiv içe aktarımı kilitlendi.",
      "The server backup schema is not supported. Archive import is locked.": "Sunucu yedeği şeması desteklenmiyor. Arşiv içe aktarımı kilitlendi.",
      "The request failed. Check the server connection and try again.": "İstek başarısız. Sunucu bağlantısını kontrol edip tekrar dene."
    },
    patterns: [
      { match: /^Embed (\d+)$/u, replace: match => `Embed ${match[1]}` },
      { match: /^Loaded (.+)\.$/u, replace: match => `${match[1]} yüklendi.` },
      { match: /^Content library loaded for (.+)\. Validated backup archive is ready\.$/u, replace: match => `${match[1]} için içerik kütüphanesi yüklendi. Doğrulanmış yedek arşivi hazır.` },
      { match: /^Content library loaded for (.+)\. Backup archive is unavailable; live Discord and local drafts remain read-only\.$/u, replace: match => `${match[1]} için içerik kütüphanesi yüklendi. Yedek arşivi kullanılamıyor; canlı Discord ve yerel taslaklar salt okunur kalır.` },
      { match: /^Saved (.+) as version (.+)\.$/u, replace: match => `${match[1]}, ${match[2]} sürümü olarak kaydedildi.` },
      { match: /^Rolled back and created version (.+)\.$/u, replace: match => `Geri alındı ve ${match[1]} sürümü oluşturuldu.` },
      { match: /^(.+) verified Discord source loaded\. The Original snapshot will remain immutable\.$/u, replace: match => `${match[1]} doğrulanmış Discord kaynağı yüklendi. Orijinal anlık görüntüsü değiştirilemez kalacak.` },
      { match: /^Server validation passed for (.+) preview\.$/u, replace: match => `${match[1]} önizlemesi için sunucu doğrulaması başarılı.` },
      { match: /^Test-guild message (.+): (.+)\.(.*)$/u, replace: match => `Test sunucusu mesajı ${match[1]}: ${match[2]}.${match[3]}` },
      { match: /^(\d+) safe messages? · captured (.+?)( · SHA-256 .+)?$/u, replace: match => `${match[1]} güvenli mesaj · yakalanma ${match[2]}${match[3] || ""}` },
      { match: /^Current: (.+)$/u, replace: match => `Geçerli: ${match[1]}` },
      { match: /^Original: immutable snapshot of (.+) · Current: (.+)$/u, replace: match => `Orijinal: ${match[1]} kaynağının değiştirilemez anlık görüntüsü · Geçerli: ${match[2]}` },
      { match: /^Original: source export unavailable; this document is not a verified import · Current: (.+)$/u, replace: match => `Orijinal: kaynak dışa aktarımı kullanılamıyor; bu belge doğrulanmış içe aktarım değil · Geçerli: ${match[1]}` },
      { match: /^Original: not applicable · Current: (.+)$/u, replace: match => `Orijinal: uygulanamaz · Geçerli: ${match[1]}` },
      { match: /^(.+) · (.+) · (.+) · (\d+) versions$/u, replace: match => `${match[1]} · ${match[2]} · ${match[3]} · ${match[4]} sürüm` }
    ],
    metadata: {
      en: {
        title: "FIMA Content Studio",
        description: "Safely compose, version, preview and test FIMA Discord content without exposing webhook credentials."
      },
      tr: {
        title: "FIMA İçerik Stüdyosu",
        description: "Webhook bilgilerini açığa çıkarmadan FIMA Discord içeriğini güvenle oluştur, sürümle, önizle ve test et."
      }
    }
  });
  const activeLocale = () => surfaceI18n?.getLanguage() === "tr" ? "tr-TR" : "en-US";

  const byId = id => document.getElementById(id);
  const pageMode = window.location.pathname === "/fima-bot/embed-builder"
    ? "embed-builder"
    : "content-studio";
  const testPhrase = "PUBLISH TEST CONTENT";
  const snowflakePattern = /^\d{16,22}$/;
  const ftVisualLibrary = Object.freeze({
    tags: Object.freeze([
      Object.freeze({ id: "news", label: "News", path: "/assets/images/discord/extended-v2/tag-news-v2.png" }),
      Object.freeze({ id: "event", label: "Event", path: "/assets/images/discord/extended-v2/tag-event-v2.png" }),
      Object.freeze({ id: "guide", label: "Guide", path: "/assets/images/discord/extended-v2/tag-guide-v2.png" }),
      Object.freeze({ id: "support", label: "Support", path: "/assets/images/discord/extended-v2/tag-support-v2.png" }),
      Object.freeze({ id: "video", label: "Video", path: "/assets/images/discord/extended-v2/tag-video-v2.png" }),
      Object.freeze({ id: "art", label: "Art", path: "/assets/images/discord/extended-v2/tag-art-v2.png" }),
      Object.freeze({ id: "english", label: "English", path: "/assets/images/discord/extended-v2/tag-english-v2.png" }),
      Object.freeze({ id: "turkish", label: "Turkish", path: "/assets/images/discord/extended-v2/tag-turkish-v2.png" })
    ]),
    categories: Object.freeze([
      Object.freeze({ id: "start", label: "Start", path: "/assets/images/discord/extended-v2/category-start-v2.png" }),
      Object.freeze({ id: "community", label: "Community", path: "/assets/images/discord/extended-v2/category-community-v2.png" }),
      Object.freeze({ id: "fima", label: "FIMA", path: "/assets/images/discord/extended-v2/category-fima-v2.png" }),
      Object.freeze({ id: "fieel-style", label: "Fieel Style", path: "/assets/images/discord/extended-v2/category-fieel-style-v2.png" }),
      Object.freeze({ id: "turkish-community", label: "Turkish Community", path: "/assets/images/discord/extended-v2/category-turkish-community-v2.png" }),
      Object.freeze({ id: "support", label: "Support", path: "/assets/images/discord/extended-v2/category-support-v2.png" }),
      Object.freeze({ id: "personnel", label: "Personnel", path: "/assets/images/discord/extended-v2/category-personnel-v2.png" }),
      Object.freeze({ id: "video-team", label: "Video Team", path: "/assets/images/discord/extended-v2/category-video-team-v2.png" }),
      Object.freeze({ id: "voice", label: "Voice", path: "/assets/images/discord/extended-v2/category-voice-v2.png" })
    ])
  });
  function createFtBannerStarter({ name, title, description, imageUrl }) {
    const embed = Object.freeze({
      color: "#20d9ba",
      title,
      description,
      image: Object.freeze({ url: imageUrl }),
      footer: Object.freeze({ text: "FT Community · FIMA" }),
      fields: Object.freeze([])
    });
    return Object.freeze({
      name,
      deliveryMode: "bot",
      stage: "starter_draft",
      source: "starter",
      importStatus: "not_applicable",
      originalSnapshot: null,
      targetChannelId: "",
      targetMessageId: "",
      metadata: Object.freeze({ starterKind: "ft_banner" }),
      current: Object.freeze({ content: "", embeds: Object.freeze([embed]) })
    });
  }
  const ftBannerStarters = Object.freeze({
    welcome: createFtBannerStarter({
      name: "FT Community · Welcome",
      title: "Welcome to FT Community",
      description: "Start here, meet the community and choose the spaces that fit you.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-welcome-v5.png"
    }),
    leave: createFtBannerStarter({
      name: "FT Community · Leave",
      title: "Until we meet again",
      description: "Thank you for being part of FT Community. The door stays open for your return.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-leave-v5.png"
    }),
    rules: createFtBannerStarter({
      name: "FT Community · Rules",
      title: "Community rules",
      description: "Read the rules before joining conversations so the server stays safe and welcoming.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-rules-v5.png"
    }),
    staff: createFtBannerStarter({
      name: "FT Community · Staff",
      title: "Meet the staff team",
      description: "The staff team keeps FT Community organized, fair and ready to help.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-staff-v5.png"
    }),
    "video-team": createFtBannerStarter({
      name: "FT Community · Video Team",
      title: "Video team",
      description: "Create, collaborate and publish community videos with the FT creative team.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-video-team-v5.png"
    }),
    announcement: createFtBannerStarter({
      name: "FT Community · Announcement",
      title: "Community announcement",
      description: "Use this space for verified FT Community news and important updates.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-announcement-v5.png"
    }),
    leaderboard: createFtBannerStarter({
      name: "FT Community · Leaderboard",
      title: "Monthly leaderboard",
      description: "Celebrate this month's most active text and voice community members.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-leaderboard-v5.png"
    }),
    booster: createFtBannerStarter({
      name: "FT Community · Booster",
      title: "Booster spotlight",
      description: "Thank you for powering FT Community and helping every member get more from the server.",
      imageUrl: "https://fimamacro.com/assets/images/discord/v5/ft-community-booster-v5.png"
    })
  });
  const allowedLocalVisualPaths = new Set([
    ...ftVisualLibrary.tags.map(asset => asset.path),
    ...ftVisualLibrary.categories.map(asset => asset.path)
  ]);
  const ftPreviewStorageKey = "fima.contentStudio.ftPreviewVisuals.v1";
  const studio = byId("studio");
  const notice = byId("notice");
  const documentList = byId("documentList");
  const versionList = byId("versionList");
  const embedsList = byId("embedsList");
  const previewShell = byId("previewShell");
  let csrfToken = "";
  let studioState = { documents: {}, updatedAt: null };
  let selectedDocumentId = null;
  let currentSource = "new";
  let currentImportStatus = "not_applicable";
  let currentMetadata = {};
  let currentOriginalSnapshot = null;
  let currentCanonical = { guildId: null, channelId: null, messageId: null };
  let contentArchive = { guildId: "", capturedAt: null, digest: null, records: [] };
  let testGuildId = "";
  let previewMode = "desktop";
  let dirty = true;

  function normalizeFtPreviewVisual(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const tag = typeof source.tag === "string" && allowedLocalVisualPaths.has(source.tag) ? source.tag : "";
    const thumbnail = typeof source.thumbnail === "string" && allowedLocalVisualPaths.has(source.thumbnail) ? source.thumbnail : "";
    return { tag, thumbnail };
  }

  function readFtPreviewStore() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(ftPreviewStorageKey) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  function ftPreviewScope(documentId) {
    return `${byId("guildSelect")?.value || ""}:${documentId || ""}`;
  }

  function currentFtPreviewVisuals() {
    return [...embedsList.children].slice(0, 10).map(card => normalizeFtPreviewVisual({
      tag: card.dataset.previewTag,
      thumbnail: card.dataset.previewThumbnail
    }));
  }

  function persistFtPreviewVisuals(documentId, visuals = currentFtPreviewVisuals()) {
    if (!documentId) return;
    try {
      const store = readFtPreviewStore();
      const scope = ftPreviewScope(documentId);
      store[scope] = {
        updatedAt: new Date().toISOString(),
        visuals: visuals.slice(0, 10).map(normalizeFtPreviewVisual)
      };
      const newestEntries = Object.entries(store)
        .sort(([, left], [, right]) => String(right?.updatedAt || "").localeCompare(String(left?.updatedAt || "")))
        .slice(0, 100);
      window.localStorage.setItem(ftPreviewStorageKey, JSON.stringify(Object.fromEntries(newestEntries)));
    } catch {
      // Preview preferences are optional and must never block editing or publishing.
    }
  }

  function loadFtPreviewVisuals(documentId) {
    if (!documentId) return [];
    const entry = readFtPreviewStore()[ftPreviewScope(documentId)];
    return Array.isArray(entry?.visuals) ? entry.visuals.slice(0, 10).map(normalizeFtPreviewVisual) : [];
  }

  function make(tag, options = {}, children = []) {
    const element = document.createElement(tag);
    if (options.className) element.className = options.className;
    if (options.text !== undefined) element.textContent = String(options.text);
    if (options.type) element.type = options.type;
    if (options.value !== undefined) element.value = String(options.value ?? "");
    if (options.placeholder) element.placeholder = options.placeholder;
    if (options.maxLength) element.maxLength = options.maxLength;
    if (options.dataset) Object.assign(element.dataset, options.dataset);
    if (options.title) element.title = options.title;
    for (const child of children) if (child) element.append(child);
    return element;
  }

  function showNotice(message, kind = "") {
    notice.textContent = message;
    notice.className = `notice ${kind}`.trim();
  }

  function errorMessage(code) {
    const messages = {
      login_required: "Sign in with the FIMA owner account.",
      discord_link_required: "Connect the authorized Discord owner identity.",
      paradise_owner_required: "This Discord account is not authorized as the FIMA owner.",
      owner_action_header_required: "The owner action safety header was rejected.",
      origin_mismatch: "The request origin did not pass the owner safety policy.",
      state_changed: "The library changed in another session. It has been reloaded; review your draft before saving again.",
      state_revision_required: "A library revision is required. Reload the studio.",
      overwrite_confirmation_required: "Confirm overwrite before creating a new version of this document.",
      content_required: "Add message content or at least one embed.",
      embed_character_limit: "All embeds together may contain at most 6,000 characters.",
      invalid_guild_id: "Choose a valid managed Discord server.",
      invalid_document_id: "The document identifier is invalid.",
      document_not_found: "The saved document no longer exists.",
      version_not_found: "That saved version no longer exists.",
      content_channel_not_found: "The target text channel was not found.",
      content_message_not_found: "The target message was not found.",
      test_guild_only: "Publishing is allowed only in the isolated test guild.",
      production_guild_mutation_blocked: "Production Discord mutation is blocked.",
      non_test_guild_mutation_blocked: "Only the isolated test guild can be changed.",
      content_message_not_owned_by_bot: "FIMA can edit only a message it owns.",
      content_message_not_owned_by_managed_webhook: "The message is not owned by the FIMA-managed webhook.",
      content_stage_transition_invalid: "Use the workflow order: Imported or Starter Draft, then Improved Draft, then Production Version.",
      content_stage_not_publishable: "Only an Improved Draft or Production Version can be published to the isolated test guild.",
      content_source_export_required: "Capture the real Discord source before publishing this pending starter or legacy import.",
      original_snapshot_required: "A Discord import must retain its immutable Original snapshot.",
      imported_stage_requires_original_payload: "Edited imported content must be marked as an Improved Draft; the Original stays unchanged.",
      arbitrary_webhook_forbidden: "Arbitrary webhook URLs and tokens are forbidden.",
      publish_confirmation_required: `Type ${testPhrase} exactly.`,
      discord_not_ready: "FIMA is not connected to Discord right now.",
      managed_webhook_channel_unsupported: "This channel cannot host a managed webhook.",
      content_archive_backup_missing: "No validated server backup is available for this server yet.",
      content_archive_missing: "The validated backup contains no Content Studio archive.",
      content_archive_record_not_found: "That archived message is no longer present in the validated backup.",
      content_archive_record_invalid: "The archived message identifier failed validation.",
      content_archive_guild_mismatch: "The backup belongs to a different Discord server.",
      content_archive_record_guild_mismatch: "An archived message belongs to a different Discord server.",
      content_archive_restore_policy_invalid: "The archive restore safety policy failed validation.",
      backup_checksum_mismatch: "The server backup checksum failed. Archive import is locked.",
      backup_schema_invalid: "The server backup schema is not supported. Archive import is locked.",
      request_failed: "The request failed. Check the server connection and try again."
    };
    return messages[code] || `Content Studio request failed (${code || "unknown_error"}).`;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      cache: "no-store",
      ...options
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(body.error || "request_failed"), {
        code: body.error || "request_failed",
        status: response.status,
        body
      });
    }
    return body;
  }

  async function csrf() {
    if (csrfToken) return csrfToken;
    const data = await api("/api/csrf-token");
    csrfToken = data.csrfToken || data.token || "";
    if (!csrfToken) throw Object.assign(new Error("csrf_unavailable"), { code: "csrf_unavailable" });
    return csrfToken;
  }

  async function mutate(path, body) {
    return api(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fima-csrf": await csrf(),
        "x-paradise-owner-action": "1"
      },
      body: JSON.stringify(body)
    });
  }

  async function ownerReadOnlyPost(path, body) {
    return api(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-fima-csrf": await csrf()
      },
      body: JSON.stringify(body)
    });
  }

  function field(labelText, input) {
    const label = make("label", { text: labelText });
    const wrap = make("div", { className: "field" }, [label, input]);
    return wrap;
  }

  function textInput(className, value, placeholder, maxLength) {
    const input = make("input", { type: "text", className, value: value || "", placeholder, maxLength });
    return input;
  }

  function textarea(className, value, placeholder, maxLength) {
    return make("textarea", { className, value: value || "", placeholder, maxLength });
  }

  function formatEmbedColor(rawColor) {
    if (typeof rawColor === "number" && Number.isInteger(rawColor) && rawColor >= 0 && rawColor <= 0xffffff) {
      return `#${rawColor.toString(16).padStart(6, "0")}`;
    }
    if (typeof rawColor === "string" && /^#?[0-9a-f]{6}$/i.test(rawColor.trim())) {
      return `#${rawColor.trim().replace(/^#/, "").toLowerCase()}`;
    }
    return "#9b5cff";
  }

  function addEmbedFieldRow(card, raw = {}) {
    const row = make("div", { className: "field-row" });
    const name = textInput("embed-field-name", raw.name, "Field name", 256);
    const value = textarea("embed-field-value", raw.value, "Field value", 1024);
    const inlineLabel = make("label", { className: "checkbox" });
    const inline = make("input", { type: "checkbox", className: "embed-field-inline" });
    inline.checked = raw.inline === true;
    inlineLabel.append(inline, document.createTextNode(" Inline"));
    const remove = make("button", { className: "button fit", type: "button", text: "Remove" });
    remove.addEventListener("click", () => {
      row.remove();
      markDirty();
    });
    row.append(field("Name", name), field("Value", value), inlineLabel, remove);
    card.querySelector(".embed-fields").append(row);
  }

  function createVisualPicker(card, kind, assets) {
    const selectedDataKey = kind === "tag" ? "previewTag" : "previewThumbnail";
    const initialPath = card.dataset[selectedDataKey] || "";
    const initialAsset = assets.find(asset => asset.path === initialPath);
    const selectedLabel = make("span", { className: "visual-selection", text: initialAsset?.label || "None selected" });
    const buttons = make("div", { className: "visual-options" });

    function select(path, label) {
      const selectedPath = assets.some(asset => asset.path === path) && allowedLocalVisualPaths.has(path) ? path : "";
      card.dataset[selectedDataKey] = selectedPath;
      selectedLabel.textContent = selectedPath ? label : "None selected";
      for (const button of buttons.querySelectorAll("button")) {
        const active = Boolean(selectedPath) && button.dataset.visualPath === selectedPath;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      }
      persistFtPreviewVisuals(selectedDocumentId);
      renderPreview(currentPayload());
    }

    for (const asset of assets) {
      const image = safeImage(asset.path, "visual-option-image");
      const button = make("button", {
        className: "visual-option",
        type: "button",
        title: `${asset.label} (${kind === "tag" ? "preview badge" : "preview thumbnail"})`,
        dataset: { visualPath: asset.path }
      }, [image, make("span", { text: asset.label })]);
      const active = asset.path === initialAsset?.path;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", () => select(asset.path, asset.label));
      buttons.append(button);
    }

    const clear = make("button", { className: "button fit", type: "button", text: "Clear" });
    clear.addEventListener("click", () => select("", ""));
    const head = make("div", { className: "visual-picker-head" }, [
      make("strong", { text: kind === "tag" ? "FT tag badge" : "FT category thumbnail" }),
      selectedLabel,
      clear
    ]);
    return make("section", { className: "visual-picker" }, [head, buttons]);
  }

  function createFtVisualLibrary(card) {
    const library = make("section", { className: "ft-visual-library" });
    library.append(
      make("div", { className: "ft-visual-library-copy" }, [
        make("strong", { text: "FT visual library" }),
        make("span", { text: "Preview-only assets. They are never converted into Discord forum-tag icons or arbitrary webhook data." })
      ]),
      createVisualPicker(card, "tag", ftVisualLibrary.tags),
      createVisualPicker(card, "thumbnail", ftVisualLibrary.categories)
    );
    return library;
  }

  function embedEditorGroup(title, description, children) {
    return make("section", { className: "embed-editor-group" }, [
      make("div", { className: "embed-editor-group-head" }, [
        make("strong", { text: title }),
        make("span", { text: description })
      ]),
      make("div", { className: "embed-grid" }, children)
    ]);
  }

  function addEmbedCard(raw = {}, previewVisual = {}) {
    if (embedsList.children.length >= 10) {
      showNotice("Discord permits at most 10 embeds in one message.", "warn");
      return;
    }
    const card = make("article", { className: "embed-card" });
    const normalizedPreviewVisual = normalizeFtPreviewVisual(previewVisual);
    card.dataset.previewTag = normalizedPreviewVisual.tag;
    card.dataset.previewThumbnail = normalizedPreviewVisual.thumbnail;
    const heading = make("strong", { text: `Embed ${embedsList.children.length + 1}` });
    const remove = make("button", { className: "button fit", type: "button", text: "Remove embed" });
    remove.addEventListener("click", () => {
      card.remove();
      renumberEmbeds();
      persistFtPreviewVisuals(selectedDocumentId);
      markDirty();
    });
    const head = make("div", { className: "embed-head" }, [heading, remove]);
    const identityGroup = embedEditorGroup("Identity & accent", "Set the author identity and the FIMA accent used by this embed.", [
      field("Author", textInput("embed-author-name", raw.author?.name, "Optional author", 256)),
      field("Author URL (HTTPS)", textInput("embed-author-url", raw.author?.url, "https://…", 2048)),
      field("Author icon (HTTPS)", textInput("embed-author-icon", raw.author?.icon_url, "https://…", 2048)),
      field("Accent color", textInput("embed-color", formatEmbedColor(raw.color), "#9b5cff", 7))
    ]);
    const description = field("Message text", textarea("embed-description", raw.description, "Main embed message", 4096));
    description.classList.add("wide");
    const titleGroup = embedEditorGroup("Title & message", "The title can link to an HTTPS page; message text sits below it and above the banner image.", [
      field("Title", textInput("embed-title", raw.title, "Embed title", 256)),
      field("Title URL (HTTPS)", textInput("embed-url", raw.url, "https://…", 2048)),
      description
    ]);
    const visualGroup = embedEditorGroup("Banner & thumbnail", "The banner spans the embed width; the thumbnail stays compact beside the title and message.", [
      field("Banner / image URL (HTTPS)", textInput("embed-image", raw.image?.url, "https://…", 2048)),
      field("Thumbnail URL (HTTPS)", textInput("embed-thumbnail", raw.thumbnail?.url, "https://…", 2048))
    ]);
    const footerGroup = embedEditorGroup("Footer & time", "Add optional source context and an ISO timestamp.", [
      field("Footer", textInput("embed-footer-text", raw.footer?.text, "Optional footer", 2048)),
      field("Footer icon (HTTPS)", textInput("embed-footer-icon", raw.footer?.icon_url, "https://…", 2048)),
      field("Timestamp", textInput("embed-timestamp", raw.timestamp, "ISO date/time", 64))
    ]);
    const fieldsHead = make("div", { className: "inline" });
    fieldsHead.append(
      make("span", { className: "subheading", text: "Fields" }),
      make("button", { className: "button fit add-embed-field", type: "button", text: "Add field" })
    );
    const rows = make("div", { className: "embed-fields stack" });
    fieldsHead.classList.add("wide");
    rows.classList.add("wide");
    const fieldsGroup = embedEditorGroup("Fields", "Add up to 25 structured name and value pairs.", [fieldsHead, rows]);
    card.append(head, identityGroup, titleGroup, visualGroup, createFtVisualLibrary(card), footerGroup, fieldsGroup);
    fieldsHead.querySelector("button").addEventListener("click", () => {
      if (rows.children.length >= 25) {
        showNotice("An embed can contain at most 25 fields.", "warn");
        return;
      }
      addEmbedFieldRow(card);
      markDirty();
    });
    embedsList.append(card);
    for (const embedField of raw.fields || []) addEmbedFieldRow(card, embedField);
    renumberEmbeds();
  }

  function renumberEmbeds() {
    [...embedsList.children].forEach((card, index) => {
      card.querySelector(".embed-head strong").textContent = `Embed ${index + 1}`;
    });
    byId("embedCount").textContent = `${embedsList.children.length}/10`;
    byId("addEmbed").disabled = embedsList.children.length >= 10;
  }

  function value(card, selector) {
    return card.querySelector(selector)?.value.trim() || "";
  }

  function collectEmbed(card) {
    const color = value(card, ".embed-color");
    const embed = {
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#9b5cff",
      title: value(card, ".embed-title"),
      description: value(card, ".embed-description"),
      fields: [...card.querySelectorAll(".field-row")].map(row => ({
        name: value(row, ".embed-field-name"),
        value: value(row, ".embed-field-value"),
        inline: row.querySelector(".embed-field-inline")?.checked === true
      })).filter(item => item.name && item.value)
    };
    const mappings = [
      ["url", ".embed-url"],
      ["imageUrl", ".embed-image"],
      ["thumbnailUrl", ".embed-thumbnail"],
      ["authorName", ".embed-author-name"],
      ["authorUrl", ".embed-author-url"],
      ["authorIconUrl", ".embed-author-icon"],
      ["footerText", ".embed-footer-text"],
      ["footerIconUrl", ".embed-footer-icon"],
      ["timestamp", ".embed-timestamp"]
    ];
    for (const [key, selector] of mappings) {
      const item = value(card, selector);
      if (item) embed[key] = item;
    }
    return embed;
  }

  function currentPayload() {
    return {
      content: byId("messageContent").value,
      embeds: [...embedsList.children].map(collectEmbed)
    };
  }

  function currentDocumentInput() {
    return {
      ...(selectedDocumentId ? { id: selectedDocumentId } : {}),
      overwrite: selectedDocumentId ? byId("overwriteConfirmation").checked : false,
      name: byId("documentName").value,
      payload: currentPayload(),
      deliveryMode: byId("deliveryMode").value,
      targetChannelId: byId("targetChannelId").value,
      targetMessageId: byId("targetMessageId").value,
      source: currentSource,
      stage: byId("contentStage").value,
      importStatus: currentImportStatus,
      metadata: currentMetadata,
      originalSnapshot: currentOriginalSnapshot,
      canonicalGuildId: currentCanonical.guildId,
      canonicalChannelId: currentCanonical.channelId,
      canonicalMessageId: currentCanonical.messageId
    };
  }

  function setDirty(value = true) {
    dirty = value;
    byId("dirtyState").textContent = dirty ? "Unsaved changes" : "Saved version";
    byId("dirtyState").style.color = dirty ? "var(--warn)" : "var(--good)";
    updatePublishState();
  }

  function markDirty() {
    if (byId("contentStage").value === "imported" && currentOriginalSnapshot) {
      byId("contentStage").value = "improved_draft";
    }
    setDirty(true);
    renderLineageStatus();
    renderPreview(currentPayload());
  }

  function renderLineageStatus() {
    const stageLabels = {
      starter_draft: "Starter Draft",
      imported: "Imported",
      improved_draft: "Improved Draft",
      production_version: "Production Version"
    };
    const parts = [`Current: ${stageLabels[byId("contentStage").value] || "Improved Draft"}`];
    if (currentOriginalSnapshot) {
      const source = currentMetadata.sourceMessageId || "captured source";
      parts.unshift(`Original: immutable snapshot of ${source}`);
    } else if (currentImportStatus === "pending_source_export") {
      parts.unshift("Original: source export unavailable; this document is not a verified import");
    } else {
      parts.unshift("Original: not applicable");
    }
    byId("lineageStatus").textContent = parts.join(" · ");
  }

  function clearEditor() {
    selectedDocumentId = null;
    currentSource = "new";
    currentImportStatus = "not_applicable";
    currentMetadata = {};
    currentOriginalSnapshot = null;
    currentCanonical = { guildId: null, channelId: null, messageId: null };
    byId("documentName").value = "Untitled message";
    byId("deliveryMode").value = "bot";
    byId("contentStage").value = "improved_draft";
    byId("targetChannelId").value = "";
    byId("targetMessageId").value = "";
    byId("messageContent").value = "";
    byId("overwriteConfirmation").checked = false;
    byId("publishConfirmation").value = "";
    embedsList.replaceChildren();
    renumberEmbeds();
    renderDocumentList();
    renderVersions();
    updateContentCounter();
    renderLineageStatus();
    setDirty(true);
    renderPreview(currentPayload());
  }

  function applyDocument(document, { saved = false } = {}) {
    selectedDocumentId = saved ? document.id : null;
    currentSource = document.source || "new";
    currentImportStatus = document.importStatus || "not_applicable";
    currentMetadata = JSON.parse(JSON.stringify(document.metadata || {}));
    currentOriginalSnapshot = document.originalSnapshot ? JSON.parse(JSON.stringify(document.originalSnapshot)) : null;
    currentCanonical = {
      guildId: document.canonicalGuildId || null,
      channelId: document.canonicalChannelId || null,
      messageId: document.canonicalMessageId || null
    };
    byId("documentName").value = document.name || "Untitled message";
    byId("deliveryMode").value = document.deliveryMode || "bot";
    byId("contentStage").value = document.stage || (document.source === "discord_import" ? "imported" : "improved_draft");
    byId("targetChannelId").value = document.targetChannelId || "";
    byId("targetMessageId").value = document.targetMessageId || "";
    byId("messageContent").value = document.current?.content ?? document.payload?.content ?? "";
    byId("overwriteConfirmation").checked = false;
    byId("publishConfirmation").value = "";
    embedsList.replaceChildren();
    const payload = document.current || document.payload || {};
    const previewVisuals = saved ? loadFtPreviewVisuals(document.id) : [];
    for (const [index, embed] of (payload.embeds || []).entries()) addEmbedCard(embed, previewVisuals[index]);
    renumberEmbeds();
    renderDocumentList();
    renderVersions();
    updateContentCounter();
    renderLineageStatus();
    setDirty(!saved);
    renderPreview(payload);
  }

  function updateContentCounter() {
    byId("contentCounter").textContent = `${byId("messageContent").value.length}/2000`;
  }

  function renderDocumentList() {
    documentList.replaceChildren();
    const documents = Object.values(studioState.documents || {}).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    if (!documents.length) {
      documentList.append(make("div", { className: "empty", text: "No saved messages yet." }));
      return;
    }
    for (const document of documents) {
      const row = make("div", { className: `document-row${document.id === selectedDocumentId ? " active" : ""}` });
      const button = make("button", { type: "button", text: document.name });
      button.addEventListener("click", () => loadDocument(document.id));
      row.append(button, make("span", {
        className: "meta",
        text: `${document.source} · ${document.stage || "improved_draft"} · ${document.importStatus || "not_applicable"} · ${document.versions?.length || 0} versions`
      }));
      documentList.append(row);
    }
  }

  function resetArchive(message = "No validated archive loaded.") {
    contentArchive = { guildId: "", capturedAt: null, digest: null, records: [] };
    const select = byId("archiveMessage");
    select.replaceChildren(new Option("No archived message selected", ""));
    select.disabled = true;
    byId("importArchiveMessage").disabled = true;
    byId("archiveStatus").textContent = message;
  }

  function archiveOptionLabel(record) {
    const location = [record.categoryName, record.channelName ? `#${record.channelName}` : record.channelId].filter(Boolean).join(" / ");
    const source = record.author?.globalName || record.author?.username || record.sourceKind || "Discord";
    const preview = record.contentPreview || `${record.embedCount || 0} embed · ${record.attachmentCount || 0} attachment`;
    return `${record.pinned ? "Pinned · " : ""}${location} · ${source} · ${preview}`.slice(0, 240);
  }

  async function loadContentArchive(guildId) {
    resetArchive("Validating the latest server backup checksum…");
    try {
      const data = await api(`/api/fima-bot/content-studio/archive?guildId=${encodeURIComponent(guildId)}`);
      if (data.guildId !== guildId) throw Object.assign(new Error("content_archive_guild_mismatch"), { code: "content_archive_guild_mismatch" });
      const records = (Array.isArray(data.records) ? data.records : []).filter(record =>
        record?.guildId === guildId
        && snowflakePattern.test(String(record.channelId || ""))
        && snowflakePattern.test(String(record.messageId || ""))
        && record.restorePolicy === "content_studio_import_only"
        && record.automaticRestore === false
      );
      contentArchive = {
        guildId,
        capturedAt: data.capturedAt || null,
        digest: data.digest || null,
        records
      };
      const select = byId("archiveMessage");
      select.replaceChildren(new Option(records.length ? "Choose a checksum-verified message" : "No archived owner, bot or webhook messages", ""));
      for (const record of records) {
        select.append(new Option(archiveOptionLabel(record), `${record.channelId}:${record.messageId}`));
      }
      select.disabled = records.length === 0;
      byId("importArchiveMessage").disabled = true;
      const captured = data.capturedAt ? new Date(data.capturedAt).toLocaleString(activeLocale()) : "unknown capture time";
      const digest = typeof data.digest === "string" && data.digest ? ` · checksum ${data.digest.slice(0, 12)}…` : "";
      byId("archiveStatus").textContent = `${records.length} safe message${records.length === 1 ? "" : "s"} · captured ${captured}${digest}`;
      return true;
    } catch (error) {
      resetArchive(errorMessage(error.code));
      return false;
    }
  }

  function updateArchiveImportState() {
    const [channelId, messageId] = byId("archiveMessage").value.split(":");
    const selected = contentArchive.records.some(record => record.channelId === channelId && record.messageId === messageId);
    byId("importArchiveMessage").disabled = !selected;
  }

  function renderVersions() {
    versionList.replaceChildren();
    const document = selectedDocumentId ? studioState.documents?.[selectedDocumentId] : null;
    const versions = [...(document?.versions || [])].reverse();
    if (!versions.length) {
      versionList.append(make("div", { className: "empty", text: "Save a document to create version history." }));
      return;
    }
    for (const version of versions) {
      const row = make("div", { className: "version-row" });
      const date = version.savedAt ? new Date(version.savedAt).toLocaleString(activeLocale()) : "Unknown time";
      const button = make("button", { className: "button", type: "button", text: "Roll back" });
      button.addEventListener("click", () => rollback(version.id));
      row.append(make("strong", { text: date }), make("span", { className: "meta", text: `${version.stage || "improved_draft"} · ${version.id}` }), button);
      versionList.append(row);
    }
  }

  function safeImage(url, className) {
    const normalized = String(url || "").trim();
    if (!/^https:\/\//i.test(normalized) && !allowedLocalVisualPaths.has(normalized)) return null;
    const image = make("img", { className });
    image.src = normalized;
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove());
    return image;
  }

  function renderPreview(payload) {
    previewShell.replaceChildren();
    previewShell.classList.toggle("mobile", previewMode === "mobile");
    const message = make("div", { className: "discord-message" });
    const body = make("div");
    const head = make("div", { className: "message-head" }, [
      make("strong", { text: byId("deliveryMode").value === "managed_webhook" ? "FIMA Content" : "FIMA" }),
      document.createTextNode(" "),
      make("span", { className: "message-time", text: "Today at 12:00" })
    ]);
    body.append(head);
    if (payload.content) body.append(make("div", { className: "message-content", text: payload.content }));
    const embedWrap = make("div", { className: "preview-embeds" });
    for (const [embedIndex, embed] of (payload.embeds || []).entries()) {
      const color = typeof embed.color === "number" ? `#${embed.color.toString(16).padStart(6, "0")}` : embed.color;
      const card = make("div", { className: "preview-embed" });
      card.style.setProperty("--embed-color", /^#[0-9a-f]{6}$/i.test(color || "") ? color : "#9b5cff");
      const editorCard = embedsList.children[embedIndex];
      const previewThumbnail = editorCard?.dataset.previewThumbnail || "";
      const previewTag = editorCard?.dataset.previewTag || "";
      const thumb = safeImage(embed.thumbnail?.url || embed.thumbnailUrl || previewThumbnail, "preview-thumb");
      if (thumb) card.append(thumb);
      const tagBadge = safeImage(previewTag, "preview-tag-badge");
      if (tagBadge) card.append(tagBadge);
      const author = embed.author?.name || embed.authorName;
      if (author) card.append(make("div", { className: "preview-author", text: author }));
      if (embed.title) card.append(make("div", { className: "preview-title", text: embed.title }));
      if (embed.description) card.append(make("div", { className: "preview-description", text: embed.description }));
      if (embed.fields?.length) {
        const fields = make("div", { className: "preview-fields" });
        for (const item of embed.fields) {
          const fieldNode = make("div", { className: `preview-field${item.inline ? "" : " wide"}` });
          fieldNode.append(make("strong", { text: item.name }), make("span", { text: item.value }));
          fields.append(fieldNode);
        }
        card.append(fields);
      }
      const image = safeImage(embed.image?.url || embed.imageUrl, "preview-image");
      if (image) card.append(image);
      const footer = embed.footer?.text || embed.footerText;
      if (footer) card.append(make("div", { className: "preview-footer", text: footer }));
      embedWrap.append(card);
    }
    body.append(embedWrap);
    if (!payload.content && !(payload.embeds || []).length) body.append(make("div", { className: "empty", text: "Start typing or add an embed." }));
    message.append(make("div", { className: "avatar", text: "P" }), body);
    previewShell.append(message);
  }

  function updateGuildPolicy() {
    const isTest = byId("guildSelect").value === testGuildId;
    byId("guildPolicy").textContent = isTest
      ? `Isolated test guild ${testGuildId}. Publishing may be enabled after saving.`
      : "Read, draft and preview only. Publishing to this server is blocked.";
    byId("publishPolicy").textContent = isTest
      ? "The saved document can be created or edited in the isolated test guild."
      : "Production and non-test Discord mutation is blocked.";
    updatePublishState();
  }

  function updatePublishState() {
    const isTest = byId("guildSelect").value === testGuildId;
    const exact = byId("publishConfirmation").value === testPhrase;
    const channelValid = snowflakePattern.test(byId("targetChannelId").value.trim());
    const stagePublishable = ["improved_draft", "production_version"].includes(byId("contentStage").value);
    const lineagePublishable = currentImportStatus !== "pending_source_export";
    byId("publishMessage").disabled = !isTest || dirty || !selectedDocumentId || !exact || !channelValid || !stagePublishable || !lineagePublishable;
  }

  async function loadDocument(id) {
    try {
      showNotice("Loading saved document…");
      const guildId = byId("guildSelect").value;
      const data = await api(`/api/fima-bot/content-studio/document/${encodeURIComponent(id)}?guildId=${encodeURIComponent(guildId)}`);
      studioState.documents[id] = data.document;
      applyDocument(data.document, { saved: true });
      showNotice(`Loaded ${data.document.name}.`, "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function loadLibrary(guildId = "") {
    const query = guildId ? `?guildId=${encodeURIComponent(guildId)}` : "";
    const data = await api(`/api/fima-bot/content-studio${query}`);
    testGuildId = data.testGuildId || "";
    studioState = data.state || { documents: {}, updatedAt: null };
    byId("guildSelect").replaceChildren();
    for (const server of data.servers || []) {
      const option = new Option(`${server.name || "Discord server"} · ${server.id}`, server.id);
      option.selected = server.id === data.selectedGuildId;
      byId("guildSelect").append(option);
    }
    if (![...byId("guildSelect").options].some(option => option.value === data.selectedGuildId)) {
      byId("guildSelect").append(new Option(data.selectedGuildId, data.selectedGuildId));
    }
    byId("guildSelect").value = data.selectedGuildId;
    clearEditor();
    updateGuildPolicy();
    const archiveReady = await loadContentArchive(data.selectedGuildId);
    showNotice(`Content library loaded for ${data.selectedGuildId}.${archiveReady ? " Validated backup archive is ready." : " Backup archive is unavailable; live Discord and local drafts remain read-only."}`, archiveReady ? "good" : "warn");
  }

  async function save() {
    try {
      byId("saveDocument").disabled = true;
      showNotice("Validating and saving a new version…");
      const previewVisuals = currentFtPreviewVisuals();
      const data = await mutate("/api/fima-bot/content-studio/save", {
        guildId: byId("guildSelect").value,
        expectedStateUpdatedAt: studioState.updatedAt,
        document: currentDocumentInput()
      });
      studioState.updatedAt = data.stateUpdatedAt;
      studioState.documents[data.document.id] = data.document;
      persistFtPreviewVisuals(data.document.id, previewVisuals);
      applyDocument(data.document, { saved: true });
      showNotice(`Saved ${data.document.name} as version ${data.version.id}.`, "good");
    } catch (error) {
      if (error.code === "state_changed") await reloadAfterConflict();
      showNotice(errorMessage(error.code), "bad");
    } finally {
      byId("saveDocument").disabled = false;
    }
  }

  async function rollback(versionId) {
    if (!selectedDocumentId) return;
    try {
      showNotice("Creating a rollback version…");
      const data = await mutate("/api/fima-bot/content-studio/rollback", {
        guildId: byId("guildSelect").value,
        expectedStateUpdatedAt: studioState.updatedAt,
        documentId: selectedDocumentId,
        versionId
      });
      studioState.updatedAt = data.stateUpdatedAt;
      studioState.documents[data.document.id] = data.document;
      applyDocument(data.document, { saved: true });
      showNotice(`Rolled back and created version ${data.version.id}.`, "good");
    } catch (error) {
      if (error.code === "state_changed") await reloadAfterConflict();
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function reloadAfterConflict() {
    const guildId = byId("guildSelect").value;
    await loadLibrary(guildId).catch(() => {});
  }

  async function loadPreset(name) {
    try {
      const data = await api(`/api/fima-bot/content-studio/preset/${encodeURIComponent(name)}`);
      applyDocument({
        name: data.preset.name,
        current: data.preset.payload,
        source: data.preset.source,
        stage: data.preset.stage,
        importStatus: data.preset.importStatus,
        metadata: data.preset.metadata,
        originalSnapshot: data.preset.originalSnapshot,
        deliveryMode: data.preset.deliveryMode
      });
      showNotice(`${data.preset.name} verified Discord source loaded. The Original snapshot will remain immutable.`, "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  function loadFtBannerStarter(id) {
    const starter = ftBannerStarters[id];
    if (!starter) return;
    applyDocument(starter);
    showNotice(`${starter.name} loaded as an unsaved Starter Draft. Review and save it before test-guild publishing.`, "good");
  }

  async function importMessage() {
    const channelId = byId("importChannelId").value.trim();
    const messageId = byId("importMessageId").value.trim();
    if (!snowflakePattern.test(channelId) || !snowflakePattern.test(messageId)) {
      showNotice("Enter valid Discord channel and message IDs.", "bad");
      return;
    }
    try {
      showNotice("Importing a read-only copy from Discord…");
      const data = await mutate("/api/fima-bot/content-studio/import", {
        guildId: byId("guildSelect").value,
        channelId,
        messageId
      });
      applyDocument({ ...data.imported, current: data.imported.payload });
      showNotice("Discord message imported as an unsaved draft. No live message was changed.", "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function importArchiveMessage() {
    const [channelId, messageId] = byId("archiveMessage").value.split(":");
    const selected = contentArchive.records.find(record => record.channelId === channelId && record.messageId === messageId);
    if (!selected || contentArchive.guildId !== byId("guildSelect").value) {
      showNotice("Choose a message from the validated backup archive.", "bad");
      return;
    }
    try {
      byId("importArchiveMessage").disabled = true;
      showNotice("Opening a checksum-verified archive copy as an unsaved draft…");
      const data = await ownerReadOnlyPost("/api/fima-bot/content-studio/archive/import", {
        guildId: contentArchive.guildId,
        channelId,
        messageId
      });
      applyDocument({ ...data.imported, current: data.imported.payload });
      showNotice("Archived Discord content opened as an unsaved draft. No live message or stored backup was changed.", "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    } finally {
      updateArchiveImportState();
    }
  }

  async function validatePreview() {
    try {
      const data = await mutate("/api/fima-bot/content-studio/preview", {
        payload: currentPayload(),
        mode: previewMode
      });
      renderPreview(data.preview.payload);
      showNotice(`Server validation passed for ${data.preview.mode} preview.`, "good");
    } catch (error) {
      showNotice(errorMessage(error.code), "bad");
    }
  }

  async function publish() {
    if (byId("publishMessage").disabled) return;
    try {
      byId("publishMessage").disabled = true;
      showNotice("Publishing the saved version to the isolated test guild…", "warn");
      const data = await mutate("/api/fima-bot/content-studio/publish", {
        guildId: byId("guildSelect").value,
        expectedStateUpdatedAt: studioState.updatedAt,
        documentId: selectedDocumentId,
        channelId: byId("targetChannelId").value.trim(),
        messageId: byId("targetMessageId").value.trim() || null,
        confirmation: byId("publishConfirmation").value
      });
      if (data.document) {
        studioState.updatedAt = data.stateUpdatedAt;
        studioState.documents[data.document.id] = data.document;
        applyDocument(data.document, { saved: true });
      }
      const operation = data.published?.operation || "published";
      const messageId = data.published?.messageId || data.recovery?.messageId || "unknown";
      const warning = data.persistenceWarning ? " Discord changed, but local state persistence needs recovery." : "";
      showNotice(`Test-guild message ${operation}: ${messageId}.${warning}`, data.persistenceWarning ? "warn" : "good");
    } catch (error) {
      if (error.code === "state_changed") await reloadAfterConflict();
      showNotice(errorMessage(error.code), "bad");
    } finally {
      updatePublishState();
    }
  }

  function bindEvents() {
    byId("newDocument").addEventListener("click", clearEditor);
    byId("addEmbed").addEventListener("click", () => {
      addEmbedCard();
      markDirty();
    });
    byId("saveDocument").addEventListener("click", save);
    byId("importMessage").addEventListener("click", importMessage);
    byId("archiveMessage").addEventListener("change", updateArchiveImportState);
    byId("importArchiveMessage").addEventListener("click", importArchiveMessage);
    byId("validatePreview").addEventListener("click", validatePreview);
    byId("publishMessage").addEventListener("click", publish);
    byId("guildSelect").addEventListener("change", () => loadLibrary(byId("guildSelect").value).catch(error => showNotice(errorMessage(error.code), "bad")));
    byId("messageContent").addEventListener("input", updateContentCounter);
    byId("publishConfirmation").addEventListener("input", updatePublishState);
    byId("targetChannelId").addEventListener("input", updatePublishState);
    byId("contentStage").addEventListener("change", () => {
      setDirty(true);
      renderLineageStatus();
    });
    for (const button of document.querySelectorAll("[data-preset]")) button.addEventListener("click", () => loadPreset(button.dataset.preset));
    for (const button of document.querySelectorAll("[data-ft-banner-starter]")) {
      button.addEventListener("click", () => loadFtBannerStarter(button.dataset.ftBannerStarter));
    }
    for (const button of document.querySelectorAll("[data-preview-mode]")) {
      button.addEventListener("click", () => {
        previewMode = button.dataset.previewMode === "mobile" ? "mobile" : "desktop";
        renderPreview(currentPayload());
      });
    }
    studio.addEventListener("input", event => {
      const editorTarget = event.target.closest("#documentName,#deliveryMode,#contentStage,#targetChannelId,#targetMessageId,#messageContent,#embedsList");
      if (editorTarget) markDirty();
    });
    studio.addEventListener("change", event => {
      if (event.target.closest("#deliveryMode,#embedsList")) markDirty();
      if (event.target.id === "overwriteConfirmation") updatePublishState();
    });
  }

  function configurePageMode() {
    const currentPath = pageMode === "embed-builder" ? "/fima-bot/embed-builder" : "/fima-bot/content-studio";
    const encodedReturnTo = encodeURIComponent(currentPath);
    document.body.dataset.fimaContentView = pageMode;
    document.querySelectorAll("[data-content-workspace]").forEach(link => {
      const active = link.dataset.contentWorkspace === pageMode;
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    byId("loginLink").href = `/login?returnTo=${encodedReturnTo}`;
    byId("discordLink").href = `/auth/discord/start?returnTo=${encodedReturnTo}`;
    if (pageMode === "embed-builder") {
      document.title = "FIMA Embed Builder";
      document.querySelector('meta[name="description"]').content = "Compose, preview and test guarded FIMA Discord embeds without exposing webhook credentials.";
      byId("workspaceTitle").textContent = "FIMA Embed Builder";
      byId("workspaceDescription").textContent = "Compose, preview and safely test Discord embeds";
      byId("securityStrip").setAttribute("aria-label", "Embed Builder security boundaries");
      byId("workspaceFlow").textContent = "Library → Compose → Verify";
      byId("workspaceFlowDescription").textContent = "Build and preview here; publishing remains isolated to the test guild.";
    }
  }

  async function start() {
    configurePageMode();
    bindEvents();
    renderPreview(currentPayload());
    try {
      const session = await api("/api/fima-bot/session-status");
      if (!session.ownerAuthorized) {
        byId("accessGate").classList.remove("hidden");
        byId("gateReason").textContent = errorMessage(session.reasonCode);
        byId("loginLink").classList.toggle("hidden", session.authenticated);
        byId("discordLink").classList.toggle("hidden", !session.authenticated || session.discordLinked);
        showNotice("Content Studio is locked until owner identity verification succeeds.", "warn");
        return;
      }
      studio.classList.remove("hidden");
      await csrf();
      await loadLibrary();
    } catch (error) {
      byId("accessGate").classList.remove("hidden");
      byId("gateReason").textContent = errorMessage(error.code);
      showNotice(errorMessage(error.code), "bad");
    }
  }

  start();
})();
