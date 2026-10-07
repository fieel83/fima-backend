/* Dashboard presentation only. Authentication and provider actions remain in account.js. */
(() => {
  if (document.body.dataset.accountPage !== 'dashboard') return;
  const language = localStorage.getItem('fima.language') || 'en';
  const labels = {
    en: ['Home','Overview','Products','Billing','Redeem / Gift','Referrals','Downloads','Support','FIMA Dashboard','Logout'],
    tr: ['Ana sayfa','Genel bakış','Ürünler','Ödemeler','Kod / Hediye','Davetler','İndirmeler','Destek','FIMA Paneli','Çıkış yap'],
    de: ['Startseite','Übersicht','Produkte','Abrechnung','Code / Geschenk','Empfehlungen','Downloads','Support','FIMA Dashboard','Abmelden'],
    fr: ['Accueil','Aperçu','Produits','Facturation','Code / Cadeau','Parrainages','Téléchargements','Assistance','Tableau FIMA','Déconnexion'],
    bs: ['Početna','Pregled','Proizvodi','Plaćanja','Kod / Poklon','Preporuke','Preuzimanja','Podrška','FIMA panel','Odjava'],
    es: ['Inicio','Resumen','Productos','Facturación','Código / Regalo','Referidos','Descargas','Soporte','Panel FIMA','Salir'],
    pt: ['Início','Visão geral','Produtos','Faturação','Código / Presente','Indicações','Downloads','Suporte','Painel FIMA','Sair'],
    it: ['Home','Panoramica','Prodotti','Fatturazione','Codice / Regalo','Inviti','Download','Assistenza','Dashboard FIMA','Esci'],
    nl: ['Home','Overzicht','Producten','Facturering','Code / Cadeau','Verwijzingen','Downloads','Ondersteuning','FIMA-dashboard','Uitloggen'],
    pl: ['Strona główna','Przegląd','Produkty','Płatności','Kod / Prezent','Polecenia','Pobieranie','Pomoc','Panel FIMA','Wyloguj'],
    ru: ['Главная','Обзор','Продукты','Оплата','Код / Подарок','Приглашения','Загрузки','Поддержка','Панель FIMA','Выйти'],
    uk: ['Головна','Огляд','Продукти','Оплата','Код / Подарунок','Запрошення','Завантаження','Підтримка','Панель FIMA','Вийти'],
    ar: ['الرئيسية','نظرة عامة','المنتجات','الفوترة','رمز / هدية','الإحالات','التنزيلات','الدعم','لوحة FIMA','تسجيل الخروج'],
    hi: ['होम','अवलोकन','उत्पाद','भुगतान','कोड / उपहार','रेफ़रल','डाउनलोड','सहायता','FIMA डैशबोर्ड','लॉग आउट'],
    id: ['Beranda','Ringkasan','Produk','Tagihan','Kode / Hadiah','Referal','Unduhan','Bantuan','Dasbor FIMA','Keluar'],
    ja: ['ホーム','概要','製品','請求','コード / ギフト','紹介','ダウンロード','サポート','FIMA ダッシュボード','ログアウト'],
    ko: ['홈','개요','제품','결제','코드 / 선물','추천','다운로드','지원','FIMA 대시보드','로그아웃'],
    zh: ['首页','概览','产品','账单','兑换 / 礼物','推荐','下载','支持','FIMA 控制台','退出'],
    ro: ['Acasă','Prezentare','Produse','Facturare','Cod / Cadou','Recomandări','Descărcări','Asistență','Panou FIMA','Deconectare'],
    sr: ['Početna','Pregled','Proizvodi','Plaćanja','Kod / Poklon','Preporuke','Preuzimanja','Podrška','FIMA panel','Odjava']
  };
  const selected = labels[language] || labels.en;
  document.querySelectorAll('.account-dashboard-nav a span').forEach((node,index) => { node.textContent = selected[index]; });
  const signout = document.querySelector('.dashboard-signout');
  if (signout) signout.textContent = selected[9];
  // Secondary descriptions repeat the label outside English; omit them rather
  // than introducing a second language into navigation.
  if (language !== 'en') document.querySelectorAll('.account-dashboard-nav small').forEach(node => { node.hidden = true; });
  const keepNavigation = () => {
    const signout = document.querySelector('.dashboard-signout');
    if (signout && signout.textContent !== selected[9]) signout.textContent = selected[9];
  };
  new MutationObserver(keepNavigation).observe(document.querySelector('.account-dashboard-sidebar'), { childList:true, subtree:true });
  if (language !== 'tr') return;
  const copy = {
    'Dashboard': 'Hesap paneli',
    'FIMA ACCOUNT': 'FIMA HESABI',
    'Manage your recovery options and community preferences.': 'Hesap kurtarma seçeneklerini ve topluluk tercihlerini yönet.',
    'View your licenses, status and download actions without exposing full keys.': 'Lisanslarını, erişim durumunu ve indirme seçeneklerini görüntüle.',
    'Buy another license': 'Yeni lisans al',
    'Products': 'Ürünler',
    'Billing': 'Ödemeler',
    'My Products': 'Ürünlerim',
    'Downloads': 'İndirmeler',
    'Get Fima Macro': 'FIMA Macro indir',
    'Download the latest FIMA Macro installer or portable ZIP.': 'Güncel FIMA Macro kurulum dosyasını veya taşınabilir ZIP paketini indir.',
    'Download installer': 'Kurulum dosyasını indir',
    'Download ZIP': 'ZIP indir',
    'Support': 'Destek',
    'Need help?': 'Yardıma mı ihtiyacın var?',
    'Open a ticket for license, payment, HWID, account, or app problems. Do not share full keys publicly.': 'Lisans, ödeme, cihaz, hesap veya uygulama sorunları için destek talebi aç. Lisans anahtarını herkese açık paylaşma.',
    'Open support': 'Destek talebi aç',
    'Security and trust': 'Güvenlik ve güven',
    'FIMA is the secure account, product and support hub for FIMA Macro, FIMA AI and FIMA Bot.': 'FIMA Macro, FIMA AI ve FIMA Bot için hesap, ürün ve destek merkezi.',
    'Kullanici adi': 'Kullanıcı adı',
    'Manage your profile, recovery, linked accounts and community reward eligibility from this overview.': 'Profilini, bağlı hesaplarını ve hesap güvenliğini buradan yönet.',
    'Security / Settings': 'Güvenlik / Ayarlar',
    'Account Links': 'Hesap bağlantıları',
    'View Activity Rewards': 'Topluluk ödüllerini gör',
    'Every month, the Top 3 text and Top 3 voice members earn 15, 10 and 7 days of FIMA Macro access; rewards can stack. Each verified active server boost adds 3 days for that month.': 'Her ay yazılı ve sesli etkinlikte ilk üç üye 15, 10 ve 7 gün FIMA Macro erişimi kazanır. Ödüller birikir. Doğrulanmış her aktif sunucu takviyesi o ay için 3 gün ekler.',
    'This Discord account is used for community identity, membership checks, language roles and optional recovery.': 'Bu Discord hesabı topluluk kimliği, üyelik kontrolü, dil rolleri ve isteğe bağlı hesap kurtarma için kullanılır.',
    'Connect Discord to verify community membership and synchronize your language role.': 'Topluluk üyeliğini doğrulamak ve dil rolünü eşitlemek için Discord hesabını bağla.',
    'Test recovery DM': 'Kurtarma mesajını dene',
    'Primary community identity, membership and language-role connection. Recovery remains optional.': 'Topluluk kimliği, üyelik ve dil rolü bağlantısı. Hesap kurtarma isteğe bağlıdır.',
    'Reconnect Discord to load the server list.': 'Sunucu listesini görmek için Discord bağlantısını yenile.',
    'Loading...': 'Yükleniyor…'
  };
  const translate = () => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement.closest('script,style,input,textarea,code,[data-profile-avatar]')) continue;
      const replacement = copy[node.textContent.trim()];
      if (replacement) node.textContent = replacement;
    }
  };
  translate();
  // Dynamic account cards arrive after the initial authenticated request.
  const observer = new MutationObserver(translate);
  observer.observe(document.querySelector('.account-dashboard-content'), { childList:true, subtree:true });
})();
