(() => {
  const tr = localStorage.getItem('fima.language') === 'tr';
  const text = (selector, value) => { const node = document.querySelector(selector); if (node) node.textContent = value; };
  document.addEventListener('DOMContentLoaded', () => {
    const register = document.body.dataset.accountPage === 'register';
    const copy = tr ? {
      google: 'Google ile devam et', discord: 'Discord ile devam et', roblox: 'Roblox profilini bağla',
      linkNote: 'Hesabın varsa önce giriş yap, ardından hesaplarını ayarlardan bağla. Hesaplar otomatik birleştirilmez.',
      divider: 'veya FIMA hesabınla devam et', referral: 'Davet kodun var mı?'
    } : { google: 'Continue with Google', discord: 'Continue with Discord', roblox: 'Link your Roblox profile',
      linkNote: 'Have an account? Sign in first, then link providers in settings. Accounts are never merged automatically.',
      divider: 'or use your FIMA account', referral: 'Have an invite code?' };
    for (const [key, value] of Object.entries(copy)) text(`[data-auth-copy="${key}"]`, value);
    document.documentElement.lang = tr ? 'tr' : 'en';
    text('.eyebrow', tr ? 'FIMA HESABI' : 'FIMA ACCOUNT');
    text('h1', tr ? (register ? 'FIMA’ya hoş geldin.' : 'Tekrar hoş geldin.') : (register ? 'Your FIMA journey starts here.' : 'Welcome back to FIMA.'));
    text('.auth-intro > div > p:not(.eyebrow)', tr ? 'Uygulamaların, lisansların ve bağlı hesapların. Hepsi tek bir yerde.' : 'Your apps, licenses and connected accounts. All in one place.');
    const steps = tr ? [['Hesabına giriş yap', 'Google, Discord veya FIMA hesabını kullan'], ['Ürünlerine ulaş', 'Lisanslarını ve indirmelerini yönet'], ['Hub ile devam et', 'Macro’yu bilgisayarında kolayca aç']] : [['One account', 'Sign in with Google, Discord or FIMA'], ['Your products', 'Manage licenses and downloads'], ['Ready for the Hub', 'Open Macro on your desktop']];
    document.querySelectorAll('.auth-steps > div').forEach((node, index) => { node.querySelector('strong').textContent = steps[index][0]; node.querySelector('small').textContent = steps[index][1]; });
    document.querySelectorAll('.auth-tabs a').forEach(node => { node.textContent = new URL(node.href).pathname === '/login' ? (tr ? 'Giriş yap' : 'Sign in') : (tr ? 'Hesap oluştur' : 'Create account'); });
    const labels = tr ? {login:'Kullanıcı adı veya e-posta',username:'Kullanıcı adı',password:'Şifre',confirmPassword:'Şifreyi doğrula',referralCode:'Davet kodu (isteğe bağlı)'} : {login:'Username or email',username:'Username',password:'Password',confirmPassword:'Confirm password',referralCode:'Invite code (optional)'};
    const placeholders = tr ? {login:'Kullanıcı adı veya e-posta',username:'Bir kullanıcı adı seç',password:register?'En az 8 karakter':'Şifreni gir',confirmPassword:'Şifreni tekrar gir',referralCode:'Davet kodunu gir'} : {login:'Your username or email',username:'Choose a username',password:register?'At least 8 characters':'Enter your password',confirmPassword:'Repeat your password',referralCode:'Enter your invite code'};
    for (const [name, value] of Object.entries(labels)) { const input = document.querySelector(`input[name="${name}"]`); if (!input) continue; const label = input.closest('label'); const node = Array.from(label.childNodes).find(n => n.nodeType === Node.TEXT_NODE); if (node) node.nodeValue = value; input.placeholder = placeholders[name]; }
    text('.recovery-warning', tr ? 'Şifreni kurtarabilmek için kayıt sonrası Discord hesabını bağla.' : 'Link Discord after signing up to enable password recovery.');
    text("a[href='/forgot-password']", tr ? 'Şifreni mi unuttun?' : 'Forgot your password?');
    const switchNode = document.querySelector('.auth-switch');
    if (switchNode) { switchNode.firstChild.textContent = register ? (tr ? 'Zaten hesabın var mı? ' : 'Already have an account? ') : (tr ? 'FIMA’da yeni misin? ' : 'New to FIMA? '); switchNode.querySelector('a').textContent = register ? (tr ? 'Giriş yap' : 'Sign in') : (tr ? 'Hesap oluştur' : 'Create account'); }
    if (tr) {
      const help = document.querySelector('.roblox-link-help');
      help.querySelectorAll('p')[0].textContent = 'Önce FIMA hesabına giriş yap. Ardından hesap ayarlarından Roblox profilini bağla.';
      const items = ['Roblox kullanıcı adını gir.', 'Doğrulama kodunu Roblox profilinin About / Bio alanına ekle.', 'FIMA’ya dön ve profil kodunu doğrula.'];
      help.querySelectorAll('li').forEach((li,i) => li.textContent = items[i]);
      help.querySelectorAll('p')[1].textContent = 'Roblox şifren istenmez. Profil doğrulaması hesabını bağlar; tek başına giriş yapmanı sağlamaz.';
    }
    text('.account-footer', tr ? 'FIMA Macro, FIMA AI ve FIMA Bot için tek hesap.' : 'One account for FIMA Macro, FIMA AI and FIMA Bot.');
    if (new URLSearchParams(location.search).has('ref')) document.querySelector('.referral-options')?.setAttribute('open','');
  });
})();
