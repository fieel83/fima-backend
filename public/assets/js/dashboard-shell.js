/* Dashboard presentation only. Authentication and provider actions remain in account.js. */
(() => {
  if (document.body.dataset.accountPage !== 'dashboard') return;
  const language = localStorage.getItem('fima.language') || 'en';
  const labels = {
    en: ['Home','Overview','Products','Billing','Redeem / Gift','Referrals','Downloads','Support','Paradise Dashboard','Logout'],
    tr: ['Ana sayfa','Genel bakış','Ürünler','Ödemeler','Kod / Hediye','Davetler','İndirmeler','Destek','Paradise Paneli','Çıkış yap'],
    de: ['Startseite','Übersicht','Produkte','Abrechnung','Code / Geschenk','Empfehlungen','Downloads','Support','Paradise Dashboard','Abmelden'],
    fr: ['Accueil','Aperçu','Produits','Facturation','Code / Cadeau','Parrainages','Téléchargements','Assistance','Tableau Paradise','Déconnexion'],
    bs: ['Početna','Pregled','Proizvodi','Plaćanja','Kod / Poklon','Preporuke','Preuzimanja','Podrška','Paradise panel','Odjava'],
    es: ['Inicio','Resumen','Productos','Facturación','Código / Regalo','Referidos','Descargas','Soporte','Panel Paradise','Salir'],
    pt: ['Início','Visão geral','Produtos','Faturação','Código / Presente','Indicações','Downloads','Suporte','Painel Paradise','Sair'],
    it: ['Home','Panoramica','Prodotti','Fatturazione','Codice / Regalo','Inviti','Download','Assistenza','Dashboard Paradise','Esci'],
    nl: ['Home','Overzicht','Producten','Facturering','Code / Cadeau','Verwijzingen','Downloads','Ondersteuning','Paradise-dashboard','Uitloggen'],
    pl: ['Strona główna','Przegląd','Produkty','Płatności','Kod / Prezent','Polecenia','Pobieranie','Pomoc','Panel Paradise','Wyloguj'],
    ru: ['Главная','Обзор','Продукты','Оплата','Код / Подарок','Приглашения','Загрузки','Поддержка','Панель Paradise','Выйти'],
    uk: ['Головна','Огляд','Продукти','Оплата','Код / Подарунок','Запрошення','Завантаження','Підтримка','Панель Paradise','Вийти'],
    ar: ['الرئيسية','نظرة عامة','المنتجات','الفوترة','رمز / هدية','الإحالات','التنزيلات','الدعم','لوحة Paradise','تسجيل الخروج'],
    hi: ['होम','अवलोकन','उत्पाद','भुगतान','कोड / उपहार','रेफ़रल','डाउनलोड','सहायता','Paradise डैशबोर्ड','लॉग आउट'],
    id: ['Beranda','Ringkasan','Produk','Tagihan','Kode / Hadiah','Referal','Unduhan','Bantuan','Dasbor Paradise','Keluar'],
    ja: ['ホーム','概要','製品','請求','コード / ギフト','紹介','ダウンロード','サポート','Paradise ダッシュボード','ログアウト'],
    ko: ['홈','개요','제품','결제','코드 / 선물','추천','다운로드','지원','Paradise 대시보드','로그아웃'],
    zh: ['首页','概览','产品','账单','兑换 / 礼物','推荐','下载','支持','Paradise 控制台','退出'],
    ro: ['Acasă','Prezentare','Produse','Facturare','Cod / Cadou','Recomandări','Descărcări','Asistență','Panou Paradise','Deconectare'],
    sr: ['Početna','Pregled','Proizvodi','Plaćanja','Kod / Poklon','Preporuke','Preuzimanja','Podrška','Paradise panel','Odjava']
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
    const walker = document.createTreeWalker(document.querySelector('.account-shell'), NodeFilter.SHOW_TEXT);
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
