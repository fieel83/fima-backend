(() => {
  const apiBase = String(window.FIMA_API_BASE_URL || "https://api.fimamacro.com").replace(/\/+$/, "");
  const publicSetupUrl = "https://github.com/fieel83/fima-macro-releases/releases/download/v1.0.130/FIMA.MACRO.Setup.exe";
  const page = document.body.dataset.accountPage || "";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const language = () => localStorage.getItem("fima.language") || "en";
  const dashboardRoutes = {
    overview: "/dashboard/overview",
    products: "/dashboard/products",
    billing: "/dashboard/billing",
    redeem: "/dashboard/redeem",
    gifts: "/dashboard/gifts",
    referrals: "/dashboard/referrals",
    "connected-accounts": "/dashboard/connected-accounts",
    security: "/dashboard/security",
    downloads: "/dashboard/downloads",
    support: "/dashboard/support",
    settings: "/dashboard/settings"
  };
  const dashboardRoute = (name) => dashboardRoutes[name] || dashboardRoutes.overview;
  const dashboardSectionFromLocation = () => {
    const pathMatch = location.pathname.match(/^\/dashboard\/([^/]+)\/?$/i);
    if (pathMatch) return pathMatch[1].toLowerCase();
    const hash = location.hash.replace(/^#/, "").trim().toLowerCase();
    return ({
      "gift-access": "redeem",
      "purchased-gifts": "gifts",
      "monthly-trial": "redeem"
    }[hash] || hash || "overview");
  };

  const copy = {
    "en": {
        "working": "Working...",
        "loadingProducts": "Loading products...",
        "noProducts": "No account products yet. Buy a license and it will appear here with the key.",
        "noStoreProducts": "No account-store products are active yet. Use the pricing page for license plans.",
        "buyPricing": "Buy Now",
        "copied": "Copied.",
        "downloadReady": "Opening download...",
        "extend": "Extend",
        "renew": "Renew",
        "copyKey": "Copy key",
        "download": "Download",
        "active": "Active",
        "expired": "Expired",
        "lifetime": "Never expires",
        "expires": "Expires",
        "remaining": "Time left",
        "email": "Email",
        "stripeCustomer": "Stripe Customer",
        "roblox": "Roblox",
        "noRoblox": "Not linked",
        "checkout": "Creating Stripe Checkout...",
        "robloxLookup": "Checking Roblox profile...",
        "robloxNotFound": "Roblox user was not found.",
        "invalidEmail": "Enter a valid email address or leave the optional email field empty.",
        "invalidUsername": "Choose a username between 3 and 32 characters.",
        "invalidRoblox": "Enter a valid Roblox username or leave it empty.",
        "weakPassword": "Password must be at least 8 characters.",
        "registered": "Account created. Redirecting...",
        "loggedIn": "Logged in. Redirecting...",
        "purchaseProcessing": "Payment is still processing. Checking again...",
        "purchaseComplete": "Payment complete.",
        "openMyProducts": "Open My Products",
        "resetGeneric": "If that Fima account has linked Discord recovery, the bot will DM a reset code.",
        "resetCodeSent": "A reset code was sent to your linked Discord DM.",
        "resetEmailFailed": "Discord recovery could not send a reset code. Contact support if this keeps happening.",
        "discordNotLinkedRecovery": "This account has no linked Discord recovery. Contact support so an admin can verify ownership.",
        "discordDmBlocked": "The Fima bot could not DM you. Enable DMs from server members or use the Discord server recovery command.",
        "discordBotOffline": "Discord recovery is temporarily unavailable because the Fima bot is not online.",
        "passwordMismatch": "Passwords do not match.",
        "resetComplete": "Password reset complete. Redirecting...",
        "confirmPassword": "Confirm password",
        "passwordStrength": "Password strength",
        "networkError": "Could not reach the Fima API. Refresh the page or try again in a moment.",
        "saleTitle": "Current plans",
        "saleText": "Current public products are Free Trial, 3 Days Access, Monthly Subscription and Lifetime.",
        "saleEnds": "Sale ends in",
        "licenseKey": "License key",
        "maskedLicenseKey": "Masked license key",
        "plan": "Plan",
        "status": "Status",
        "subscription": "Subscription",
        "hwid": "HWID",
        "bound": "Bound",
        "unbound": "Not bound yet",
        "yes": "Yes",
        "no": "No",
        "needsSupport": "This license needs help. Open a ticket and we will check it.",
        "openSupport": "Open support",
        "purchased": "Purchased",
        "licenseAccess": "License access",
        "productAccess": "Product access",
        "emailAlreadyRegistered": "Email already registered.",
        "invalidCredentials": "Invalid username or password.",
        "unauthorized": "Please log in again.",
        "checkoutDisabled": "Checkout is disabled right now.",
        "licenseNotFound": "License was not found on this account.",
        "licenseBanned": "This license is banned.",
        "storeNav": "Store",
        "loginNav": "Login",
        "logoutNav": "Logout",
        "dashboardNav": "Account",
        "myProductsNav": "My Products",
        "registerEyebrow": "Fima Account",
        "registerTitle": "Create your Fima account.",
        "registerIntro": "Create an account with only a username and password. You can link Discord later for account recovery or free trial.",
        "robloxUsername": "Roblox username",
        "password": "Password",
        "registerButton": "Register",
        "loginTitle": "Get back into Fima.",
        "loginIntro": "Sign in with your Fima username.",
        "loginButton": "Login",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Set a new password.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Update password",
        "token": "Reset code",
        "newPassword": "New password",
        "dashboardEyebrow": "Account dashboard",
        "dashboardTitle": "Your Fima account.",
        "myProductsEyebrow": "My Products",
        "myProductsTitle": "Purchased products.",
        "storeEyebrow": "Product store",
        "storeTitle": "Fima store.",
        "storeIntro": "Buy products with Stripe checkout and link them to your account.",
        "paymentSuccessTitle": "Payment complete.",
        "paymentCancelledTitle": "Payment cancelled.",
        "total": "Total",
        "product": "Product",
        "willBeCreated": "Will be created before checkout",
        "noLicenses": "No licenses on this account yet.",
        "productLinked": "Your product is now linked to your Fima account.",
        "paymentCheckFailed": "Could not check payment.",
        "paymentReceived": "Payment received.",
        "purchaseStillProcessing": "Your purchase is still processing. Contact support if it does not appear soon.",
        "buyWithStripe": "Buy with Stripe",
        "giftSystemEyebrow": "Gift system",
        "giftSystemTitle": "Gift a license",
        "giftSystemIntro": "Search registered Fima users before buying a license for someone else.",
        "giftAccessEyebrow": "Gift access",
        "giftAccessTitle": "Claim gift access",
        "giftAccessIntro": "Redeem a gift code or claim an admin-sent package from your Fima account. Roblox is optional on the website.",
        "giftCodeTitle": "Redeem gift code",
        "giftCodeIntro": "Gift codes are one-time access cards. Full license keys are created only after a valid claim.",
        "giftCodePlaceholder": "FIMA-GIFT-XXXX-XXXX",
        "redeemGiftCode": "Redeem gift code",
        "pendingDirectGifts": "Pending admin gifts",
        "noPendingGifts": "No pending gift packages.",
        "claimGift": "Claim gift",
        "giftClaimed": "Gift claimed. License added to My Products.",
        "purchasedGiftCodes": "Purchased Gift Codes",
        "giftHistory": "Gift History",
        "noPurchasedGiftCodes": "No purchased gift codes yet.",
        "noGiftHistory": "No gift history yet.",
        "copyGiftCode": "Copy Gift Code",
        "giftCodeCreated": "Gift Code Created",
        "giftStartsOnRedeem": "License time starts only when the code is redeemed.",
        "giftRedeemedTitle": "Gift Redeemed",
        "giftRedeemedText": "Your new app license key is ready. Copy it and use it in the Fima App.",
        "newLicenseKey": "Your new app license key",
        "copyLicenseKey": "Copy License Key",
        "unusedGiftCode": "Unused",
        "usedGiftCode": "Used",
        "revokedGiftCode": "Revoked",
        "giftShownOnceOnly": "This code can only be shown once. Keep your copied code safe.",
        "downloadApp": "Download App",
        "close": "OK",
        "giftRequirements": "Requires only Fima login. Discord, email and Roblox are optional on the website.",
        "buyNowNav": "Buy Now",
        "billingNav": "Subscription / Billing",
        "redeemGiftNav": "Redeem Gift Code",
        "purchasedGiftCodesNav": "Purchased Gift Codes",
        "accountSettingsNav": "Account Settings",
        "supportNav": "Support",
        "recoveryNotLinked": "Recovery not linked",
        "linkDiscordRecovery": "Link Discord",
        "noActiveSubscription": "No active subscription",
        "giftExpired": "This gift is expired or revoked.",
        "giftAlreadyRedeemed": "This gift code was already redeemed.",
        "giftCodeNotFound": "Gift code was not found.",
        "giftSearchPlaceholder": "Search by email, Discord, or Roblox",
        "giftSearchHint": "Recipient search works only for logged-in users and shows masked private data.",
        "giftSearchEmpty": "No registered user found.",
        "giftSearchStart": "Type at least 2 characters to search.",
        "giftSearchLoading": "Searching recipients...",
        "giftSearchFailed": "Recipient search failed.",
        "chooseRecipient": "Select recipient",
        "giftCheckoutSoon": "Gift checkout will use the selected registered account.",
        "selectedGiftRecipient": "Selected gift recipient",
        "giftRecipientReady": "Recipient selected. Choose the access plan to buy for this user.",
        "giftBuy1day": "Gift Free Trial",
        "giftBuy3days": "Gift 3 Days",
        "giftBuyMonthly": "Gift Monthly",
        "giftBuyLifetime": "Gift Lifetime",
        "changeGiftRecipient": "Change recipient",
        "accountNavProfileFallback": "Fima account",
        "connectedAccounts": "Discord recovery and optional profile",
        "accountLinksEyebrow": "Account links",
        "discord": "Discord",
        "notConnected": "Not connected",
        "connected": "Connected",
        "connectDiscord": "Connect Discord",
        "disconnectDiscord": "Disconnect Discord",
        "reconnectDiscord": "Reconnect Discord",
        "connectRoblox": "Verify Roblox",
        "disconnectRoblox": "Clear Roblox",
        "reconnectRoblox": "Verify again",
        "robloxProfileNote": "Roblox verification proves this profile is yours. Put the FIMA code in your Roblox About/Description, then confirm.",
        "saveRobloxUsername": "Start verification",
        "clearRobloxUsername": "Clear Roblox",
        "robloxVerified": "Roblox verified",
        "robloxPending": "Verification pending",
        "robloxVerifyIntro": "Enter your Roblox username. We will give you a FIMA verification code to place in your Roblox profile About/Description.",
        "robloxVerifyInstructions": "Copy this FIMAVERIFY code into your Roblox profile About/Description, save it, then press Confirm verification.",
        "copyVerifyCode": "Copy code",
        "confirmRobloxVerification": "Confirm verification",
        "openRobloxProfile": "Open Roblox profile",
        "profileSaved": "Profile saved.",
        "freeMonthlyTrial": "Free Monthly Trial",
        "freeTrialEyebrow": "Free trial",
        "trialIntro": "Claim one free trial after linking Discord and verifying your Roblox profile.",
        "trialRequirements": "Free Monthly Trial Requirements",
        "accountLoggedIn": "Fima account logged in",
        "discordConnected": "Discord connected",
        "robloxConnected": "Roblox verified",
        "claimTrial": "Claim Free Trial",
        "trialActive": "Trial active",
        "trialAvailable": "Trial available",
        "trialLocked": "Trial locked",
        "trialCooldown": "Trial cooldown",
        "nextTrial": "Next free trial",
        "connectDiscordTrial": "Connect Discord to unlock your free trial.",
        "connectRobloxTrial": "Verify your Roblox profile to unlock your free trial.",
        "trialClaimed": "Free trial claimed. Your Trial role is being synced.",
        "trialReadyTitle": "Your trial key is ready",
        "trialReadyText": "Copy your license key, then open Fima and activate it on the key screen.",
        "trialReadyPrivacy": "For privacy, screenshots and reports show the masked key only. The Copy button copies the full key for this signed-in account.",
        "trialAlreadyActive": "You already have an active monthly trial.",
        "trialCooldownActive": "Your monthly trial cooldown is still active.",
        "discordNotConnected": "Discord is only required for the free trial or optional recovery.",
        "robloxNotConnected": "Roblox is optional and never blocks website access.",
        "disconnectConfirm": "Disconnect this account link?",
        "openConnect": "Open connect",
        "requirementsComplete": "All requirements complete.",
        "emailVerificationEyebrow": "Account Recovery",
        "emailVerificationTitle": "Email recovery",
        "emailVerificationIntro": "Email is optional. Link and verify it if you want password reset codes by email.",
        "emailVerified": "Email verified",
        "emailNotVerified": "Email not verified",
        "addEmail": "Add email",
        "emailLinkIntro": "Add an email if you want email recovery too.",
        "emailPlaceholder": "Email address",
        "sendVerificationCode": "Send verification code",
        "confirmVerificationCode": "Confirm code",
        "verificationCode": "6-digit code",
        "verificationSent": "Verification code sent if email delivery is configured.",
        "verificationSendFailed": "Verification email could not be sent. Contact support if it keeps happening.",
        "verificationComplete": "Email verified. Referral status updated.",
        "invalidVerificationCode": "Enter the 6-digit verification code.",
        "invalidOrExpiredVerificationCode": "Verification code is invalid or expired.",
        "referralCode": "Referral code",
        "referralOptional": "Optional invite code",
        "referralPrefilled": "Invite code loaded. Discord or Roblox is not required unless the reward is a free trial.",
        "referralRewardsEyebrow": "Invite Rewards",
        "referralRewardsTitle": "Referral rewards",
        "referralRewardsIntro": "Invite real users. Referral rewards do not require Roblox; free trial rewards may require Discord.",
        "yourReferralCode": "Your invite code",
        "yourReferralLink": "Your invite link",
        "copyReferralCode": "Copy code",
        "copyReferralLink": "Copy link",
        "referralProgress": "Reward progress",
        "verifiedInvites": "Verified invites",
        "pendingInvites": "Pending invites",
        "rejectedInvites": "Rejected",
        "flaggedInvites": "Review",
        "earnedRewards": "Earned rewards",
        "nextReward": "Next reward",
        "referralsRemaining": "verified invites left",
        "referralApplyTitle": "Were you invited?",
        "referralApplyIntro": "Optional invite/referral code. It does not require Discord or Roblox unless the reward is a free trial.",
        "applyReferral": "Apply code",
        "referralApplied": "Referral code applied.",
        "invalidReferralCode": "Referral code was not found.",
        "referralAlreadyUsed": "This account already used a referral code.",
        "selfReferralNotAllowed": "You cannot use your own referral code.",
        "recentInvites": "Recent invites",
        "noReferralsYet": "No referrals yet. Share your link with friends.",
        "incomingReferral": "Incoming referral",
        "rewardRule": "3 verified invites = 7 days free access"
    },
    "tr": {
        "working": "\u00c7al\u0131\u015f\u0131yor...",
        "loadingProducts": "\u00dcr\u00fcnler y\u00fckleniyor...",
        "noProducts": "Hen\u00fcz hesap \u00fcr\u00fcn\u00fc yok. Lisans al\u0131nca key ile birlikte burada g\u00f6r\u00fcnecek.",
        "noStoreProducts": "Hesap ma\u011fazas\u0131nda aktif \u00fcr\u00fcn yok. Lisans planlar\u0131 i\u00e7in fiyatlar sayfas\u0131n\u0131 kullan.",
        "buyPricing": "Sat\u0131n al",
        "copied": "Kopyaland\u0131.",
        "downloadReady": "\u0130ndirme a\u00e7\u0131l\u0131yor...",
        "extend": "Uzat",
        "renew": "Yenile",
        "copyKey": "Keyi kopyala",
        "download": "\u0130ndir",
        "active": "Aktif",
        "expired": "S\u00fcresi bitti",
        "lifetime": "S\u00fcresiz",
        "expires": "Biti\u015f",
        "remaining": "Kalan s\u00fcre",
        "email": "E-posta",
        "stripeCustomer": "Stripe m\u00fc\u015fteri",
        "roblox": "Roblox",
        "noRoblox": "Ba\u011fl\u0131 de\u011fil",
        "checkout": "Stripe Checkout olu\u015fturuluyor...",
        "robloxLookup": "Roblox profili kontrol ediliyor...",
        "robloxNotFound": "Roblox kullan\u0131c\u0131s\u0131 bulunamad\u0131.",
        "invalidEmail": "Ge\u00e7erli bir e-posta gir veya opsiyonel e-posta alan\u0131n\u0131 bo\u015f b\u0131rak.",
        "invalidUsername": "3-32 karakter aras\u0131 bir kullan\u0131c\u0131 ad\u0131 se\u00e7.",
        "invalidRoblox": "Ge\u00e7erli Roblox kullan\u0131c\u0131 ad\u0131 gir veya bo\u015f b\u0131rak.",
        "weakPassword": "\u015eifre en az 8 karakter olmal\u0131.",
        "registered": "Hesap olu\u015fturuldu. Y\u00f6nlendiriliyor...",
        "loggedIn": "Giri\u015f yap\u0131ld\u0131. Y\u00f6nlendiriliyor...",
        "purchaseProcessing": "\u00d6deme i\u015fleniyor. Tekrar kontrol ediliyor...",
        "purchaseComplete": "\u00d6deme tamamland\u0131.",
        "openMyProducts": "\u00dcr\u00fcnlerimi a\u00e7",
        "resetGeneric": "Bu Fima hesab\u0131nda Discord recovery ba\u011fl\u0131ysa bot DM ile reset kodu g\u00f6nderecek.",
        "resetCodeSent": "Reset kodu ba\u011fl\u0131 Discord DM kutuna g\u00f6nderildi.",
        "resetEmailFailed": "Discord recovery reset kodu g\u00f6nderemedi. Devam ederse destekle ileti\u015fime ge\u00e7.",
        "discordNotLinkedRecovery": "Bu hesapta Discord recovery ba\u011fl\u0131 de\u011fil. Sahipli\u011fi do\u011frulamak i\u00e7in destekle ileti\u015fime ge\u00e7.",
        "discordDmBlocked": "Fima bot sana DM atamad\u0131. Sunucu \u00fcyelerinden DM almay\u0131 a\u00e7 veya Discord sunucusundaki recovery komutunu kullan.",
        "discordBotOffline": "Discord recovery ge\u00e7ici olarak kullan\u0131lam\u0131yor; Fima bot online de\u011fil.",
        "passwordMismatch": "\u015eifreler ayn\u0131 de\u011fil.",
        "resetComplete": "\u015eifre s\u0131f\u0131rland\u0131. Y\u00f6nlendiriliyor...",
        "confirmPassword": "\u015eifreyi onayla",
        "passwordStrength": "\u015eifre g\u00fcc\u00fc",
        "networkError": "Fima API'ye ula\u015f\u0131lamad\u0131. Sayfay\u0131 yenile veya biraz sonra tekrar dene.",
        "saleTitle": "S\u0131n\u0131rl\u0131 lansman indirimi",
        "saleText": "Sureli planlarda %25 lansman indirimi. Lifetime sabit kalir.",
        "saleEnds": "\u0130ndirimin bitmesine",
        "licenseKey": "Lisans keyi",
        "plan": "Plan",
        "status": "Durum",
        "purchased": "Sat\u0131n alma",
        "licenseAccess": "Lisans eri\u015fimi",
        "productAccess": "\u00dcr\u00fcn eri\u015fimi",
        "emailAlreadyRegistered": "Bu e-posta zaten kay\u0131tl\u0131.",
        "invalidCredentials": "Kullan\u0131c\u0131 ad\u0131/e-posta veya \u015fifre hatal\u0131.",
        "unauthorized": "L\u00fctfen tekrar giri\u015f yap.",
        "checkoutDisabled": "Checkout \u015fu an kapal\u0131.",
        "licenseNotFound": "Bu hesapta lisans bulunamad\u0131.",
        "licenseBanned": "Bu lisans banlanm\u0131\u015f.",
        "storeNav": "Ma\u011faza",
        "loginNav": "Giri\u015f",
        "logoutNav": "\u00c7\u0131k\u0131\u015f",
        "dashboardNav": "Hesap",
        "myProductsNav": "\u00dcr\u00fcnlerim",
        "registerEyebrow": "Fima Hesab\u0131",
        "registerTitle": "Hesab\u0131n\u0131 olu\u015ftur.",
        "registerIntro": "Sadece kullan\u0131c\u0131 ad\u0131 ve \u015fifreyle hesap olu\u015ftur. Discord'u daha sonra hesap kurtarma veya free trial i\u00e7in ba\u011flayabilirsin.",
        "robloxUsername": "Roblox kullan\u0131c\u0131 ad\u0131",
        "password": "\u015eifre",
        "registerButton": "Kay\u0131t ol",
        "loginTitle": "Giri\u015f yap.",
        "loginIntro": "Fima kullan\u0131c\u0131 ad\u0131nla giri\u015f yap.",
        "loginButton": "Giri\u015f yap",
        "forgotTitle": "Discord ile s\u0131f\u0131rla.",
        "forgotIntro": "Fima kullan\u0131c\u0131 ad\u0131n\u0131 gir. Discord recovery ba\u011fl\u0131ysa Fima bot DM ile tek kullan\u0131ml\u0131k reset kodu g\u00f6nderir.",
        "forgotButton": "Discord kodu g\u00f6nder",
        "resetTitle": "Yeni \u015fifre belirle.",
        "resetIntro": "Fima Discord botundan gelen reset kodunu yap\u0131\u015ft\u0131r ve yeni \u015fifreni se\u00e7.",
        "resetButton": "\u015eifreyi g\u00fcncelle",
        "token": "Reset kodu",
        "newPassword": "Yeni \u015fifre",
        "dashboardEyebrow": "Hesap dashboard",
        "dashboardTitle": "Fima hesab\u0131n.",
        "myProductsEyebrow": "\u00dcr\u00fcnlerim",
        "myProductsTitle": "Sat\u0131n al\u0131nan \u00fcr\u00fcnler.",
        "storeEyebrow": "\u00dcr\u00fcn ma\u011fazas\u0131",
        "storeTitle": "Fima ma\u011fazas\u0131.",
        "storeIntro": "\u00dcr\u00fcnleri Stripe checkout ile al ve hesab\u0131na ba\u011fla.",
        "paymentSuccessTitle": "\u00d6deme tamamland\u0131.",
        "paymentCancelledTitle": "\u00d6deme iptal edildi.",
        "total": "Toplam",
        "product": "\u00dcr\u00fcn",
        "willBeCreated": "Checkout \u00f6ncesi olu\u015fturulacak",
        "noLicenses": "Bu e-postaya ba\u011fl\u0131 lisans yok.",
        "productLinked": "\u00dcr\u00fcn art\u0131k Fima hesab\u0131na ba\u011fl\u0131.",
        "paymentCheckFailed": "\u00d6deme kontrol edilemedi.",
        "paymentReceived": "\u00d6deme al\u0131nd\u0131.",
        "purchaseStillProcessing": "Sat\u0131n alma hala i\u015fleniyor. Yak\u0131nda g\u00f6r\u00fcnmezse deste\u011fe yaz.",
        "buyWithStripe": "Stripe ile sat\u0131n al",
        "giftSystemEyebrow": "Hediye sistemi",
        "giftSystemTitle": "Lisans hediye et",
        "giftSystemIntro": "Ba\u015fkas\u0131na lisans almadan \u00f6nce kay\u0131tl\u0131 Fima kullan\u0131c\u0131s\u0131n\u0131 ara.",
        "giftAccessEyebrow": "Hediye eri\u015fimi",
        "giftAccessTitle": "Hediyeyi claim et",
        "giftAccessIntro": "Fima hesab\u0131ndan hediye kodunu veya adminin g\u00f6nderdi\u011fi paketi kullan. Roblox web sitesinde opsiyoneldir.",
        "giftCodeTitle": "Hediye kodu kullan",
        "giftCodeIntro": "Hediye kodlar\u0131 tek kullan\u0131ml\u0131kt\u0131r. Lisans keyi sadece ge\u00e7erli claim sonras\u0131 olu\u015fur.",
        "giftCodePlaceholder": "FIMA-GIFT-XXXX-XXXX",
        "redeemGiftCode": "Hediye kodunu kullan",
        "pendingDirectGifts": "Bekleyen admin hediyeleri",
        "noPendingGifts": "Bekleyen hediye paketi yok.",
        "claimGift": "Hediyeyi al",
        "giftClaimed": "Hediye claim edildi. Lisans My Products'a eklendi.",
        "purchasedGiftCodes": "Sat\u0131n al\u0131nan gift code'lar",
        "giftHistory": "Hediye ge\u00e7mi\u015fi",
        "noPurchasedGiftCodes": "Hen\u00fcz sat\u0131n al\u0131nm\u0131\u015f gift code yok.",
        "noGiftHistory": "Hen\u00fcz hediye ge\u00e7mi\u015fi yok.",
        "copyGiftCode": "Gift Code'u kopyala",
        "giftCodeCreated": "Gift Code olu\u015fturuldu",
        "giftStartsOnRedeem": "Lisans s\u00fcresi sadece kod kullan\u0131ld\u0131\u011f\u0131nda ba\u015flar.",
        "giftRedeemedTitle": "Gift kullan\u0131ld\u0131",
        "giftRedeemedText": "Fima lisans\u0131n olu\u015fturuldu. Lisans keyini kopyala ve Fima App i\u00e7inde kullan.",
        "newLicenseKey": "Yeni uygulama lisans keyin",
        "copyLicenseKey": "Lisans keyini kopyala",
        "unusedGiftCode": "Kullan\u0131lmad\u0131",
        "usedGiftCode": "Kullan\u0131ld\u0131",
        "revokedGiftCode": "\u0130ptal edildi",
        "giftShownOnceOnly": "Bu kod sadece bir kez g\u00f6sterilebilir. Kopyalad\u0131\u011f\u0131n kodu g\u00fcvenli sakla.",
        "downloadApp": "App'i indir",
        "close": "OK",
        "giftRequirements": "Sadece Fima login gerekir. Discord, e-posta ve Roblox web sitesinde opsiyoneldir.",
        "buyNowNav": "Sat\u0131n al",
        "billingNav": "Abonelik / Fatura",
        "redeemGiftNav": "Gift code kullan",
        "purchasedGiftCodesNav": "Sat\u0131n al\u0131nan gift kodlar\u0131",
        "accountSettingsNav": "Hesap ayarlar\u0131",
        "supportNav": "Destek",
        "recoveryNotLinked": "Kurtarma ba\u011fl\u0131 de\u011fil",
        "linkDiscordRecovery": "Discord ba\u011fla",
        "noActiveSubscription": "Aktif abonelik yok",
        "giftExpired": "Bu hediyenin s\u00fcresi bitmi\u015f veya iptal edilmi\u015f.",
        "giftAlreadyRedeemed": "Bu hediye kodu zaten kullan\u0131lm\u0131\u015f.",
        "giftCodeNotFound": "Hediye kodu bulunamad\u0131.",
        "giftSearchPlaceholder": "E-posta, Discord veya Roblox ile ara",
        "giftSearchHint": "Al\u0131c\u0131 arama sadece giri\u015f yapm\u0131\u015f kullan\u0131c\u0131lar i\u00e7in \u00e7al\u0131\u015f\u0131r ve gizli verileri maskeler.",
        "giftSearchEmpty": "Kay\u0131tl\u0131 kullan\u0131c\u0131 bulunamad\u0131.",
        "giftSearchStart": "Aramak i\u00e7in en az 2 karakter yaz.",
        "giftSearchLoading": "Al\u0131c\u0131lar aran\u0131yor...",
        "giftSearchFailed": "Al\u0131c\u0131 arama ba\u015far\u0131s\u0131z.",
        "chooseRecipient": "Al\u0131c\u0131y\u0131 se\u00e7",
        "giftCheckoutSoon": "Hediye checkout se\u00e7ilen kay\u0131tl\u0131 hesaba ba\u011flanacak.",
        "selectedGiftRecipient": "Se\u00e7ili hediye al\u0131c\u0131s\u0131",
        "giftRecipientReady": "Al\u0131c\u0131 se\u00e7ildi. Bu kullan\u0131c\u0131ya al\u0131nacak eri\u015fim plan\u0131n\u0131 se\u00e7.",
        "giftBuy1day": "Trial hediye et",
        "giftBuy3days": "3 G\u00fcn hediye et",
        "giftBuyMonthly": "Ayl\u0131k hediye et",
        "giftBuyLifetime": "Lifetime hediye et",
        "changeGiftRecipient": "Al\u0131c\u0131y\u0131 de\u011fi\u015ftir",
        "accountNavProfileFallback": "Fima hesab\u0131",
        "connectedAccounts": "Discord kurtarma ve opsiyonel profil",
        "accountLinksEyebrow": "Hesap ba\u011flant\u0131lar\u0131",
        "discord": "Discord",
        "notConnected": "Ba\u011fl\u0131 de\u011fil",
        "connected": "Ba\u011fl\u0131",
        "connectDiscord": "Discord Ba\u011fla",
        "disconnectDiscord": "Discord'u Ay\u0131r",
        "reconnectDiscord": "Discord'u Yeniden Ba\u011fla",
        "connectRoblox": "Roblox doğrula",
        "disconnectRoblox": "Roblox'u temizle",
        "reconnectRoblox": "Tekrar doğrula",
        "robloxProfileNote": "Roblox doğrulama bu profilin sana ait olduğunu kanıtlar. FIMA kodunu Roblox About/Description kısmına yazıp onayla.",
        "saveRobloxUsername": "Doğrulamayı başlat",
        "clearRobloxUsername": "Roblox'u temizle",
        "robloxVerified": "Roblox doğrulandı",
        "robloxPending": "Doğrulama bekliyor",
        "robloxVerifyIntro": "Roblox kullanıcı adını gir. Sana Roblox profilinin About/Description kısmına koyacağın FIMA doğrulama kodunu vereceğiz.",
        "robloxVerifyInstructions": "Bu FIMAVERIFY kodunu Roblox profilinin About/Description kısmına kopyala, kaydet, sonra Doğrulamayı onayla tuşuna bas.",
        "copyVerifyCode": "Kodu kopyala",
        "confirmRobloxVerification": "Doğrulamayı onayla",
        "openRobloxProfile": "Roblox profilini aç",
        "profileSaved": "Profil kaydedildi.",
        "freeMonthlyTrial": "Ayl\u0131k \u00dccretsiz Trial",
        "freeTrialEyebrow": "\u00dccretsiz deneme",
        "trialIntro": "Discord'u bağlayıp Roblox profilini doğruladıktan sonra ücretsiz trial alabilirsin.",
        "trialRequirements": "Ayl\u0131k Trial Gereksinimleri",
        "accountLoggedIn": "Fima hesab\u0131yla giri\u015f yap\u0131ld\u0131",
        "discordConnected": "Discord ba\u011fl\u0131",
        "robloxConnected": "Roblox doğrulandı",
        "claimTrial": "Free Trial Al",
        "trialActive": "Trial aktif",
        "trialAvailable": "Trial haz\u0131r",
        "trialLocked": "Trial kilitli",
        "trialCooldown": "Trial bekleme s\u00fcresi",
        "nextTrial": "Sonraki \u00fccretsiz trial",
        "connectDiscordTrial": "Free trial i\u00e7in Discord'u ba\u011fla.",
        "connectRobloxTrial": "Free trial için Roblox profilini doğrula.",
        "trialClaimed": "Free trial al\u0131nd\u0131. Trial rol\u00fcn senkronize ediliyor.",
        "trialReadyTitle": "Trial key'in haz\u0131r",
        "trialReadyText": "License key'i kopyala, sonra Fima'y\u0131 a\u00e7\u0131p key ekran\u0131nda aktive et.",
        "trialReadyPrivacy": "Gizlilik i\u00e7in ekran g\u00f6r\u00fcnt\u00fcleri ve raporlarda sadece maskeli key g\u00f6sterilir. Copy butonu tam key'i bu giri\u015f yapm\u0131\u015f hesap i\u00e7in kopyalar.",
        "trialAlreadyActive": "Zaten aktif ayl\u0131k trial'\u0131n var.",
        "trialCooldownActive": "Ayl\u0131k trial bekleme s\u00fcren h\u00e2l\u00e2 aktif.",
        "discordNotConnected": "Discord sadece free trial veya opsiyonel kurtarma i\u00e7in gerekir.",
        "robloxNotConnected": "Roblox opsiyoneldir ve site eri\u015fimini engellemez.",
        "disconnectConfirm": "Bu hesap ba\u011flant\u0131s\u0131 ayr\u0131ls\u0131n m\u0131?",
        "openConnect": "Ba\u011flant\u0131y\u0131 a\u00e7",
        "requirementsComplete": "T\u00fcm gereksinimler tamam.",
        "emailVerificationEyebrow": "Hesap Kurtarma",
        "emailVerificationTitle": "E-posta kurtarma",
        "emailVerificationIntro": "E-posta opsiyoneldir. E-posta ile reset kodu almak istiyorsan ba\u011fla ve do\u011frula.",
        "emailVerified": "E-posta do\u011fruland\u0131",
        "emailNotVerified": "E-posta do\u011frulanmad\u0131",
        "sendVerificationCode": "Do\u011frulama kodu g\u00f6nder",
        "confirmVerificationCode": "Kodu onayla",
        "verificationCode": "6 haneli kod",
        "verificationSent": "Mail g\u00f6nderimi ayarl\u0131ysa do\u011frulama kodu g\u00f6nderildi.",
        "verificationSendFailed": "Do\u011frulama e-postas\u0131 g\u00f6nderilemedi. Devam ederse deste\u011fe yaz.",
        "verificationComplete": "E-posta do\u011fruland\u0131. Referral durumu g\u00fcncellendi.",
        "invalidVerificationCode": "6 haneli do\u011frulama kodunu gir.",
        "invalidOrExpiredVerificationCode": "Do\u011frulama kodu hatal\u0131 veya s\u00fcresi bitti.",
        "referralCode": "Davet kodu",
        "referralOptional": "\u0130ste\u011fe ba\u011fl\u0131 davet kodu",
        "referralPrefilled": "Davet kodu y\u00fcklendi. \u00d6d\u00fcl free trial de\u011filse Discord veya Roblox gerekmez.",
        "referralRewardsEyebrow": "Davet \u00d6d\u00fclleri",
        "referralRewardsTitle": "Referral \u00f6d\u00fclleri",
        "referralRewardsIntro": "Ger\u00e7ek kullan\u0131c\u0131lar\u0131 davet et. Referral i\u00e7in Roblox gerekmez; free trial \u00f6d\u00fcllerinde Discord gerekebilir.",
        "yourReferralCode": "Davet kodun",
        "yourReferralLink": "Davet linkin",
        "copyReferralCode": "Kodu kopyala",
        "copyReferralLink": "Linki kopyala",
        "referralProgress": "\u00d6d\u00fcl ilerlemesi",
        "verifiedInvites": "Do\u011frulanm\u0131\u015f davet",
        "pendingInvites": "Bekleyen davet",
        "rejectedInvites": "Reddedilen",
        "flaggedInvites": "\u0130nceleme",
        "earnedRewards": "Kazan\u0131lan \u00f6d\u00fcl",
        "nextReward": "Sonraki \u00f6d\u00fcl",
        "referralsRemaining": "do\u011frulanm\u0131\u015f davet kald\u0131",
        "referralApplyTitle": "Davet mi ald\u0131n?",
        "referralApplyIntro": "Opsiyonel davet/referral kodu. \u00d6d\u00fcl free trial de\u011filse Discord veya Roblox gerektirmez.",
        "applyReferral": "Kodu uygula",
        "referralApplied": "Davet kodu uyguland\u0131.",
        "invalidReferralCode": "Davet kodu bulunamad\u0131.",
        "referralAlreadyUsed": "Bu hesap zaten davet kodu kulland\u0131.",
        "selfReferralNotAllowed": "Kendi davet kodunu kullanamazs\u0131n.",
        "recentInvites": "Son davetler",
        "noReferralsYet": "Hen\u00fcz davet yok. Linkini arkada\u015flar\u0131nla payla\u015f.",
        "incomingReferral": "Kullan\u0131lan davet",
        "rewardRule": "3 do\u011frulanm\u0131\u015f davet = 7 g\u00fcn \u00fccretsiz eri\u015fim"
    },
    "de": {
        "working": "Wird verarbeitet...",
        "loadingProducts": "Produkte werden geladen...",
        "noProducts": "Noch keine Produkte. Nach dem Kauf erscheint deine Lizenz hier.",
        "noStoreProducts": "Keine aktiven Store-Produkte. Oeffne die Preisseite fuer Lizenzplaene.",
        "buyPricing": "Preise oeffnen",
        "copied": "Kopiert.",
        "downloadReady": "Download wird geoeffnet...",
        "extend": "Verlaengern",
        "renew": "Erneuern",
        "copyKey": "Key kopieren",
        "download": "Download",
        "active": "Aktiv",
        "expired": "Abgelaufen",
        "lifetime": "Laeuft nie ab",
        "expires": "Ablauf",
        "remaining": "Restzeit",
        "email": "E-Mail",
        "stripeCustomer": "Stripe Kunde",
        "roblox": "Roblox",
        "noRoblox": "Nicht verknuepft",
        "checkout": "Stripe Checkout wird erstellt...",
        "robloxLookup": "Roblox Profil wird geprueft...",
        "robloxNotFound": "Roblox Nutzer wurde nicht gefunden.",
        "invalidEmail": "Nutze eine echte E-Mail mit funktionierender Mail-Domain.",
        "invalidRoblox": "Gueltigen Roblox-Namen eingeben oder leer lassen.",
        "weakPassword": "Passwort muss mindestens 8 Zeichen haben.",
        "registered": "Account erstellt. Weiterleitung...",
        "loggedIn": "Eingeloggt. Weiterleitung...",
        "purchaseProcessing": "Zahlung wird verarbeitet. Erneute Pruefung...",
        "purchaseComplete": "Zahlung abgeschlossen.",
        "openMyProducts": "Meine Produkte oeffnen",
        "resetGeneric": "Falls diese E-Mail existiert, wurde ein Reset vorbereitet.",
        "saleTitle": "Aktuelle Tarife",
        "saleText": "Lifetime bleibt fest. Zeitplaene sind bis 3. Juni rabattiert.",
        "saleEnds": "Sale endet in",
        "licenseKey": "Lizenzschluessel",
        "plan": "Plan",
        "status": "Status",
        "purchased": "Kauf",
        "licenseAccess": "Lizenzzugriff",
        "productAccess": "Produktzugriff",
        "emailAlreadyRegistered": "E-Mail ist bereits registriert.",
        "invalidCredentials": "E-Mail oder Passwort ist falsch.",
        "unauthorized": "Bitte erneut einloggen.",
        "checkoutDisabled": "Checkout ist gerade deaktiviert.",
        "licenseNotFound": "Lizenz wurde in diesem Account nicht gefunden.",
        "licenseBanned": "Diese Lizenz ist gebannt.",
        "storeNav": "Store",
        "loginNav": "Login",
        "logoutNav": "Logout",
        "dashboardNav": "Konto",
        "myProductsNav": "Meine Produkte",
        "registerEyebrow": "Fima Account",
        "registerTitle": "Account erstellen.",
        "registerIntro": "Erstelle dein Fima Konto nur mit Benutzername und Passwort. Discord kannst du spaeter fuer Wiederherstellung oder Free Trial verbinden.",
        "robloxUsername": "Roblox Nutzername",
        "password": "Passwort",
        "registerButton": "Registrieren",
        "loginTitle": "Einloggen.",
        "loginIntro": "Oeffne dein Fima Dashboard, Produkte und Lizenzkeys.",
        "loginButton": "Einloggen",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Neues Passwort setzen.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Passwort aktualisieren",
        "token": "Reset-Token",
        "newPassword": "Neues Passwort",
        "dashboardEyebrow": "Account Dashboard",
        "dashboardTitle": "Dein Fima Account.",
        "myProductsEyebrow": "Meine Produkte",
        "myProductsTitle": "Gekaufte Produkte.",
        "storeEyebrow": "Produkt-Store",
        "storeTitle": "Fima Store.",
        "storeIntro": "Kaufe Produkte mit Stripe Checkout und verknuepfe sie mit deinem Account.",
        "paymentSuccessTitle": "Zahlung abgeschlossen.",
        "paymentCancelledTitle": "Zahlung abgebrochen.",
        "total": "Summe",
        "product": "Produkt",
        "willBeCreated": "Wird vor Checkout erstellt",
        "noLicenses": "Noch keine Lizenz mit dieser E-Mail verknuepft.",
        "productLinked": "Das Produkt ist jetzt mit deinem Fima Account verknuepft.",
        "paymentCheckFailed": "Zahlung konnte nicht geprueft werden.",
        "paymentReceived": "Zahlung erhalten.",
        "purchaseStillProcessing": "Dein Kauf wird noch verarbeitet. Kontaktiere Support, falls er nicht bald erscheint.",
        "buyWithStripe": "Mit Stripe kaufen"
    },
    "fr": {
        "working": "Traitement...",
        "loadingProducts": "Chargement des produits...",
        "noProducts": "Aucun produit pour le moment. Ta licence apparaitra ici apres achat.",
        "noStoreProducts": "Aucun produit actif. Ouvre la page des prix pour les licences.",
        "buyPricing": "Voir les prix",
        "copied": "Copie.",
        "downloadReady": "Ouverture du telechargement...",
        "extend": "Prolonger",
        "renew": "Renouveler",
        "copyKey": "Copier la cle",
        "download": "Telecharger",
        "active": "Actif",
        "expired": "Expire",
        "lifetime": "N'expire jamais",
        "expires": "Expire",
        "remaining": "Temps restant",
        "email": "E-mail",
        "stripeCustomer": "Client Stripe",
        "roblox": "Roblox",
        "noRoblox": "Non lie",
        "checkout": "Creation du Checkout Stripe...",
        "robloxLookup": "Verification Roblox...",
        "robloxNotFound": "Utilisateur Roblox introuvable.",
        "invalidEmail": "Utilise une vraie adresse e-mail avec domaine mail actif.",
        "invalidRoblox": "Entre un pseudo Roblox valide ou laisse vide.",
        "weakPassword": "Le mot de passe doit avoir au moins 8 caracteres.",
        "registered": "Compte cree. Redirection...",
        "loggedIn": "Connecte. Redirection...",
        "purchaseProcessing": "Paiement en cours. Nouvelle verification...",
        "purchaseComplete": "Paiement termine.",
        "openMyProducts": "Ouvrir mes produits",
        "resetGeneric": "Si cet e-mail existe, une demande de reset est preparee.",
        "saleTitle": "Offres actuelles",
        "saleText": "Les produits publics actuels sont Free Trial, 3 Days Access, Monthly Subscription et Lifetime.",
        "saleEnds": "Fin de l'offre dans",
        "licenseKey": "Cle de licence",
        "plan": "Plan",
        "status": "Statut",
        "purchased": "Achat",
        "licenseAccess": "Acces licence",
        "productAccess": "Acces produit",
        "emailAlreadyRegistered": "Cet e-mail est deja inscrit.",
        "invalidCredentials": "E-mail ou mot de passe incorrect.",
        "unauthorized": "Connecte-toi a nouveau.",
        "checkoutDisabled": "Checkout est desactive pour le moment.",
        "licenseNotFound": "Licence introuvable sur ce compte.",
        "licenseBanned": "Cette licence est bannie.",
        "storeNav": "Store",
        "loginNav": "Connexion",
        "logoutNav": "Deconnexion",
        "dashboardNav": "Compte",
        "myProductsNav": "Mes produits",
        "registerEyebrow": "Compte Fima",
        "registerTitle": "Cree ton compte.",
        "registerIntro": "Cree ton compte avec seulement un pseudo et un mot de passe. Tu peux lier Discord plus tard pour la recuperation ou le free trial.",
        "robloxUsername": "Pseudo Roblox",
        "password": "Mot de passe",
        "registerButton": "Inscription",
        "loginTitle": "Connexion.",
        "loginIntro": "Ouvre ton dashboard Fima, tes produits et tes cles.",
        "loginButton": "Connexion",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Definir un nouveau mot de passe.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Mettre a jour",
        "token": "Token de reset",
        "newPassword": "Nouveau mot de passe",
        "dashboardEyebrow": "Dashboard compte",
        "dashboardTitle": "Ton compte Fima.",
        "myProductsEyebrow": "Mes produits",
        "myProductsTitle": "Produits achetes.",
        "storeEyebrow": "Store produits",
        "storeTitle": "Store Fima.",
        "storeIntro": "Achete avec Stripe Checkout et lie le produit a ton compte.",
        "paymentSuccessTitle": "Paiement termine.",
        "paymentCancelledTitle": "Paiement annule.",
        "total": "Total",
        "product": "Produit",
        "willBeCreated": "Cree avant checkout",
        "noLicenses": "Aucune licence liee a cet e-mail.",
        "productLinked": "Le produit est maintenant lie a ton compte Fima.",
        "paymentCheckFailed": "Impossible de verifier le paiement.",
        "paymentReceived": "Paiement recu.",
        "purchaseStillProcessing": "Ton achat est encore en traitement. Contacte le support si cela dure.",
        "buyWithStripe": "Acheter avec Stripe"
    },
    "bs": {
        "working": "Radim...",
        "loadingProducts": "Ucitavanje proizvoda...",
        "noProducts": "Jos nema proizvoda. Kupljena licenca ce se pojaviti ovdje.",
        "noStoreProducts": "Nema aktivnih store proizvoda. Otvori cijene za license planove.",
        "buyPricing": "Otvori cijene",
        "copied": "Kopirano.",
        "downloadReady": "Otvaram download...",
        "extend": "Produzi",
        "renew": "Obnovi",
        "copyKey": "Kopiraj key",
        "download": "Preuzmi",
        "active": "Aktivno",
        "expired": "Isteklo",
        "lifetime": "Nikad ne istice",
        "expires": "Istice",
        "remaining": "Preostalo",
        "email": "E-mail",
        "stripeCustomer": "Stripe kupac",
        "roblox": "Roblox",
        "noRoblox": "Nije povezano",
        "checkout": "Kreiram Stripe Checkout...",
        "robloxLookup": "Provjeravam Roblox profil...",
        "robloxNotFound": "Roblox korisnik nije pronadjen.",
        "invalidEmail": "Koristi stvarni e-mail sa aktivnom mail domenom.",
        "invalidRoblox": "Unesi validan Roblox username ili ostavi prazno.",
        "weakPassword": "Lozinka mora imati najmanje 8 znakova.",
        "registered": "Nalog kreiran. Preusmjeravam...",
        "loggedIn": "Prijava uspjesna. Preusmjeravam...",
        "purchaseProcessing": "Placanje se obradjuje. Provjeravam opet...",
        "purchaseComplete": "Placanje zavrseno.",
        "openMyProducts": "Otvori moje proizvode",
        "resetGeneric": "Ako taj e-mail postoji, reset zahtjev je pripremljen.",
        "saleTitle": "Trenutni paketi",
        "saleText": "Trenutni javni proizvodi su Free Trial, 3 Days Access, Monthly Subscription i Lifetime.",
        "saleEnds": "Popust zavrsava za",
        "licenseKey": "License key",
        "plan": "Plan",
        "status": "Status",
        "purchased": "Kupovina",
        "licenseAccess": "License pristup",
        "productAccess": "Product pristup",
        "emailAlreadyRegistered": "E-mail je vec registrovan.",
        "invalidCredentials": "E-mail ili lozinka nisu tacni.",
        "unauthorized": "Prijavi se ponovo.",
        "checkoutDisabled": "Checkout je trenutno iskljucen.",
        "licenseNotFound": "Licenca nije nadjena na ovom nalogu.",
        "licenseBanned": "Ova licenca je banovana.",
        "storeNav": "Store",
        "loginNav": "Prijava",
        "logoutNav": "Odjava",
        "dashboardNav": "Nalog",
        "myProductsNav": "Moji proizvodi",
        "registerEyebrow": "Fima nalog",
        "registerTitle": "Kreiraj nalog.",
        "registerIntro": "Registruj se e-mailom, lozinkom i opcionim Roblox imenom. Stripe se koristi samo za placanja.",
        "robloxUsername": "Roblox username",
        "password": "Lozinka",
        "registerButton": "Registruj se",
        "loginTitle": "Prijava.",
        "loginIntro": "Otvori Fima dashboard, proizvode i license keyeve.",
        "loginButton": "Prijavi se",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Postavi novu lozinku.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Azuriraj lozinku",
        "token": "Reset token",
        "newPassword": "Nova lozinka",
        "dashboardEyebrow": "Account dashboard",
        "dashboardTitle": "Tvoj Fima nalog.",
        "myProductsEyebrow": "Moji proizvodi",
        "myProductsTitle": "Kupljeni proizvodi.",
        "storeEyebrow": "Product store",
        "storeTitle": "Fima store.",
        "storeIntro": "Kupi proizvode preko Stripe Checkouta i povezi ih sa nalogom.",
        "paymentSuccessTitle": "Placanje zavrseno.",
        "paymentCancelledTitle": "Placanje otkazano.",
        "total": "Ukupno",
        "product": "Proizvod",
        "willBeCreated": "Bit ce kreirano prije checkouta",
        "noLicenses": "Nema licenci povezanih s ovim e-mailom.",
        "productLinked": "Proizvod je povezan sa Fima nalogom.",
        "paymentCheckFailed": "Placanje nije moguce provjeriti.",
        "paymentReceived": "Placanje primljeno.",
        "purchaseStillProcessing": "Kupovina se jos obradjuje. Javi se supportu ako se ne pojavi brzo.",
        "buyWithStripe": "Kupi preko Stripe"
    },
    "ru": {
        "working": "Working...",
        "loadingProducts": "Loading products...",
        "noProducts": "No account products yet. Buy a license and it will appear here with the key.",
        "noStoreProducts": "No account-store products are active yet. Use the pricing page for license plans.",
        "buyPricing": "Open pricing",
        "copied": "Copied.",
        "downloadReady": "Opening download...",
        "extend": "Extend",
        "renew": "Renew",
        "copyKey": "Copy key",
        "download": "Download",
        "active": "Active",
        "expired": "Expired",
        "lifetime": "Never expires",
        "expires": "Expires",
        "remaining": "Time left",
        "email": "Email",
        "stripeCustomer": "Stripe Customer",
        "roblox": "Roblox",
        "noRoblox": "Not linked",
        "checkout": "Creating Stripe Checkout...",
        "robloxLookup": "Checking Roblox profile...",
        "robloxNotFound": "Roblox user was not found.",
        "invalidEmail": "Use a real email address with a working mail domain.",
        "invalidRoblox": "Enter a valid Roblox username or leave it empty.",
        "weakPassword": "Password must be at least 8 characters.",
        "registered": "Account created. Redirecting...",
        "loggedIn": "Logged in. Redirecting...",
        "purchaseProcessing": "Payment is still processing. Checking again...",
        "purchaseComplete": "Payment complete.",
        "openMyProducts": "Open My Products",
        "resetGeneric": "If that email exists, a reset request has been prepared.",
        "saleTitle": "Current plans",
        "saleText": "Current public products are Free Trial, 3 Days Access, Monthly Subscription and Lifetime.",
        "saleEnds": "Sale ends in",
        "licenseKey": "License key",
        "plan": "Plan",
        "status": "Status",
        "purchased": "Purchased",
        "licenseAccess": "License access",
        "productAccess": "Product access",
        "emailAlreadyRegistered": "Email already registered.",
        "invalidCredentials": "Invalid email or password.",
        "unauthorized": "Please log in again.",
        "checkoutDisabled": "Checkout is disabled right now.",
        "licenseNotFound": "License was not found on this account.",
        "licenseBanned": "This license is banned.",
        "storeNav": "Store",
        "loginNav": "Login",
        "logoutNav": "Logout",
        "dashboardNav": "Account",
        "myProductsNav": "My Products",
        "registerEyebrow": "Fima Account",
        "registerTitle": "Create your Fima account.",
        "registerIntro": "Create an account with only a username and password. You can link Discord later for account recovery or free trial.",
        "robloxUsername": "Roblox username",
        "password": "Password",
        "registerButton": "Register",
        "loginTitle": "Get back into Fima.",
        "loginIntro": "Sign in with your Fima username.",
        "loginButton": "Login",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Set a new password.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Update password",
        "token": "Reset token",
        "newPassword": "New password",
        "dashboardEyebrow": "Account dashboard",
        "dashboardTitle": "Your Fima account.",
        "myProductsEyebrow": "My Products",
        "myProductsTitle": "Purchased products.",
        "storeEyebrow": "Product store",
        "storeTitle": "Fima store.",
        "storeIntro": "Buy products with Stripe checkout and link them to your account.",
        "paymentSuccessTitle": "Payment complete.",
        "paymentCancelledTitle": "Payment cancelled.",
        "total": "Total",
        "product": "Product",
        "willBeCreated": "Will be created before checkout",
        "noLicenses": "No licenses on this account yet.",
        "productLinked": "Your product is now linked to your Fima account.",
        "paymentCheckFailed": "Could not check payment.",
        "paymentReceived": "Payment received.",
        "purchaseStillProcessing": "Your purchase is still processing. Contact support if it does not appear soon.",
        "buyWithStripe": "Buy with Stripe"
    },
    "es": {
        "working": "Working...",
        "loadingProducts": "Loading products...",
        "noProducts": "No account products yet. Buy a license and it will appear here with the key.",
        "noStoreProducts": "No account-store products are active yet. Use the pricing page for license plans.",
        "buyPricing": "Open pricing",
        "copied": "Copied.",
        "downloadReady": "Opening download...",
        "extend": "Extend",
        "renew": "Renew",
        "copyKey": "Copy key",
        "download": "Download",
        "active": "Active",
        "expired": "Expired",
        "lifetime": "Never expires",
        "expires": "Expires",
        "remaining": "Time left",
        "email": "Email",
        "stripeCustomer": "Stripe Customer",
        "roblox": "Roblox",
        "noRoblox": "Not linked",
        "checkout": "Creating Stripe Checkout...",
        "robloxLookup": "Checking Roblox profile...",
        "robloxNotFound": "Roblox user was not found.",
        "invalidEmail": "Use a real email address with a working mail domain.",
        "invalidRoblox": "Enter a valid Roblox username or leave it empty.",
        "weakPassword": "Password must be at least 8 characters.",
        "registered": "Account created. Redirecting...",
        "loggedIn": "Logged in. Redirecting...",
        "purchaseProcessing": "Payment is still processing. Checking again...",
        "purchaseComplete": "Payment complete.",
        "openMyProducts": "Open My Products",
        "resetGeneric": "If that email exists, a reset request has been prepared.",
        "saleTitle": "Current plans",
        "saleText": "Current public products are Free Trial, 3 Days Access, Monthly Subscription and Lifetime.",
        "saleEnds": "Sale ends in",
        "licenseKey": "License key",
        "plan": "Plan",
        "status": "Status",
        "purchased": "Purchased",
        "licenseAccess": "License access",
        "productAccess": "Product access",
        "emailAlreadyRegistered": "Email already registered.",
        "invalidCredentials": "Invalid email or password.",
        "unauthorized": "Please log in again.",
        "checkoutDisabled": "Checkout is disabled right now.",
        "licenseNotFound": "License was not found on this account.",
        "licenseBanned": "This license is banned.",
        "storeNav": "Store",
        "loginNav": "Login",
        "logoutNav": "Logout",
        "dashboardNav": "Account",
        "myProductsNav": "My Products",
        "registerEyebrow": "Fima Account",
        "registerTitle": "Create your Fima account.",
        "registerIntro": "Create an account with only a username and password. You can link Discord later for account recovery or free trial.",
        "robloxUsername": "Roblox username",
        "password": "Password",
        "registerButton": "Register",
        "loginTitle": "Get back into Fima.",
        "loginIntro": "Sign in with your Fima username.",
        "loginButton": "Login",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Set a new password.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Update password",
        "token": "Reset token",
        "newPassword": "New password",
        "dashboardEyebrow": "Account dashboard",
        "dashboardTitle": "Your Fima account.",
        "myProductsEyebrow": "My Products",
        "myProductsTitle": "Purchased products.",
        "storeEyebrow": "Product store",
        "storeTitle": "Fima store.",
        "storeIntro": "Buy products with Stripe checkout and link them to your account.",
        "paymentSuccessTitle": "Payment complete.",
        "paymentCancelledTitle": "Payment cancelled.",
        "total": "Total",
        "product": "Product",
        "willBeCreated": "Will be created before checkout",
        "noLicenses": "No licenses on this account yet.",
        "productLinked": "Your product is now linked to your Fima account.",
        "paymentCheckFailed": "Could not check payment.",
        "paymentReceived": "Payment received.",
        "purchaseStillProcessing": "Your purchase is still processing. Contact support if it does not appear soon.",
        "buyWithStripe": "Buy with Stripe"
    },
    "pt": {
        "working": "Working...",
        "loadingProducts": "Loading products...",
        "noProducts": "No account products yet. Buy a license and it will appear here with the key.",
        "noStoreProducts": "No account-store products are active yet. Use the pricing page for license plans.",
        "buyPricing": "Open pricing",
        "copied": "Copied.",
        "downloadReady": "Opening download...",
        "extend": "Extend",
        "renew": "Renew",
        "copyKey": "Copy key",
        "download": "Download",
        "active": "Active",
        "expired": "Expired",
        "lifetime": "Never expires",
        "expires": "Expires",
        "remaining": "Time left",
        "email": "Email",
        "stripeCustomer": "Stripe Customer",
        "roblox": "Roblox",
        "noRoblox": "Not linked",
        "checkout": "Creating Stripe Checkout...",
        "robloxLookup": "Checking Roblox profile...",
        "robloxNotFound": "Roblox user was not found.",
        "invalidEmail": "Use a real email address with a working mail domain.",
        "invalidRoblox": "Enter a valid Roblox username or leave it empty.",
        "weakPassword": "Password must be at least 8 characters.",
        "registered": "Account created. Redirecting...",
        "loggedIn": "Logged in. Redirecting...",
        "purchaseProcessing": "Payment is still processing. Checking again...",
        "purchaseComplete": "Payment complete.",
        "openMyProducts": "Open My Products",
        "resetGeneric": "If that email exists, a reset request has been prepared.",
        "saleTitle": "Current plans",
        "saleText": "Current public products are Free Trial, 3 Days Access, Monthly Subscription and Lifetime.",
        "saleEnds": "Sale ends in",
        "licenseKey": "License key",
        "plan": "Plan",
        "status": "Status",
        "purchased": "Purchased",
        "licenseAccess": "License access",
        "productAccess": "Product access",
        "emailAlreadyRegistered": "Email already registered.",
        "invalidCredentials": "Invalid email or password.",
        "unauthorized": "Please log in again.",
        "checkoutDisabled": "Checkout is disabled right now.",
        "licenseNotFound": "License was not found on this account.",
        "licenseBanned": "This license is banned.",
        "storeNav": "Store",
        "loginNav": "Login",
        "logoutNav": "Logout",
        "dashboardNav": "Account",
        "myProductsNav": "My Products",
        "registerEyebrow": "Fima Account",
        "registerTitle": "Create your Fima account.",
        "registerIntro": "Create an account with only a username and password. You can link Discord later for account recovery or free trial.",
        "robloxUsername": "Roblox username",
        "password": "Password",
        "registerButton": "Register",
        "loginTitle": "Get back into Fima.",
        "loginIntro": "Sign in with your Fima username.",
        "loginButton": "Login",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Set a new password.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Update password",
        "token": "Reset token",
        "newPassword": "New password",
        "dashboardEyebrow": "Account dashboard",
        "dashboardTitle": "Your Fima account.",
        "myProductsEyebrow": "My Products",
        "myProductsTitle": "Purchased products.",
        "storeEyebrow": "Product store",
        "storeTitle": "Fima store.",
        "storeIntro": "Buy products with Stripe checkout and link them to your account.",
        "paymentSuccessTitle": "Payment complete.",
        "paymentCancelledTitle": "Payment cancelled.",
        "total": "Total",
        "product": "Product",
        "willBeCreated": "Will be created before checkout",
        "noLicenses": "No licenses on this account yet.",
        "productLinked": "Your product is now linked to your Fima account.",
        "paymentCheckFailed": "Could not check payment.",
        "paymentReceived": "Payment received.",
        "purchaseStillProcessing": "Your purchase is still processing. Contact support if it does not appear soon.",
        "buyWithStripe": "Buy with Stripe"
    },
    "ar": {
        "working": "Working...",
        "loadingProducts": "Loading products...",
        "noProducts": "No account products yet. Buy a license and it will appear here with the key.",
        "noStoreProducts": "No account-store products are active yet. Use the pricing page for license plans.",
        "buyPricing": "Open pricing",
        "copied": "Copied.",
        "downloadReady": "Opening download...",
        "extend": "Extend",
        "renew": "Renew",
        "copyKey": "Copy key",
        "download": "Download",
        "active": "Active",
        "expired": "Expired",
        "lifetime": "Never expires",
        "expires": "Expires",
        "remaining": "Time left",
        "email": "Email",
        "stripeCustomer": "Stripe Customer",
        "roblox": "Roblox",
        "noRoblox": "Not linked",
        "checkout": "Creating Stripe Checkout...",
        "robloxLookup": "Checking Roblox profile...",
        "robloxNotFound": "Roblox user was not found.",
        "invalidEmail": "Use a real email address with a working mail domain.",
        "invalidRoblox": "Enter a valid Roblox username or leave it empty.",
        "weakPassword": "Password must be at least 8 characters.",
        "registered": "Account created. Redirecting...",
        "loggedIn": "Logged in. Redirecting...",
        "purchaseProcessing": "Payment is still processing. Checking again...",
        "purchaseComplete": "Payment complete.",
        "openMyProducts": "Open My Products",
        "resetGeneric": "If that email exists, a reset request has been prepared.",
        "saleTitle": "Current plans",
        "saleText": "Current public products are Free Trial, 3 Days Access, Monthly Subscription and Lifetime.",
        "saleEnds": "Sale ends in",
        "licenseKey": "License key",
        "plan": "Plan",
        "status": "Status",
        "purchased": "Purchased",
        "licenseAccess": "License access",
        "productAccess": "Product access",
        "emailAlreadyRegistered": "Email already registered.",
        "invalidCredentials": "Invalid email or password.",
        "unauthorized": "Please log in again.",
        "checkoutDisabled": "Checkout is disabled right now.",
        "licenseNotFound": "License was not found on this account.",
        "licenseBanned": "This license is banned.",
        "storeNav": "Store",
        "loginNav": "Login",
        "logoutNav": "Logout",
        "dashboardNav": "Account",
        "myProductsNav": "My Products",
        "registerEyebrow": "Fima Account",
        "registerTitle": "Create your Fima account.",
        "registerIntro": "Create an account with only a username and password. You can link Discord later for account recovery or free trial.",
        "robloxUsername": "Roblox username",
        "password": "Password",
        "registerButton": "Register",
        "loginTitle": "Get back into Fima.",
        "loginIntro": "Sign in with your Fima username.",
        "loginButton": "Login",
        "forgotTitle": "Reset with Discord.",
        "forgotIntro": "Enter your Fima username. If Discord recovery is linked, the Fima bot will DM a one-time reset code.",
        "forgotButton": "Send Discord code",
        "resetTitle": "Set a new password.",
        "resetIntro": "Paste the reset code from the Fima Discord bot and choose a new password.",
        "resetButton": "Update password",
        "token": "Reset token",
        "newPassword": "New password",
        "dashboardEyebrow": "Account dashboard",
        "dashboardTitle": "Your Fima account.",
        "myProductsEyebrow": "My Products",
        "myProductsTitle": "Purchased products.",
        "storeEyebrow": "Product store",
        "storeTitle": "Fima store.",
        "storeIntro": "Buy products with Stripe checkout and link them to your account.",
        "paymentSuccessTitle": "Payment complete.",
        "paymentCancelledTitle": "Payment cancelled.",
        "total": "Total",
        "product": "Product",
        "willBeCreated": "Will be created before checkout",
        "noLicenses": "No licenses on this account yet.",
        "productLinked": "Your product is now linked to your Fima account.",
        "paymentCheckFailed": "Could not check payment.",
        "paymentReceived": "Payment received.",
        "purchaseStillProcessing": "Your purchase is still processing. Contact support if it does not appear soon.",
        "buyWithStripe": "Buy with Stripe"
    }
};

  const t = (key) => (copy[language()] || copy.en)[key] || copy.en[key] || key;
  const licenseSecretStore = new Map();
  const maskSensitiveCode = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const last = text.replace(/[^A-Za-z0-9]/g, "").slice(-4);
    return last ? `FIMA-****-****-${last}` : "FIMA-****";
  };
  const maskEmailAddress = (value) => {
    const text = String(value || "").trim();
    const [local, domain] = text.split("@");
    if (!local || !domain) return text || "";
    return `${local.slice(0, 1)}***${local.length > 2 ? local.slice(-1) : ""}@${domain}`;
  };
  const maskExternalId = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (text.length <= 8) return "***";
    return `${text.slice(0, 4)}***${text.slice(-4)}`;
  };
  const storeLicenseSecret = (license) => {
    const key = String(license?.licenseKey || "").trim();
    if (!key) return "";
    const id = String(license?.id || license?.licenseId || `license-${licenseSecretStore.size + 1}`);
    licenseSecretStore.set(id, key);
    return id;
  };
  const storeSensitiveSecret = (value, prefix = "secret") => {
    const key = String(value || "").trim();
    if (!key) return "";
    const id = `${prefix}-${licenseSecretStore.size + 1}-${Math.random().toString(36).slice(2, 8)}`;
    licenseSecretStore.set(id, key);
    return id;
  };
  const readLicenseSecret = (id) => licenseSecretStore.get(String(id || "")) || "";
  const setText = (selector, value, root = document) => {
    const node = $(selector, root);
    if (node) node.textContent = value;
  };
  const setAllText = (selector, value) => {
    $$(selector).forEach((node) => { node.textContent = value; });
  };
  const setLabel = (inputSelector, value) => {
    const input = $(inputSelector);
    const label = input?.closest("label");
    if (!label) return;
    const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.nodeValue = value;
    else label.prepend(document.createTextNode(value));
  };
  const setHeroCopy = (eyebrow, title, intro) => {
    setText(".eyebrow", eyebrow);
    setText("h1", title);
    const introNode = $(".auth-intro > div > p:not(.eyebrow), .account-lead, .shell > section > p:not(.eyebrow), .shell > p:not(.eyebrow)");
    if (introNode) introNode.textContent = intro;
  };
  const applyStaticTranslations = () => {
    document.documentElement.lang = language();
    setAllText(".links a[href='/store']", t("storeNav"));
    setAllText(".links a[href='/login']", t("loginNav"));
    setAllText(`.links a[href="${dashboardRoute("overview")}"]`, t("dashboardNav"));
    setAllText(`.links a[href="${dashboardRoute("products")}"]`, t("myProductsNav"));
    setAllText("[data-logout]", t("logoutNav"));

    if (page === "register") {
      setHeroCopy(t("registerEyebrow"), t("registerTitle"), t("registerIntro"));
      setLabel("input[name='username']", language() === "tr" ? "Kullanici adi" : "Username");
      setLabel("input[name='robloxUsername']", language() === "tr" ? "Roblox kullanici adi (opsiyonel)" : "Roblox username (optional)");
      setLabel("input[name='referralCode']", language() === "tr" ? "Referral / davet kodu (opsiyonel)" : "Referral / invite code (optional)");
      setLabel("input[name='password']", t("password"));
      setLabel("input[name='confirmPassword']", t("confirmPassword"));
      setText("button[type='submit']", t("registerButton"));
      const warning = $(".recovery-warning");
      if (warning) warning.textContent = language() === "tr"
        ? "Uyari: Discord'u daha sonra baglamazsan sifreni unutunca hesap kurtarma mumkun olmayabilir."
        : "Warning: If you do not link Discord later, password recovery may not be possible.";
    }
    if (page === "login") {
      setHeroCopy("Fima Account", t("loginTitle"), t("loginIntro"));
      setLabel("input[name='login']", language() === "tr" ? "Kullanici adi" : "Username");
      setLabel("input[name='password']", t("password"));
      setText("button[type='submit']", t("loginButton"));
      setText("a[href='/forgot-password']", t("forgotTitle"));
    }
    if (page === "forgot") {
      setHeroCopy("Fima Account", t("forgotTitle"), t("forgotIntro"));
      setLabel("input[name='login']", language() === "tr" ? "Fima kullanici adi" : "Fima username");
      setText("button[type='submit']", t("forgotButton"));
    }
    if (page === "reset") {
      setHeroCopy("Fima Account", t("resetTitle"), t("resetIntro"));
      setLabel("input[name='token']", t("token"));
      setLabel("input[name='password']", t("newPassword"));
      setLabel("input[name='confirmPassword']", t("confirmPassword"));
      setText("button[type='submit']", t("resetButton"));
    }
    if (page === "dashboard") {
      const rows = $$(".row span");
      if (rows[0]) rows[0].textContent = language() === "tr" ? "Kullanici adi" : "Username";
      if (rows[1]) rows[1].textContent = t("email");
      if (rows[2]) rows[2].textContent = t("stripeCustomer");
      if (rows[3]) rows[3].textContent = language() === "tr" ? "Roblox profil" : "Roblox profile";
      setText(".account-summary-card h2", t("dashboardNav"));
      setText("#security .section-heading h2", t("emailVerificationTitle"));
      setText("#security .section-heading p:not(.eyebrow)", t("emailVerificationIntro"));
      setText("#security > div:not(.section-heading) h2", t("connectedAccounts"));
      const accountLinksIntro = $("#security > div:not(.section-heading) p:not(.eyebrow)");
      if (accountLinksIntro) accountLinksIntro.textContent = language() === "tr"
        ? "Discord sadece free trial veya opsiyonel kurtarma icin gerekir. Roblox web sitesinde hicbir islemi engellemez."
        : "Discord is only required for the free trial or optional recovery. Roblox username is optional and never proves ownership.";
      setText("#redeem .section-heading h2", t("giftSystemTitle"));
      setText("#redeem .section-heading p:not(.eyebrow)", t("giftAccessIntro"));
      setText("#referrals .section-heading h2", t("referralRewardsTitle"));
      setText("#referrals .section-heading p:not(.eyebrow)", t("referralRewardsIntro"));
      setText("#products .section-heading h2", t("myProductsTitle"));
      setText("#billing .section-heading h2", language() === "tr" ? "Faturalama ve abonelik" : "Billing and subscription");
      setText("#billing .section-heading p:not(.eyebrow)", language() === "tr"
        ? "Uzatma, yenileme ve abonelik iptali burada yonetilir. Lisans kartlari My Products bolumunde kalir."
        : "Renewals, extensions and cancellation help are handled here. License cards stay in My Products.");
      setText("#security .section-heading .eyebrow", t("emailVerificationEyebrow"));
      const accountLinksEyebrow = $("#security > div:not(.section-heading) .eyebrow");
      if (accountLinksEyebrow) accountLinksEyebrow.textContent = t("accountLinksEyebrow");
      setText("#redeem .section-heading .eyebrow", t("giftAccessEyebrow"));
      setText("#referrals .section-heading .eyebrow", t("referralRewardsEyebrow"));
    }
    if (page === "my-products") setHeroCopy(t("myProductsEyebrow"), t("myProductsTitle"), "");
    if (page === "store") setHeroCopy(t("storeEyebrow"), t("storeTitle"), t("storeIntro"));
    if (page === "payment-success") setText("#result h1", t("paymentSuccessTitle"));
  };
  const saleEndsAt = new Date("2026-06-03T23:59:59+02:00");

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));

  const money = (amount, currency = "eur") =>
    new Intl.NumberFormat(language() === "tr" ? "tr-TR" : "en-US", {
      style: "currency",
      currency: String(currency || "eur").toUpperCase()
    }).format((amount || 0) / 100);

  const date = (value) => value ? new Date(value).toLocaleString(language() === "tr" ? "tr-TR" : undefined) : "-";
  const cleanPublicLink = (value) => String(value || "").replace(/\/([a-z0-9-]+)\.html(?=[?#]|$)/gi, "/$1");
  const duration = (seconds) => {
    const total = Math.max(0, Number(seconds || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = Math.floor(total % 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    return `${minutes}m ${secs}s`;
  };

  let csrfTokenPromise = null;
  const csrfExemptPaths = new Set([
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/forgot-password",
    "/api/auth/reset-password"
  ]);

  const getCsrfToken = async () => {
    if (!csrfTokenPromise) {
      csrfTokenPromise = fetch(`${apiBase}/api/csrf-token`, {
        credentials: "include",
        cache: "no-store"
      })
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.csrfToken) throw new Error("csrf_unavailable");
          return data.csrfToken;
        })
        .catch((error) => {
          csrfTokenPromise = null;
          throw error;
        });
    }
    return csrfTokenPromise;
  };

  const api = async (path, options = {}) => {
    let response;
    try {
      const method = String(options.method || "GET").toUpperCase();
      const headers = { "content-type": "application/json", ...(options.headers || {}) };
      if (!["GET", "HEAD", "OPTIONS"].includes(method) && !csrfExemptPaths.has(path)) {
        try {
          headers["x-fima-csrf"] = await getCsrfToken();
        } catch (error) {
          // Let the backend return the canonical CSRF/session error for expired sessions.
        }
      }
      response = await fetch(`${apiBase}${path}`, {
        credentials: "include",
        ...options,
        headers
      });
    } catch (error) {
      throw new Error(t("networkError"));
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || formatError(data.error || "request_failed"));
      error.status = response.status;
      error.code = data.error || "request_failed";
      error.details = data;
      throw error;
    }
    return data;
  };

  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });
  let currentUserPromise = null;

  const getOptionalAccount = async () => {
    if (!currentUserPromise) {
      currentUserPromise = api("/api/auth/me")
        .then((data) => data.user || null)
        .catch(() => null);
    }
    return currentUserPromise;
  };

  const accountProfile = (user) => {
    if (user?.username || user?.displayName) {
      return {
        label: user.username || user.displayName,
        sub: user.discordUserId ? "Discord recovery linked" : t("recoveryNotLinked"),
        avatar: user.discordAvatarUrl || user.robloxAvatarUrl || "",
        fallback: String(user.username || user.displayName || "F").charAt(0).toUpperCase()
      };
    }
    if (user?.robloxUsername) {
      return {
        label: user.robloxUsername,
        sub: maskExternalId(user.robloxUserId) || "Roblox",
        avatar: user.robloxAvatarUrl || "",
        fallback: "R"
      };
    }
    if (user?.discordUsername) {
      return {
        label: user.discordUsername,
        sub: maskExternalId(user.discordUserId) || "Discord",
        avatar: user.discordAvatarUrl || "",
        fallback: "D"
      };
    }
    if (user?.email) {
      return {
        label: user.loginName || user.email.split("@")[0],
        sub: user.emailMasked || maskEmailAddress(user.email),
        avatar: "",
        fallback: "F"
      };
    }
    return { label: t("accountNavProfileFallback"), sub: "Fima", avatar: "", fallback: "F" };
  };

  const profileChip = (user) => {
    const profile = accountProfile(user);
    return `
      <button class="account-nav-profile" type="button" data-account-menu-toggle aria-expanded="false" aria-label="${escapeHtml(profile.label)}">
        ${profile.avatar ? `<img src="${escapeHtml(profile.avatar)}" alt="">` : `<span>${escapeHtml(profile.fallback)}</span>`}
        <div><strong>${escapeHtml(profile.label)}</strong><small>${escapeHtml(profile.sub)}</small></div>
      </button>
    `;
  };

  const profileDropdown = (user) => {
    const profile = accountProfile(user);
    const planLabel = user?.subscriptionStatus ? String(user.subscriptionStatus) : t("noActiveSubscription");
    const adminLink = ["admin", "owner", "super_admin"].includes(String(user?.role || "").toLowerCase())
      ? `<a class="account-dropdown-link" href="/admin">Admin Panel</a>`
      : "";
    return `
      <div class="account-profile-menu" data-account-menu>
        ${profileChip(user)}
        <div class="account-profile-dropdown" data-account-menu-panel hidden>
          <div class="account-profile-summary">
            ${profile.avatar ? `<img src="${escapeHtml(profile.avatar)}" alt="">` : `<span>${escapeHtml(profile.fallback)}</span>`}
            <div><strong>${escapeHtml(profile.label)}</strong><small>${escapeHtml(planLabel)}</small></div>
          </div>
          <a class="account-dropdown-link" href="${dashboardRoute("overview")}">Account</a>
          <a class="account-dropdown-link" href="${dashboardRoute("products")}">${t("myProductsNav")}</a>
          <a class="account-dropdown-link" href="${dashboardRoute("billing")}">${t("billingNav")}</a>
          <a class="account-dropdown-link" href="${dashboardRoute("redeem")}">Redeem / Gift</a>
          <a class="account-dropdown-link" href="${dashboardRoute("referrals")}">Invite Code / Referrals</a>
          <a class="account-dropdown-link" href="${dashboardRoute("security")}">Security / Settings</a>
          <a class="account-dropdown-link" href="${dashboardRoute("downloads")}">Downloads</a>
          <a class="account-dropdown-link" href="${apiBase}/auth/discord/start">${t("linkDiscordRecovery")}</a>
          <a class="account-dropdown-link" href="${dashboardRoute("support")}">${t("supportNav")}</a>
          ${adminLink}
          <button class="account-dropdown-link" type="button" data-logout>${t("logoutNav")}</button>
          ${user?.discordUserId ? "" : `<a class="account-dropdown-warning" href="${apiBase}/auth/discord/start">${t("recoveryNotLinked")} - ${t("linkDiscordRecovery")}</a>`}
        </div>
      </div>
    `;
  };

  const wireAccountDropdown = () => {
    const menu = $("[data-account-menu]");
    if (!menu || menu.dataset.wired === "1") return;
    menu.dataset.wired = "1";
    const toggle = $("[data-account-menu-toggle]", menu);
    const panel = $("[data-account-menu-panel]", menu);
    const setOpen = (open) => {
      if (!panel || !toggle) return;
      if (open) {
        panel.hidden = false;
        window.requestAnimationFrame(() => panel.classList.add("is-open"));
      } else {
        panel.classList.remove("is-open");
        window.setTimeout(() => {
          if (!panel.classList.contains("is-open")) panel.hidden = true;
        }, 180);
      }
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(panel?.hidden);
    });
    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  };

  const renderAccountHeader = (user) => {
    const nav = $(".account-header .nav");
    if (!nav) return;
    nav.innerHTML = `
      <a class="brand" href="/"><img src="/assets/images/fima-logo.png?v=20260526-2" alt=""><strong>Fima Macro</strong></a>
      <div class="links account-main-links">
        ${user ? `
          <a href="/pricing">Pricing</a>
          <a href="/download">${t("downloadApp")}</a>
          <a href="/support">${t("supportNav")}</a>
        ` : `
          <a class="${page === "login" ? "is-active" : ""}" href="/login">${t("loginNav")}</a>
          <a class="nav-register-cta ${page === "register" ? "is-active" : ""}" href="/register">${t("registerButton")}</a>
          <a class="nav-buy-cta" href="/pricing">${t("buyPricing")}</a>
        `}
      </div>
      <div class="account-header-actions">
        ${user ? profileDropdown(user) : ""}
      </div>
    `;
    wireAccountDropdown();
  };

  const hydrateAccountHeader = async () => {
    renderAccountHeader(null);
    const user = await getOptionalAccount();
    renderAccountHeader(user);
    return user;
  };

  const formatError = (code) => ({
    invalid_email: t("invalidEmail"),
    invalid_username: t("invalidUsername"),
    email_domain_has_no_mail: t("invalidEmail"),
    weak_password: t("weakPassword"),
    invalid_roblox_username: t("invalidRoblox"),
    roblox_user_not_found: t("robloxNotFound"),
    email_already_registered: t("emailAlreadyRegistered"),
    invalid_credentials: t("invalidCredentials"),
    unauthorized: t("unauthorized"),
    checkout_disabled: t("checkoutDisabled"),
    license_not_found: t("licenseNotFound"),
    license_banned: t("licenseBanned"),
    not_logged_in: t("unauthorized"),
    discord_not_connected: t("discordNotConnected"),
    roblox_not_connected: t("robloxNotConnected"),
    trial_cooldown_active: t("trialCooldownActive"),
    trial_already_active: t("trialAlreadyActive"),
    invalid_referral_code: t("invalidReferralCode"),
    referral_already_used: t("referralAlreadyUsed"),
    self_referral_not_allowed: t("selfReferralNotAllowed"),
    referral_apply_failed: t("invalidReferralCode"),
    invalid_gift_code: t("giftCodeNotFound"),
    gift_code_not_found: t("giftCodeNotFound"),
    gift_code_redeemed: t("giftAlreadyRedeemed"),
    already_redeemed: t("giftAlreadyRedeemed"),
    gift_code_expired: t("giftExpired"),
    expired: t("giftExpired"),
    gift_code_revoked: t("giftExpired"),
    revoked: t("giftExpired"),
    gift_package_not_found: t("giftCodeNotFound"),
    gift_package_expired: t("giftExpired"),
    gift_package_claimed: t("giftAlreadyRedeemed"),
    package_not_found: t("giftCodeNotFound"),
    package_expired: t("giftExpired"),
    package_claimed: t("giftAlreadyRedeemed"),
    package_revoked: t("giftExpired"),
    already_claimed: t("giftAlreadyRedeemed"),
    invalid_verification_code: t("invalidVerificationCode"),
    invalid_or_expired_verification_code: t("invalidOrExpiredVerificationCode"),
    email_verification_failed: t("invalidOrExpiredVerificationCode"),
    email_verification_send_failed: t("verificationSendFailed"),
    email_delivery_failed: t("resetEmailFailed"),
    password_reset_failed: t("resetEmailFailed"),
    discord_not_linked: t("discordNotLinkedRecovery"),
    discord_user_not_linked: t("discordNotLinkedRecovery"),
    discord_dm_blocked: t("discordDmBlocked"),
    discord_bot_not_ready: t("discordBotOffline"),
    discord_user_not_found: t("discordNotLinkedRecovery"),
    discord_recovery_failed: t("resetEmailFailed"),
    invalid_reset_request: t("weakPassword"),
    invalid_or_expired_token: t("invalidOrExpiredVerificationCode"),
    discord_required: t("discordNotConnected"),
    roblox_required: t("robloxNotConnected"),
    account_mismatch: t("giftExpired"),
    direct_package_expired: t("giftExpired"),
    direct_package_already_claimed: t("giftAlreadyRedeemed")
  }[code] || String(code || "Request failed").replaceAll("_", " "));

  const setMessage = (text, type = "") => {
    const node = $("#message");
    if (!node) return;
    node.textContent = text || "";
    node.className = `message ${type}`.trim();
  };

  const initOauthFlash = () => {
    const params = new URLSearchParams(location.search);
    const error = params.get("error");
    if (!error) return;
    const messages = {
      roblox_rate_limited: state.language === "tr"
        ? "Roblox ba\u011flant\u0131s\u0131 \u015fu an kullan\u0131lm\u0131yor. Kullan\u0131c\u0131 ad\u0131n\u0131 profil i\u00e7in opsiyonel ekleyebilirsin."
        : "Roblox linking is not used right now. You can add a username for profile display only.",
      roblox_oauth_cooldown: state.language === "tr"
        ? "Roblox ba\u011flant\u0131s\u0131 \u015fu an kapal\u0131. Kullan\u0131c\u0131 ad\u0131 sadece profil i\u00e7indir."
        : "Roblox linking is off for now. Username is profile-only.",
      duplicate_oauth_callback: state.language === "tr"
        ? "Roblox ba\u011flant\u0131s\u0131 kald\u0131r\u0131ld\u0131. Dashboard'u yenileyebilirsin."
        : "Roblox linking was removed. You can refresh the dashboard.",
      roblox_oauth_state_invalid: state.language === "tr"
        ? "Roblox ba\u011flant\u0131s\u0131 kald\u0131r\u0131ld\u0131. Kullan\u0131c\u0131 ad\u0131 opsiyonel profil bilgisidir."
        : "Roblox linking was removed. Username is optional profile info.",
      roblox_oauth_removed: state.language === "tr"
        ? "Roblox ba\u011flant\u0131s\u0131 \u015fu an kullan\u0131lm\u0131yor. Kullan\u0131c\u0131 ad\u0131 sadece profil ve makro ki\u015fiselle\u015ftirme i\u00e7indir."
        : "Roblox linking is not used right now. Username is only for profile and macro personalization."
    };
    setMessage(messages[error] || errorMessage(error), "error");
  };

  const requireLogin = async () => {
    try {
      return (await api("/api/auth/me")).user;
    } catch {
      window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      return null;
    }
  };

  const initLogout = () => {
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-logout]");
      if (!button) return;
      button.disabled = true;
      currentUserPromise = null;
      await post("/api/auth/logout", {});
      window.location.href = "/login";
    });
  };

  const initAuthForm = (endpoint, successTarget) => {
    const form = $("form[data-auth-form]");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      setMessage(t("working"));
      try {
        const password = form.password?.value || "";
        let payload;
        if (endpoint.includes("register")) {
          const username = (form.username?.value || "").trim();
          const email = (form.email?.value || "").trim();
          const confirm = form.confirmPassword?.value || "";
          if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new Error(t("invalidUsername"));
          if (password !== confirm) throw new Error(t("passwordMismatch"));
          payload = {
            username,
            usernameOnly: !email,
            email,
            password,
            robloxUsername: form.robloxUsername?.value || "",
            referralCode: form.referralCode?.value || ""
          };
        } else {
          const login = (form.login?.value || form.email?.value || "").trim();
          payload = { login, email: login, username: login, password };
        }
        await post(endpoint, payload);
        currentUserPromise = null;
        setMessage(endpoint.includes("register") ? t("registered") : t("loggedIn"), "good");
        const next = new URLSearchParams(location.search).get("next") || successTarget;
        window.setTimeout(() => { window.location.href = next; }, 400);
      } catch (error) {
        setMessage(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });
  };

  const initRobloxPreview = () => {
    const input = $("#robloxUsername");
    const preview = $("#robloxPreview");
    if (!input || !preview) return;
    const render = () => {
      const username = input.value.trim();
      if (!username) {
        preview.innerHTML = `<div class="avatar-placeholder">R</div><div><strong>${t("roblox")}</strong><span>${t("noRoblox")}</span></div>`;
        return;
      }
      preview.innerHTML = `<div class="avatar-placeholder">R</div><div><strong>@${escapeHtml(username)}</strong><span>${t("robloxProfileNote")}</span></div>`;
    };
    render();
    input.addEventListener("input", render);
  };

  const initReferralPrefill = () => {
    const input = $("input[name='referralCode']");
    const notice = $("#referralNotice");
    if (!input) return;
    const ref = new URLSearchParams(location.search).get("ref") || "";
    if (ref) {
      input.value = ref;
      if (notice) notice.innerHTML = `<strong>${escapeHtml(t("referralOptional"))}</strong><span>${escapeHtml(t("referralPrefilled"))}</span>`;
    } else if (notice) {
      notice.innerHTML = `<strong>${escapeHtml(t("referralOptional"))}</strong><span>${escapeHtml(t("referralApplyIntro"))}</span>`;
    }
  };

  const initForgotPassword = () => {
    const form = $("form[data-forgot-form]");
    if (!form) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      setMessage(t("working"));
      try {
        const login = (form.login?.value || form.email?.value || "").trim();
        const data = await post("/api/auth/forgot-password", { login, username: login, method: "discord" });
        setMessage(data.resetUrl ? `Dev reset URL: ${data.resetUrl}` : (data.message || t("resetCodeSent")), "good");
        window.setTimeout(() => {
          window.location.href = `/reset-password?login=${encodeURIComponent(login)}`;
        }, 850);
      } catch (error) {
        setMessage(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });
  };

  const initResetPassword = () => {
    const form = $("form[data-reset-form]");
    if (!form) return;
    form.token.value = new URLSearchParams(location.search).get("token") || "";
    const strength = $("[data-password-strength]");
    const scorePassword = (value) => {
      let score = 0;
      if (value.length >= 8) score += 1;
      if (/[A-Z]/.test(value)) score += 1;
      if (/[a-z]/.test(value)) score += 1;
      if (/\d/.test(value)) score += 1;
      if (/[^A-Za-z0-9]/.test(value)) score += 1;
      return score;
    };
    const updateStrength = () => {
      if (!strength) return;
      const score = scorePassword(form.password.value || "");
      const labels = ["Easy", "Easy", "Normal", "Hard", "Hard", "Impossible"];
      strength.dataset.score = String(score);
      const meter = strength.querySelector("span");
      const label = strength.querySelector("small");
      if (meter) meter.style.width = `${Math.max(8, score * 20)}%`;
      if (label) label.textContent = `${t("passwordStrength")}: ${labels[score]}`;
    };
    form.password.addEventListener("input", updateStrength);
    updateStrength();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      setMessage(t("working"));
      try {
        if (form.confirmPassword && form.password.value !== form.confirmPassword.value) {
          throw new Error(t("passwordMismatch"));
        }
        await post("/api/auth/reset-password", { token: form.token.value, password: form.password.value });
        setMessage(t("resetComplete"), "good");
        window.setTimeout(() => { window.location.href = "/login"; }, 900);
      } catch (error) {
        setMessage(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });
  };

  const saleBanner = () => `
    <section class="sale-panel">
      <div>
        <span class="sale-kicker">${t("saleTitle")}</span>
        <strong>${t("saleText")}</strong>
      </div>
      <div class="sale-clock"><span>${t("saleEnds")}</span><b data-sale-countdown>${duration((saleEndsAt.getTime() - Date.now()) / 1000)}</b></div>
    </section>
  `;

  const renderProducts = (products) => {
    const target = $("#products");
    if (!target) return;
    target.innerHTML = products.length ? products.map((product) => `
      <article class="product-card">
        <div class="card-top">
          <div>
            <span class="pill">${escapeHtml(product.category || "Fima")}</span>
            <h3>${escapeHtml(product.name)}</h3>
          </div>
          <span class="price">${product.price ? money(product.price.amount, product.price.currency) : "-"}</span>
        </div>
        <p>${escapeHtml(product.description || "Premium Fima Macro product access.")}</p>
        <button class="button" type="button" data-buy-product="${escapeHtml(product.id)}" ${product.price ? "" : "disabled"}>${t("buyWithStripe")}</button>
      </article>
    `).join("") : `<div class="empty-state"><h3>${t("noStoreProducts")}</h3><a class="button" href="/pricing">${t("buyPricing")}</a></div>`;
  };

  const initStore = async () => {
    const target = $("#products");
    if (!target) return;
    target.innerHTML = `<div class="panel panel-pad">${t("loadingProducts")}</div>`;
    const user = await requireLogin();
    if (!user) return;
    renderAccountHeader(user);
    $("#storeSale")?.insertAdjacentHTML("afterbegin", saleBanner());
    const data = await api("/api/store/products");
    renderProducts(data.products || []);
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-buy-product]");
      if (!button) return;
      button.disabled = true;
      setMessage(t("checkout"));
      try {
        const checkout = await post("/api/store/checkout", { productId: button.dataset.buyProduct });
        window.location.href = checkout.url;
      } catch (error) {
        setMessage(error.message, "error");
        button.disabled = false;
      }
    });
  };

  const statusLabel = (item) => {
    if (item.license?.lifetime) return t("lifetime");
    if (item.license?.expired) return t("expired");
    if (item.license?.status === "active") return t("active");
    return item.license?.status || item.status || "-";
  };

  const productCard = (item, context = {}) => {
    const license = item.license;
    const hasLicense = Boolean(license?.hasLicenseKey || license?.licenseKey || license?.licenseKeyMasked);
    const licenseRecordId = String(license?.id || "").trim();
    const licenseSecretId = hasLicense && license?.licenseKey ? storeLicenseSecret(license) : "";
    const licenseActionId = licenseRecordId || licenseSecretId;
    const licenseMasked = license?.licenseKeyMasked || maskSensitiveCode(license?.licenseKey);
    const statusText = String(license?.status || item.status || "").toLowerCase();
    const needsSupport = Boolean(license?.expired || ["banned", "disabled", "revoked", "canceled", "cancelled"].includes(statusText));
    const subscriptionStatus = license?.subscriptionStatus || item.subscriptionStatus || (license?.plan === "monthly" ? statusLabel(item) : "-");
    const hwidBound = Boolean(license?.hwidBound || license?.boundHwid || String(license?.hwidStatus || "").toLowerCase() === "bound");
    const discordLinked = Boolean(license?.discordLinked || context.user?.discordUserId || context.integrations?.discord?.connected);
    const robloxLinked = Boolean(license?.robloxLinked || context.integrations?.roblox?.connected);
    return `
      <article class="access-card ${license?.expired ? "is-expired" : ""}">
        <div class="access-head">
          <div>
            <span class="pill">${escapeHtml(hasLicense ? t("licenseAccess") : t("productAccess"))}</span>
            <h3>${escapeHtml(item.name || "Fima Macro")}</h3>
          </div>
          <span class="status-pill">${escapeHtml(statusLabel(item))}</span>
        </div>
        ${hasLicense ? `
          <div class="key-box">
            <span>${t("maskedLicenseKey")}</span>
            <code>${escapeHtml(licenseMasked)}</code>
          </div>
          <div class="metric-grid">
            <div><span>${t("plan")}</span><strong>${escapeHtml(license.planLabel || license.plan)}</strong></div>
            <div><span>${t("status")}</span><strong>${escapeHtml(statusLabel(item))}</strong></div>
            <div><span>${t("expires")}</span><strong>${license.lifetime ? t("lifetime") : date(license.expiresAt)}</strong></div>
            <div><span>${t("remaining")}</span><strong data-countdown="${escapeHtml(license.expiresAt || "")}">${license.lifetime ? t("lifetime") : duration(license.remainingSeconds)}</strong></div>
            <div><span>${t("subscription")}</span><strong>${escapeHtml(subscriptionStatus)}</strong></div>
            <div><span>${t("hwid")}</span><strong>${hwidBound ? t("bound") : t("unbound")}</strong></div>
            <div><span>${t("discord")}</span><strong>${discordLinked ? t("yes") : t("no")}</strong></div>
            <div><span>${t("roblox")}</span><strong>${robloxLinked ? t("yes") : t("no")}</strong></div>
          </div>
          ${needsSupport ? `<p class="access-warning">${escapeHtml(t("needsSupport"))} <a href="${dashboardRoute("support")}">${escapeHtml(t("openSupport"))}</a></p>` : ""}
          <div class="access-actions">
            <button class="button secondary" type="button" ${licenseRecordId ? `data-copy-license-id="${escapeHtml(licenseRecordId)}"` : `data-copy-license-secret="${escapeHtml(licenseActionId)}"`}>${t("copyKey")}</button>
            <button class="button" type="button" ${licenseRecordId ? `data-download-license-id="${escapeHtml(licenseRecordId)}"` : `data-download-license-secret="${escapeHtml(licenseActionId)}"`}>${t("download")}</button>
            ${license.canExtend ? `<button class="button secondary" type="button" ${licenseRecordId ? `data-extend-license-id="${escapeHtml(licenseRecordId)}"` : `data-extend-license-secret="${escapeHtml(licenseActionId)}"`} data-plan="${escapeHtml(license.plan)}">${license.expired ? t("renew") : t("extend")}</button>` : ""}
          </div>
        ` : `
          <p>${escapeHtml(item.product?.description || "Purchased product access is linked to this account.")}</p>
          <div class="metric-grid">
            <div><span>${t("status")}</span><strong>${escapeHtml(item.status)}</strong></div>
            <div><span>${t("purchased")}</span><strong>${date(item.createdAt)}</strong></div>
            <div><span>${t("total")}</span><strong>${money(item.amountTotal, item.currency)}</strong></div>
          </div>
        `}
      </article>
    `;
  };

  const renderAccountProducts = (items, targetSelector = "#purchases") => {
    const target = $(targetSelector);
    if (!target) return;
    licenseSecretStore.clear();
    const context = window.fimaAccountProductContext || {};
    target.innerHTML = items.length
      ? `<div class="access-grid">${items.map((item) => productCard(item, context)).join("")}</div>`
      : `<div class="empty-state"><h3>${t("noProducts")}</h3><a class="button" href="/pricing">${t("buyPricing")}</a></div>`;
    updateCountdowns();
  };

  const renderLicenses = (licenses = []) => {
    const target = $("#licenseList");
    if (!target) return;
    target.innerHTML = licenses.length
      ? `<div class="rows">${licenses.map((license) => `
          <div class="row">
            <span>${escapeHtml(license.planLabel || license.plan)}</span>
            <code>${escapeHtml(license.licenseKeyMasked || maskSensitiveCode(license.licenseKey))}</code>
          </div>
        `).join("")}</div>`
      : `<div class="panel panel-pad">${t("noLicenses")}</div>`;
  };

  const dashboardRevealValues = new Map();

  const renderAccountSummary = (user) => {
    const username = user.username || user.loginName || t("accountNavProfileFallback");
    const emailMasked = user.emailMasked || maskEmailAddress(user.email);
    dashboardRevealValues.set("accountUsername", username);
    dashboardRevealValues.set("accountEmail", user.email || emailMasked || "");
    $("#accountUsername") && ($("#accountUsername").textContent = username);
    $("#accountEmail") && ($("#accountEmail").textContent = emailMasked || (user.discordUserId ? t("connected") : t("notConnected")));
    $("#stripeCustomer") && ($("#stripeCustomer").textContent = user.stripeCustomerIdMasked || maskExternalId(user.stripeCustomerId) || t("willBeCreated"));
    const roblox = $("#accountRoblox");
    if (roblox) {
      roblox.innerHTML = user.robloxUsername
        ? `<div class="mini-profile">${user.robloxAvatarUrl ? `<img src="${escapeHtml(user.robloxAvatarUrl)}" alt="">` : `<span></span>`}<div><strong>${escapeHtml(user.robloxUsername)}</strong><small>${escapeHtml(user.robloxUserIdMasked || maskExternalId(user.robloxUserId))}</small></div></div>`
        : t("noRoblox");
    }
  };

  const renderBillingSummary = (products = [], licenses = []) => {
    const target = $("#billingSummary");
    if (!target) return;
    const active = products.filter((item) => String(item.status || "").toLowerCase() === "active");
    const recurring = products.filter((item) => /monthly|subscription/i.test(`${item.plan || ""} ${item.planLabel || ""} ${item.productName || ""}`));
    target.innerHTML = `
      <div class="billing-summary-grid">
        <article class="billing-action-card">
          <span class="pill">Billing</span>
          <strong>Renew or extend access</strong>
          <p>Use this area for renewals and subscription actions. Your license cards stay under My Products.</p>
          <a class="button" href="/pricing">Renew / extend</a>
        </article>
        <article class="billing-action-card">
          <span class="pill">Subscriptions</span>
          <strong>${recurring.length || 0} subscription record${recurring.length === 1 ? "" : "s"}</strong>
          <p>Need to cancel or change a subscription? Open support with masked account/order details only.</p>
          <a class="button secondary" href="/support">Open billing support</a>
        </article>
        <article class="billing-action-card">
          <span class="pill">Access</span>
          <strong>${active.length || licenses.length || 0} active/access record${(active.length || licenses.length) === 1 ? "" : "s"}</strong>
          <p>Copy keys, download the app and check HWID status from My Products.</p>
          <a class="button secondary" href="/dashboard/products">Go to My Products</a>
        </article>
      </div>
    `;
  };

  const renderEmailVerification = (user = {}) => {
    const target = $("#emailVerification");
    if (!target) return;
    const discordLinked = Boolean(user.discordUserId || user.discordUsername);
    const emailLinked = Boolean(user.emailLinked || user.email || user.emailMasked);
    const emailVerified = Boolean(user.emailVerified || user.emailVerifiedAt);
    target.innerHTML = `
      <div class="verification-card ${discordLinked ? "is-verified" : "is-pending"}">
        <div class="verification-status">
          <span class="status-pill">${discordLinked ? t("connected") : t("notConnected")}</span>
          <div>
            <strong>${escapeHtml(discordLinked ? (user.discordUsername || user.discordUserId || "Discord recovery linked") : "Discord recovery not linked")}</strong>
            <small>${discordLinked ? "The Fima bot can DM password reset codes to this Discord account." : "Link Discord to receive password reset codes by DM. Discord is also required for the free trial."}</small>
          </div>
        </div>
        ${!discordLinked ? `
          <div class="verification-actions">
            <a class="button" href="${apiBase}/auth/discord/start">${t("linkDiscordRecovery")}</a>
            <a class="button secondary" href="/forgot-password">${t("forgotTitle")}</a>
          </div>
        ` : `
          <div class="verification-actions">
            <a class="button secondary" href="/forgot-password">Test recovery DM</a>
          </div>
        `}
      </div>
      <div class="verification-card ${emailVerified ? "is-verified" : "is-pending"}">
        <div class="verification-status">
          <span class="status-pill">${emailVerified ? t("emailVerified") : emailLinked ? t("emailNotVerified") : t("notConnected")}</span>
          <div>
            <strong>${escapeHtml(emailLinked ? (user.emailMasked || user.email || t("email")) : t("addEmail"))}</strong>
            <small>${escapeHtml(emailLinked ? t("emailVerificationIntro") : t("emailLinkIntro"))}</small>
          </div>
        </div>
        ${!emailLinked ? `
          <form class="verification-actions" data-email-link-form>
            <label class="sr-only" for="accountEmailLink">${t("email")}</label>
            <input id="accountEmailLink" name="email" type="email" autocomplete="email" placeholder="${escapeHtml(t("emailPlaceholder"))}" required>
            <button class="button" type="submit">${t("addEmail")}</button>
          </form>
        ` : !emailVerified ? `
          <form class="verification-actions email-code-actions" data-email-verification-form>
            <label class="sr-only" for="accountEmailVerificationCode">${t("verificationCode")}</label>
            <input id="accountEmailVerificationCode" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${escapeHtml(t("verificationCode"))}" required>
            <button class="button" type="submit">${t("confirmVerificationCode")}</button>
            <button class="button secondary" type="button" data-send-email-verification>${t("sendVerificationCode")}</button>
          </form>
        ` : `
          <div class="verification-actions">
            <button class="button secondary" type="button" data-send-email-verification>${t("sendVerificationCode")}</button>
          </div>
        `}
      </div>
    `;
  };

  const profileMini = (account, fallbackLabel) => {
    if (!account?.connected && !account?.username) {
      return `<div class="mini-profile is-missing"><div class="avatar-placeholder">!</div><div><strong>${escapeHtml(fallbackLabel)}</strong><small>${t("notConnected")}</small></div></div>`;
    }
    const sub = account.connected ? (maskExternalId(account.id) || t("connected")) : (account.pending ? t("robloxPending") : t("notConnected"));
    return `<div class="mini-profile">${account.avatar ? `<img src="${escapeHtml(account.avatar)}" alt="">` : `<span>${escapeHtml(String(account.username || fallbackLabel).slice(0, 1).toUpperCase())}</span>`}<div><strong>${escapeHtml(account.username || fallbackLabel)}</strong><small>${escapeHtml(sub)}</small></div></div>`;
  };

  const renderConnectedAccounts = (integrations = {}) => {
    const target = $("#connectedAccounts");
    if (!target) return;
    const discord = integrations.discord || {};
    const roblox = integrations.roblox || {};
    target.innerHTML = `
      <div class="integration-grid">
        <article class="integration-card ${discord.connected ? "is-connected" : "is-missing"}">
          <div>
            <span class="pill">${t("discord")}</span>
            ${profileMini(discord, t("discord"))}
            <p class="integration-note">Optional for recovery. Required only for the free trial.</p>
          </div>
          <div class="integration-actions">
            <span class="status-pill">${discord.connected ? t("connected") : t("notConnected")}</span>
            ${discord.connected
              ? `<a class="button secondary" href="${apiBase}/auth/discord/start?returnTo=${encodeURIComponent(dashboardRoute("connected-accounts"))}">${t("reconnectDiscord")}</a><button class="button danger" type="button" data-disconnect-provider="discord">${t("disconnectDiscord")}</button>`
              : `<a class="button" href="${apiBase}/auth/discord/start?returnTo=${encodeURIComponent(dashboardRoute("connected-accounts"))}">${t("connectDiscord")}</a>`}
          </div>
        </article>
        <article class="integration-card ${roblox.connected ? "is-connected" : "is-missing"}">
          <div>
            <span class="pill">${t("roblox")}</span>
            ${profileMini(roblox, t("roblox"))}
            <p class="integration-note">${t("robloxProfileNote")}</p>
          </div>
          <div class="integration-actions">
            <span class="status-pill">${roblox.connected ? t("robloxVerified") : roblox.pending ? t("robloxPending") : t("notConnected")}</span>
            <a class="button secondary" href="${dashboardRoute("overview")}#roblox-profile">${roblox.connected ? t("reconnectRoblox") : t("connectRoblox")}</a>
          </div>
        </article>
      </div>
    `;
  };

  const renderRobloxProfileSettings = (user = {}) => {
    const target = $("#robloxProfileSettings");
    if (!target) return;
    const current = user.robloxUsername || "";
    const integrations = window.fimaAccountProductContext?.integrations || {};
    const roblox = integrations.roblox || {};
    const pending = roblox.pending || null;
    const verified = Boolean(user.robloxVerified || roblox.connected);
    const avatar = user.robloxAvatarUrl || roblox.avatar || pending?.avatar || "";
    const profileUrl = roblox.profileUrl || pending?.profileUrl || "";
    const verifiedCard = verified ? `
      <div class="verified-roblox-profile">
        ${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : `<span>R</span>`}
        <div>
          <strong>@${escapeHtml(current || roblox.username || t("roblox"))}</strong>
          <small>${t("robloxVerified")} ${user.robloxUserIdMasked ? `- ${escapeHtml(user.robloxUserIdMasked)}` : ""}</small>
        </div>
        ${profileUrl ? `<a class="button secondary" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener">${t("openRobloxProfile")}</a>` : ""}
      </div>
    ` : "";
    const pendingCard = pending ? `
      <div class="roblox-verify-pending">
        <p>${t("robloxVerifyInstructions")}</p>
        <div class="verify-code-box">
          <code>${escapeHtml(pending.code || "")}</code>
          <button class="button secondary" type="button" data-copy-roblox-code="${escapeHtml(pending.code || "")}">${t("copyVerifyCode")}</button>
        </div>
        <div class="verification-actions">
          ${pending.profileUrl ? `<a class="button secondary" href="${escapeHtml(pending.profileUrl)}" target="_blank" rel="noopener">${t("openRobloxProfile")}</a>` : ""}
          <button class="button" type="button" data-confirm-roblox-verification>${t("confirmRobloxVerification")}</button>
        </div>
      </div>
    ` : "";
    target.innerHTML = `
      <form class="verification-card roblox-profile-form ${verified ? "is-verified" : ""}" id="roblox-profile" data-roblox-profile-form>
        <div class="verification-status">
          <span class="status-pill">${verified ? t("robloxVerified") : pending ? t("robloxPending") : t("notConnected")}</span>
          <div>
            <strong>${t("robloxUsername")}</strong>
            <small>${verified ? t("robloxProfileNote") : t("robloxVerifyIntro")}</small>
          </div>
        </div>
        ${verifiedCard}
        ${pendingCard}
        <div class="verification-actions roblox-username-actions">
          <input name="robloxUsername" type="text" autocomplete="off" minlength="3" maxlength="20" value="${escapeHtml(current)}" placeholder="${escapeHtml(t("robloxUsername"))}">
          <button class="button" type="submit">${t("saveRobloxUsername")}</button>
          ${current || verified || pending ? `<button class="button secondary" type="button" data-clear-roblox-username>${t("clearRobloxUsername")}</button>` : ""}
        </div>
      </form>
    `;
  };

  const requirementLabel = (id) => ({
    account: t("accountLoggedIn"),
    discord: t("discordConnected"),
    roblox: t("robloxConnected")
  }[id] || id);

  const renderMonthlyTrial = (trial = {}) => {
    const target = $("#monthlyTrial");
    if (!target) return;
    const requirements = trial.requirements || [];
    const statusText = trial.active ? t("trialActive") : trial.cooldownActive ? t("trialCooldown") : trial.eligible ? t("trialAvailable") : t("trialLocked");
    const missingDiscord = requirements.some((item) => item.id === "discord" && !item.complete);
    const missingRoblox = requirements.some((item) => item.id === "roblox" && !item.complete);
    const promo = trial.promo || {};
    const trialLabel = trial.label || (promo.active ? `${promo.promoDays || promo.days || 7}-Day Free Trial` : t("claimTrial").replace(/^Claim\s+/i, ""));
    const promoBanner = promo.active ? `
      <div class="trial-promo-card">
        <div>
          <span>Limited beta offer</span>
          <strong>Free trials are now ${escapeHtml(String(promo.promoDays || promo.days || 7))} days for the next week.</strong>
          <p>One promotional trial per account during this event.</p>
        </div>
        ${promo.endAt ? `<b data-countdown="${escapeHtml(promo.endAt)}"></b>` : ""}
      </div>
    ` : "";
    target.innerHTML = `
      ${promoBanner}
      <div class="trial-card">
        <div class="trial-main">
          <div class="card-top">
            <div>
              <span class="pill">${statusText}</span>
              <h3>${t("trialRequirements")}</h3>
            </div>
            <span class="status-pill">${statusText}</span>
          </div>
          <p>${promo.active ? `${escapeHtml(trialLabel)} is available during the beta promotion. Discord and verified Roblox are required for trial claims.` : t("trialIntro")}</p>
          <div class="requirement-list">
            ${requirements.map((item) => `<div class="requirement ${item.complete ? "is-complete" : "is-missing"}"><span>${item.complete ? "OK" : "!"}</span><strong>${escapeHtml(requirementLabel(item.id))}</strong></div>`).join("")}
          </div>
          ${missingDiscord ? `<div class="trial-hint"><span>${t("connectDiscordTrial")}</span><a class="button secondary" href="${apiBase}/auth/discord/start?returnTo=${encodeURIComponent(dashboardRoute("connected-accounts"))}">${t("connectDiscord")}</a></div>` : ""}
          ${missingRoblox ? `<div class="trial-hint"><span>${t("connectRobloxTrial")}</span><a class="button secondary" href="${dashboardRoute("overview")}#roblox-profile">${t("connectRoblox")}</a></div>` : ""}
          ${!missingDiscord && !missingRoblox && !trial.active && !trial.cooldownActive ? `<div class="trial-hint is-ready"><span>${t("requirementsComplete")}</span></div>` : ""}
        </div>
        <aside class="trial-side">
          ${trial.active ? `<div><span>${t("remaining")}</span><strong data-countdown="${escapeHtml(trial.expiresAt || "")}">${duration(trial.activeSeconds)}</strong></div>` : ""}
          ${trial.nextTrialAvailableAt ? `<div><span>${t("nextTrial")}</span><strong>${date(trial.nextTrialAvailableAt)}</strong><small data-countdown="${escapeHtml(trial.nextTrialAvailableAt)}">${duration(trial.cooldownSeconds)}</small></div>` : ""}
          ${trial.activeLicense?.hasLicenseKey || trial.activeLicense?.licenseKeyMasked || trial.activeLicense?.licenseKey ? `<div class="key-box"><span>${t("licenseKey")}</span><code>${escapeHtml(trial.activeLicense.licenseKeyMasked || maskSensitiveCode(trial.activeLicense.licenseKey))}</code></div>` : ""}
          <button class="button" type="button" data-claim-trial ${trial.eligible ? "" : "disabled"}>Claim ${escapeHtml(trialLabel)}</button>
        </aside>
      </div>
    `;
    updateCountdowns();
  };

  const giftCodeStatusLabel = (status, used) => {
    const clean = String(status || "").toLowerCase();
    if (used || clean === "redeemed") return t("usedGiftCode");
    if (clean === "revoked") return t("revokedGiftCode");
    if (clean === "expired") return t("expired");
    return t("unusedGiftCode");
  };

  const renderPurchasedGiftCodeCard = (item) => {
    const code = item.giftCode ? maskSensitiveCode(item.giftCode) : item.maskedCode || "";
    const used = Boolean(item.used || item.status === "redeemed");
    const generated = item.generatedLicense || null;
    const giftSecretId = item.giftCode && !used ? storeSensitiveSecret(item.giftCode, `gift-${item.id || "code"}`) : "";
    return `
      <article class="gift-code-card ${used ? "is-used" : "is-unused"}">
        <div class="card-top">
          <div>
            <span class="pill">${escapeHtml(giftCodeStatusLabel(item.status, used))}</span>
            <h4>${escapeHtml(item.productName || item.planLabel || item.plan || "Fima Macro")}</h4>
          </div>
          <span class="status-pill">${escapeHtml(item.planLabel || item.plan || "")}</span>
        </div>
        <div class="gift-code-box">
          <code>${escapeHtml(code || item.maskedCode || "FIMA-GIFT-****")}</code>
          ${giftSecretId ? `<button class="button secondary" type="button" data-copy-secret="${escapeHtml(giftSecretId)}">${t("copyGiftCode")}</button>` : ""}
        </div>
        ${item.shownOnceOnly ? `<p class="gift-warning">${t("giftShownOnceOnly")}</p>` : ""}
        <div class="gift-meta-grid">
          <span>${t("purchased")}: <b>${date(item.purchasedAt || item.createdAt)}</b></span>
          <span>${t("status")}: <b>${escapeHtml(giftCodeStatusLabel(item.status, used))}</b></span>
          ${item.redeemedAt ? `<span>${t("usedGiftCode")}: <b>${date(item.redeemedAt)}</b></span>` : ""}
          ${generated?.hasLicenseKey || generated?.licenseKeyMasked || generated?.licenseKey ? `<span>${t("licenseKey")}: <code>${escapeHtml(generated.licenseKeyMasked || maskSensitiveCode(generated.licenseKey))}</code></span>` : ""}
        </div>
      </article>
    `;
  };

  const renderGiftHistoryRow = (item) => {
    const license = item.generatedLicense || {};
    return `
      <article class="gift-history-row">
        <div>
          <strong>${escapeHtml(item.planLabel || item.productName || item.plan || "Fima Macro")}</strong>
          <small>${escapeHtml(item.maskedCode || "")} ${item.redeemedAt ? `/ ${date(item.redeemedAt)}` : ""}</small>
        </div>
        <span class="status-pill">${escapeHtml(giftCodeStatusLabel(item.status, item.used))}</span>
        ${license.hasLicenseKey || license.licenseKeyMasked || license.licenseKey ? `<code>${escapeHtml(license.licenseKeyMasked || maskSensitiveCode(license.licenseKey))}</code>` : ""}
      </article>
    `;
  };

  const renderGiftClaims = (pendingGifts = [], integrations = {}, purchasedGiftCodes = [], giftHistory = []) => {
    const target = $("#giftClaims");
    if (!target) return;
    const discordReady = Boolean(integrations.discord?.connected);
    const robloxReady = Boolean(integrations.roblox?.connected);
    const missing = "";
    const packages = pendingGifts || [];
    const purchased = purchasedGiftCodes || [];
    const history = giftHistory || [];
    target.innerHTML = `
      <div class="gift-claim-grid">
        <article class="gift-redeem-card">
          <div>
            <h3>${t("giftCodeTitle")}</h3>
            <p>${t("giftCodeIntro")}</p>
          </div>
          <form data-gift-code-form>
            <input name="code" type="text" maxlength="64" autocomplete="off" placeholder="${escapeHtml(t("giftCodePlaceholder"))}" required>
            <button class="button" type="submit">${t("redeemGiftCode")}</button>
          </form>
          <div class="gift-claim-note">
            <span>${t("giftRequirements")}</span>
            <span class="status-pill">${t("requirementsComplete")}</span>
          </div>
        </article>
        <article class="gift-redeem-card">
          <div class="section-heading compact">
            <div>
              <h3>${t("pendingDirectGifts")}</h3>
              <p>${t("giftAccessIntro")}</p>
            </div>
            <span class="pill">${packages.length}</span>
          </div>
          <div class="gift-package-list">
            ${packages.length ? packages.map((item) => `
              <div class="gift-package-card">
                <div>
                  <strong>${escapeHtml(item.planLabel || item.plan)}</strong>
                  <small>${escapeHtml(item.message || item.notes || t("giftRequirements"))}</small>
                  ${item.claimExpiresAt ? `<small>${t("expires")}: ${date(item.claimExpiresAt)} / <b data-countdown="${escapeHtml(item.claimExpiresAt)}"></b></small>` : ""}
                </div>
                <button class="button secondary" type="button" data-claim-direct-gift="${escapeHtml(item.id)}">${t("claimGift")}</button>
              </div>
            `).join("") : `<div class="empty-state">${t("noPendingGifts")}</div>`}
          </div>
        </article>
        <article class="gift-redeem-card gift-purchased-card">
          <div class="section-heading compact">
            <div>
              <h3>${t("purchasedGiftCodes")}</h3>
              <p>${t("giftStartsOnRedeem")}</p>
            </div>
            <span class="pill">${purchased.length}</span>
          </div>
          <div class="gift-code-list">
            ${purchased.length ? purchased.map(renderPurchasedGiftCodeCard).join("") : `<div class="empty-state">${t("noPurchasedGiftCodes")}</div>`}
          </div>
        </article>
        <article class="gift-redeem-card gift-history-card">
          <div class="section-heading compact">
            <div>
              <h3>${t("giftHistory")}</h3>
              <p>${t("giftRedeemedText")}</p>
            </div>
          </div>
          <div class="gift-history-list">
            ${history.length ? history.map(renderGiftHistoryRow).join("") : `<div class="empty-state">${t("noGiftHistory")}</div>`}
          </div>
        </article>
      </div>
    `;
    updateCountdowns();
  };

  const renderGiftResult = (recipient) => {
    const discord = recipient.discord || {};
    const roblox = recipient.roblox || {};
    const avatar = roblox.avatar || discord.avatar || "";
    const name = roblox.username || discord.username || recipient.maskedEmail || "Fima user";
    const sub = [recipient.maskedEmail, discord.connected ? "Discord" : "", roblox.connected ? "Roblox" : ""].filter(Boolean).join(" / ");
    return `
      <article class="gift-result-card" data-gift-result-id="${escapeHtml(recipient.id)}">
        <div class="mini-profile">
          ${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : `<span>F</span>`}
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(sub)}</small>
          </div>
        </div>
        <div class="gift-badges">
          <span class="${discord.connected ? "is-on" : ""}">Discord</span>
          <span class="${roblox.connected ? "is-on" : ""}">Roblox</span>
        </div>
        <button class="button secondary" type="button" data-select-gift-recipient="${escapeHtml(recipient.id)}">${t("chooseRecipient")}</button>
      </article>
    `;
  };

  const giftPlanButtons = (recipientId) => ([
    ["3days", t("giftBuy3days")],
    ["monthly", t("giftBuyMonthly")],
    ["lifetime", t("giftBuyLifetime")]
  ]).map(([plan, label]) => `
    <a class="button ${plan === "monthly" ? "primary" : "secondary"}" href="/pricing?giftRecipient=${encodeURIComponent(recipientId)}&checkout=${encodeURIComponent(plan)}" data-gift-plan="${escapeHtml(plan)}">${escapeHtml(label)}</a>
  `).join("");

  const renderSelectedGiftRecipient = (recipient) => {
    const target = $("#giftRecipientSelected");
    if (!target) return;
    if (!recipient?.id) {
      target.innerHTML = "";
      target.hidden = true;
      return;
    }
    const discord = recipient.discord || {};
    const roblox = recipient.roblox || {};
    const avatar = roblox.avatar || discord.avatar || "";
    const name = roblox.username || discord.username || recipient.maskedEmail || "Fima user";
    const sub = [recipient.maskedEmail, discord.connected ? "Discord" : "", roblox.connected ? "Roblox" : ""].filter(Boolean).join(" / ");
    target.hidden = false;
    target.innerHTML = `
      <article class="gift-selected-card">
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">${t("selectedGiftRecipient")}</p>
            <h3>${escapeHtml(name)}</h3>
            <p>${escapeHtml(sub)}</p>
          </div>
          <button class="button secondary" type="button" data-clear-gift-recipient>${t("changeGiftRecipient")}</button>
        </div>
        <p>${t("giftRecipientReady")}</p>
        <div class="gift-plan-actions">${giftPlanButtons(recipient.id)}</div>
      </article>
    `;
  };

  const initGiftRecipientSearch = () => {
    const target = $("#giftRecipientSearch");
    if (!target) return;
    target.innerHTML = `
      <div class="gift-search-panel">
        <div>
          <input id="giftRecipientQuery" type="search" autocomplete="off" placeholder="${escapeHtml(t("giftSearchPlaceholder"))}">
          <p>${t("giftSearchHint")}</p>
        </div>
        <div id="giftRecipientSelected" class="gift-selected" hidden></div>
        <div id="giftRecipientResults" class="gift-results"><div class="empty-state">${t("giftSearchStart")}</div></div>
      </div>
    `;
    const input = $("#giftRecipientQuery");
    const results = $("#giftRecipientResults");
    let lastRecipients = [];
    let timer;
    input?.addEventListener("input", () => {
      window.clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < 2) {
        results.innerHTML = `<div class="empty-state">${t("giftSearchStart")}</div>`;
        return;
      }
      results.innerHTML = `<div class="empty-state">${t("giftSearchLoading")}</div>`;
      timer = window.setTimeout(async () => {
        try {
          const data = await api(`/api/users/search-gift-recipient?q=${encodeURIComponent(query)}`);
          const recipients = data.results || [];
          lastRecipients = recipients;
          results.innerHTML = recipients.length
            ? recipients.map(renderGiftResult).join("")
            : `<div class="empty-state">${t("giftSearchEmpty")}</div>`;
        } catch {
          results.innerHTML = `<div class="empty-state">${t("giftSearchFailed")}</div>`;
        }
      }, 260);
    });

    results?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-select-gift-recipient]");
      if (!button) return;
      results.querySelectorAll(".gift-result-card").forEach((item) => item.classList.remove("is-selected"));
      results.querySelectorAll("[data-select-gift-recipient]").forEach((item) => {
        item.textContent = t("chooseRecipient");
        item.classList.add("secondary");
        item.classList.remove("primary");
      });
      button.closest(".gift-result-card")?.classList.add("is-selected");
      button.textContent = t("selectedGiftRecipient");
      button.classList.remove("secondary");
      button.classList.add("primary");
      const recipient = lastRecipients.find((item) => String(item.id) === String(button.dataset.selectGiftRecipient));
      if (recipient) {
        sessionStorage.setItem("fima.giftRecipient", JSON.stringify(recipient));
        renderSelectedGiftRecipient(recipient);
        $("#giftRecipientSelected")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      setMessage(t("giftCheckoutSoon"), "good");
    });

    target.addEventListener("click", (event) => {
      if (event.target.closest("[data-clear-gift-recipient]")) {
        sessionStorage.removeItem("fima.giftRecipient");
        renderSelectedGiftRecipient(null);
        input?.focus();
      }
    });
  };

  const referralStatus = (status) => {
    const clean = String(status || "pending").replaceAll("_", " ");
    return clean.slice(0, 1).toUpperCase() + clean.slice(1);
  };

  const renderReferralRow = (referral) => {
    const user = referral.user || {};
    const name = user.robloxUsername || user.discordUsername || user.maskedEmail || "Fima user";
    return `
      <article class="referral-row ${escapeHtml(referral.status || "pending")}">
        <div class="mini-profile">
          ${user.robloxAvatarUrl ? `<img src="${escapeHtml(user.robloxAvatarUrl)}" alt="">` : `<span>${escapeHtml(String(name).slice(0, 1).toUpperCase())}</span>`}
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml([user.maskedEmail, date(referral.createdAt)].filter(Boolean).join(" / "))}</small>
          </div>
        </div>
        <span class="status-pill">${escapeHtml(referralStatus(referral.status))}</span>
      </article>
    `;
  };

  const renderReferralDashboard = (summary = {}) => {
    const target = $("#referralDashboard");
    if (!target) return;
    if (!summary?.code) {
      target.innerHTML = `<div class="empty-state">${t("working")}</div>`;
      return;
    }
    const counts = summary.counts || {};
    const progress = summary.progress || {};
    const required = Math.max(1, progress.required || summary.rewardRule?.requiredValidInvites || 3);
    const current = Math.min(required, progress.current ?? ((counts.valid || 0) % required));
    const width = Math.round((current / required) * 100);
    const rewards = summary.rewards || [];
    const referrals = summary.referrals || [];
    const referralLink = cleanPublicLink(summary.link);
    target.innerHTML = `
      <div class="referral-dashboard">
        <div class="referral-hero-card">
          <div>
            <span class="pill">${t("rewardRule")}</span>
            <h3>${t("yourReferralCode")}</h3>
          </div>
          <div class="referral-code-box">
            <code>${escapeHtml(summary.code)}</code>
            <button class="button secondary" type="button" data-copy="${escapeHtml(summary.code)}">${t("copyReferralCode")}</button>
          </div>
          <div class="referral-code-box">
            <code>${escapeHtml(referralLink)}</code>
            <button class="button" type="button" data-copy="${escapeHtml(referralLink)}">${t("copyReferralLink")}</button>
          </div>
        </div>
        <div class="referral-progress-card">
          <div class="card-top">
            <div>
              <span class="pill">${t("referralProgress")}</span>
              <h3>${current}/${required}</h3>
            </div>
            <span class="status-pill">${escapeHtml(progress.remaining || required)} ${t("referralsRemaining")}</span>
          </div>
          <div class="progress-track"><span style="width:${width}%"></span></div>
          <div class="metric-grid">
            <div><span>${t("verifiedInvites")}</span><strong>${counts.valid || 0}</strong></div>
            <div><span>${t("pendingInvites")}</span><strong>${counts.pending || 0}</strong></div>
            <div><span>${t("rejectedInvites")}</span><strong>${(counts.rejected || 0) + (counts.flagged || 0)}</strong></div>
            <div><span>${t("earnedRewards")}</span><strong>${rewards.length}</strong></div>
          </div>
        </div>
        <div class="referral-apply-card">
          <h3>${summary.incoming ? t("incomingReferral") : t("referralApplyTitle")}</h3>
          ${summary.incoming ? `
            <p>${escapeHtml(summary.incoming.user?.maskedEmail || "")}</p>
            <span class="status-pill">${escapeHtml(referralStatus(summary.incoming.status))}</span>
          ` : `
            <p>${t("referralApplyIntro")}</p>
            <form data-referral-apply-form>
              <input name="referralCode" type="text" maxlength="48" placeholder="FIMA-FIEELCOMPL-SMGS" required>
              <button class="button secondary" type="submit">${t("applyReferral")}</button>
            </form>
          `}
        </div>
        <div class="referral-list-card">
          <div class="section-heading compact"><div><h3>${t("recentInvites")}</h3><p>${t("nextReward")}: ${required} ${t("verifiedInvites").toLowerCase()}</p></div></div>
          <div class="referral-list">
            ${referrals.length ? referrals.slice(0, 6).map(renderReferralRow).join("") : `<div class="empty-state">${t("noReferralsYet")}</div>`}
          </div>
        </div>
      </div>
    `;
  };

  const refreshDashboardAccess = async () => {
    const data = await api("/api/me/dashboard");
    window.fimaAccountProductContext = { user: data.user || {}, integrations: data.integrations || {} };
    if (data.user) {
      renderAccountHeader(data.user);
      renderAccountSummary(data.user);
      renderEmailVerification(data.user);
      renderRobloxProfileSettings(data.user);
    }
    renderConnectedAccounts(data.integrations || {});
    renderGiftClaims(data.pendingGifts || [], data.integrations || {}, data.purchasedGiftCodes || [], data.giftHistory || []);
    renderMonthlyTrial(data.trial || {});
    renderReferralDashboard(data.referrals || {});
    renderAccountProducts(data.products || [], "#dashboardProducts");
    renderBillingSummary(data.products || [], data.licenses || []);
    renderLicenses(data.licenses || []);
    return data;
  };

  const applyDashboardSectionRoute = () => {
    if (page !== "dashboard") return;
    const section = dashboardSectionFromLocation();
    const visibleByRoute = {
      overview: ["overview", "security"],
      products: ["products"],
      billing: ["billing"],
      redeem: ["redeem"],
      gifts: ["redeem"],
      referrals: ["referrals"],
      "connected-accounts": ["overview", "security"],
      security: ["overview", "security"],
      settings: ["overview", "security"],
      downloads: ["downloads"],
      support: ["support"]
    };
    const visible = new Set(visibleByRoute[section] || visibleByRoute.overview);
    document.body.dataset.dashboardSection = section;
    $$(".account-summary-card, .account-section").forEach((node) => {
      const id = node.id || "";
      const show = visible.has(id);
      node.hidden = !show;
      node.classList.toggle("is-route-active", show);
    });
    $$(".account-dashboard-nav a").forEach((link) => {
      const key = link.dataset.dashboardLink || "";
      const active = key === section ||
        (section === "gifts" && key === "redeem") ||
        (section === "settings" && key === "security") ||
        (section === "connected-accounts" && key === "security");
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
        link.scrollIntoView?.({ block: "nearest", inline: "center" });
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const initDashboard = async () => {
    const user = await requireLogin();
    if (!user) return;
    renderAccountHeader(user);
    renderAccountSummary(user);
    initGiftRecipientSearch();
    await refreshDashboardAccess();
    applyDashboardSectionRoute();
  };

  const initMyProducts = async () => {
    const user = await requireLogin();
    if (!user) return;
    renderAccountHeader(user);
    const data = await api("/api/me/products");
    window.fimaAccountProductContext = { user: data.user || user || {}, integrations: data.integrations || {} };
    renderAccountProducts(data.products || [], "#purchases");
    renderGiftClaims([], {}, data.purchasedGiftCodes || [], data.giftHistory || []);
  };

  const initPaymentSuccess = async () => {
    const sessionId = new URLSearchParams(location.search).get("session_id") || "";
    const target = $("#result");
    if (!target) return;
    await requireLogin();
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const data = await api(`/api/store/result?session_id=${encodeURIComponent(sessionId)}`);
        if (data.success && data.purchase) {
          target.innerHTML = `<h1>${t("purchaseComplete")}</h1><p>${t("productLinked")}</p><div class="row"><span>${t("product")}</span><strong>${escapeHtml(data.purchase.product?.name || t("product"))}</strong></div><a class="button" href="${dashboardRoute("products")}">${t("openMyProducts")}</a>`;
          return;
        }
      } catch (error) {
        target.innerHTML = `<h1>${t("paymentCheckFailed")}</h1><p>${escapeHtml(error.message)}</p>`;
        return;
      }
      if (attempts < 15) {
        target.querySelector("p")?.replaceChildren(document.createTextNode(t("purchaseProcessing")));
        window.setTimeout(poll, 2000);
      } else {
        target.innerHTML = `<h1>${t("paymentReceived")}</h1><p>${t("purchaseStillProcessing")}</p>`;
      }
    };
    poll();
  };

  const showGiftLicenseModal = ({ title, message, license, giftCode }) => {
    const existing = $(".gift-success-overlay");
    existing?.remove();
    const licenseKey = license?.licenseKey || "";
    const licenseMasked = license?.licenseKeyMasked || maskSensitiveCode(licenseKey);
    const licenseRecordId = String(license?.id || "").trim();
    const licenseSecretId = licenseKey ? storeSensitiveSecret(licenseKey, "license-modal") : "";
    const code = giftCode?.giftCode || "";
    const giftSecretId = code ? storeSensitiveSecret(code, "gift-modal") : "";
    const overlay = document.createElement("div");
    overlay.className = "gift-success-overlay";
    overlay.innerHTML = `
      <section class="gift-success-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || t("giftRedeemedTitle"))}">
        <div class="card-top">
          <div>
            <span class="pill">${escapeHtml(giftCode ? t("giftCodeCreated") : t("giftRedeemedTitle"))}</span>
            <h3>${escapeHtml(title || t("giftRedeemedTitle"))}</h3>
            <p>${escapeHtml(message || t("giftRedeemedText"))}</p>
          </div>
          <button class="link-button" type="button" data-close-gift-modal>${t("close")}</button>
        </div>
        ${code ? `
          <div class="gift-modal-key">
            <span>${t("giftCodeTitle")}</span>
            <code>${escapeHtml(maskSensitiveCode(code))}</code>
            <button class="button secondary" type="button" data-copy-secret="${escapeHtml(giftSecretId)}">${t("copyGiftCode")}</button>
          </div>
        ` : ""}
        ${licenseKey || license?.hasLicenseKey || license?.licenseKeyMasked ? `
          <div class="gift-modal-key gift-modal-key-primary">
            <span>${t("newLicenseKey")}</span>
            <code>${escapeHtml(licenseMasked)}</code>
            <button class="button" type="button" ${licenseRecordId ? `data-copy-license-id="${escapeHtml(licenseRecordId)}"` : `data-copy-secret="${escapeHtml(licenseSecretId)}"`}>${t("copyLicenseKey")}</button>
          </div>
        ` : ""}
        <div class="gift-meta-grid">
          ${license?.plan ? `<span>${t("plan")}: <b>${escapeHtml(license.planName || license.plan)}</b></span>` : ""}
          ${license?.expiresAt ? `<span>${t("expires")}: <b>${date(license.expiresAt)}</b></span>` : ""}
          ${license?.expiresAt ? `<span>${t("remaining")}: <b data-countdown="${escapeHtml(license.expiresAt)}"></b></span>` : ""}
          ${giftCode?.status ? `<span>${t("status")}: <b>${escapeHtml(giftCodeStatusLabel(giftCode.status, giftCode.used))}</b></span>` : ""}
        </div>
        <div class="gift-modal-actions">
          <a class="button secondary" href="${dashboardRoute("products")}">${t("openMyProducts")}</a>
          ${licenseKey || licenseRecordId ? `<button class="button secondary" type="button" ${licenseRecordId ? `data-download-license-id="${escapeHtml(licenseRecordId)}"` : `data-download-license-secret="${escapeHtml(licenseSecretId)}"`}>${t("downloadApp")}</button>` : ""}
          <button class="button" type="button" data-close-gift-modal>${t("close")}</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    window.setTimeout(() => overlay.classList.add("is-visible"), 20);
    updateCountdowns();
  };

  const showTrialClaimModal = (trial, license) => {
    const existing = $(".gift-success-overlay");
    existing?.remove();
    const activeLicense = license || trial?.activeLicense || {};
    const fullKey = activeLicense.licenseKey || "";
    const maskedKey = activeLicense.licenseKeyMasked || maskSensitiveCode(fullKey);
    const licenseRecordId = String(activeLicense.id || activeLicense.licenseId || "").trim();
    const licenseSecretId = fullKey ? storeSensitiveSecret(fullKey, "trial-license") : "";
    const copyAttribute = licenseRecordId
      ? `data-copy-license-id="${escapeHtml(licenseRecordId)}"`
      : licenseSecretId
        ? `data-copy-secret="${escapeHtml(licenseSecretId)}"`
        : "";
    const overlay = document.createElement("div");
    overlay.className = "gift-success-overlay trial-success-overlay";
    overlay.innerHTML = `
      <section class="gift-success-modal trial-success-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(t("trialClaimed"))}">
        <div class="card-top">
          <div>
            <span class="pill">${escapeHtml(trial?.label || t("freeMonthlyTrial"))}</span>
            <h3>${escapeHtml(t("trialReadyTitle") || "Your trial key is ready")}</h3>
            <p>${escapeHtml(t("trialReadyText") || "Copy your license key, then open Fima and activate it on the key screen.")}</p>
          </div>
          <button class="link-button" type="button" data-close-gift-modal>${t("close")}</button>
        </div>
        <div class="gift-modal-key gift-modal-key-primary trial-license-display">
          <span>${t("licenseKey")}</span>
          <code>${escapeHtml(maskedKey || "FIMA-****")}</code>
          ${copyAttribute ? `<button class="button" type="button" ${copyAttribute}>${t("copyLicenseKey")}</button>` : ""}
        </div>
        <div class="gift-meta-grid">
          ${trial?.expiresAt ? `<span>${t("expires")}: <b>${date(trial.expiresAt)}</b></span>` : ""}
          ${trial?.expiresAt ? `<span>${t("remaining")}: <b data-countdown="${escapeHtml(trial.expiresAt)}"></b></span>` : ""}
          <span>${t("status")}: <b>${escapeHtml(t("trialActive") || "Trial active")}</b></span>
        </div>
        <div class="trial-success-note">
          ${escapeHtml(t("trialReadyPrivacy") || "For privacy, screenshots and reports should show the masked key only. The Copy button copies the full key for this signed-in account.")}
        </div>
        <div class="gift-modal-actions">
          <a class="button secondary" href="${dashboardRoute("products")}">${t("openMyProducts")}</a>
          <a class="button secondary" href="/download">${t("downloadApp")}</a>
          <button class="button" type="button" data-close-gift-modal>OK</button>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("modal-open");
    window.setTimeout(() => overlay.classList.add("is-visible"), 20);
    updateCountdowns();
  };

  const initAccountActions = () => {
    document.addEventListener("submit", async (event) => {
      const robloxProfileForm = event.target.closest("[data-roblox-profile-form]");
      if (robloxProfileForm) {
        event.preventDefault();
        const submit = robloxProfileForm.querySelector("button[type='submit']");
        submit.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post("/api/me/roblox/start-verification", { robloxUsername: robloxProfileForm.robloxUsername.value });
          currentUserPromise = null;
          window.fimaAccountProductContext = { user: data.user || {}, integrations: data.integrations || {} };
          renderAccountHeader(data.user || {});
          renderAccountSummary(data.user || {});
          renderConnectedAccounts(data.integrations || {});
          renderRobloxProfileSettings(data.user || {});
          renderMonthlyTrial(data.trial || {});
          setMessage(t("robloxPending"), "good");
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          submit.disabled = false;
        }
        return;
      }

      const giftForm = event.target.closest("[data-gift-code-form]");
      if (giftForm) {
        event.preventDefault();
        const submit = giftForm.querySelector("button[type='submit']");
        submit.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post("/api/gifts/redeem", { code: giftForm.elements.code.value });
          giftForm.reset();
          await refreshDashboardAccess();
          showGiftLicenseModal({
            title: t("giftRedeemedTitle"),
            message: t("giftRedeemedText"),
            license: data.license,
            giftCode: data.giftCode
          });
          setMessage(t("giftClaimed"), "good");
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          submit.disabled = false;
        }
        return;
      }

      const form = event.target.closest("[data-referral-apply-form]");
      if (!form) return;
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      setMessage(t("working"));
      try {
        const data = await post("/api/referrals/apply", { code: form.referralCode.value });
        renderReferralDashboard(data.referrals || {});
        setMessage(t("referralApplied"), "good");
      } catch (error) {
        setMessage(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });

    document.addEventListener("submit", async (event) => {
      const emailLinkForm = event.target.closest("[data-email-link-form]");
      if (emailLinkForm) {
        event.preventDefault();
        const submit = emailLinkForm.querySelector("button[type='submit']");
        submit.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post("/api/auth/email-link/start", { email: emailLinkForm.email.value });
          currentUserPromise = null;
          renderEmailVerification(data.user || {});
          renderAccountSummary(data.user || {});
          renderAccountHeader(data.user || {});
          setMessage(t("verificationSent"), "good");
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          submit.disabled = false;
        }
        return;
      }

      const form = event.target.closest("[data-email-verification-form]");
      if (!form) return;
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      setMessage(t("working"));
      try {
        const data = await post("/api/auth/email-verification/confirm", { code: form.code.value });
        currentUserPromise = null;
        renderEmailVerification(data.user || {});
        renderAccountSummary(data.user || {});
        renderAccountHeader(data.user || {});
        renderReferralDashboard(data.referrals || {});
        setMessage(t("verificationComplete"), "good");
      } catch (error) {
        setMessage(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });

    document.addEventListener("click", async (event) => {
      const revealButton = event.target.closest("[data-reveal-target]");
      if (revealButton) {
        const target = document.getElementById(revealButton.dataset.revealTarget || "");
        const value = dashboardRevealValues.get(revealButton.dataset.revealTarget || "");
        if (target && value) {
          target.textContent = value;
          revealButton.setAttribute("aria-label", "Shown");
          revealButton.disabled = true;
        }
        return;
      }

      const emailButton = event.target.closest("[data-send-email-verification]");
      if (emailButton) {
        emailButton.disabled = true;
        setMessage(t("working"));
        try {
          await post("/api/auth/email-verification/send", {});
          setMessage(t("verificationSent"), "good");
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          emailButton.disabled = false;
        }
        return;
      }

      const clearRobloxButton = event.target.closest("[data-clear-roblox-username]");
      if (clearRobloxButton) {
        clearRobloxButton.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post("/api/me/roblox/clear", {});
          currentUserPromise = null;
          window.fimaAccountProductContext = { user: data.user || {}, integrations: data.integrations || {} };
          renderAccountHeader(data.user || {});
          renderAccountSummary(data.user || {});
          renderConnectedAccounts(data.integrations || {});
          renderRobloxProfileSettings(data.user || {});
          renderMonthlyTrial(data.trial || {});
          setMessage(t("profileSaved"), "good");
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          clearRobloxButton.disabled = false;
        }
        return;
      }

      const copyRobloxCodeButton = event.target.closest("[data-copy-roblox-code]");
      if (copyRobloxCodeButton) {
        await navigator.clipboard?.writeText(copyRobloxCodeButton.dataset.copyRobloxCode || "");
        setMessage(t("copied"), "good");
        return;
      }

      const confirmRobloxButton = event.target.closest("[data-confirm-roblox-verification]");
      if (confirmRobloxButton) {
        confirmRobloxButton.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post("/api/me/roblox/confirm-verification", {});
          currentUserPromise = null;
          window.fimaAccountProductContext = { user: data.user || {}, integrations: data.integrations || {} };
          renderAccountHeader(data.user || {});
          renderAccountSummary(data.user || {});
          renderConnectedAccounts(data.integrations || {});
          renderRobloxProfileSettings(data.user || {});
          renderMonthlyTrial(data.trial || {});
          setMessage(t("robloxVerified"), "good");
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          confirmRobloxButton.disabled = false;
        }
        return;
      }

      const copySecretButton = event.target.closest("[data-copy-secret]");
      if (copySecretButton) {
        const secret = readLicenseSecret(copySecretButton.dataset.copySecret);
        if (!secret) {
          setMessage(t("licenseNotFound"), "error");
          return;
        }
        await navigator.clipboard?.writeText(secret);
        setMessage(t("copied"), "good");
        return;
      }

      const copyButton = event.target.closest("[data-copy]");
      if (copyButton) {
        await navigator.clipboard?.writeText(copyButton.dataset.copy || "");
        setMessage(t("copied"), "good");
        return;
      }

      const copyLicenseIdButton = event.target.closest("[data-copy-license-id]");
      if (copyLicenseIdButton) {
        copyLicenseIdButton.disabled = true;
        try {
          const data = await api(`/api/me/license-records/${encodeURIComponent(copyLicenseIdButton.dataset.copyLicenseId)}/key`);
          if (!data.licenseKey) throw new Error(t("licenseNotFound"));
          await navigator.clipboard?.writeText(data.licenseKey);
          setMessage(t("copied"), "good");
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          copyLicenseIdButton.disabled = false;
        }
        return;
      }

      const copyLicenseButton = event.target.closest("[data-copy-license-secret]");
      if (copyLicenseButton) {
        const key = readLicenseSecret(copyLicenseButton.dataset.copyLicenseSecret);
        if (!key) {
          setMessage(t("licenseNotFound"), "error");
          return;
        }
        await navigator.clipboard?.writeText(key);
        setMessage(t("copied"), "good");
        return;
      }

      const downloadIdButton = event.target.closest("[data-download-license-id]");
      if (downloadIdButton) {
        downloadIdButton.disabled = true;
        try {
          const data = await post(`/api/me/license-records/${encodeURIComponent(downloadIdButton.dataset.downloadLicenseId)}/download`, {});
          setMessage(t("downloadReady"), "good");
          window.location.href = data.downloadUrl || publicSetupUrl;
        } catch (error) {
          setMessage((error.message || "Download could not be prepared.") + " Opening the public setup download.", "error");
          window.location.href = publicSetupUrl;
        } finally {
          downloadIdButton.disabled = false;
        }
        return;
      }

      const downloadButton = event.target.closest("[data-download-license]");
      if (downloadButton) {
        downloadButton.disabled = true;
        try {
          const data = await api(`/api/download?licenseKey=${encodeURIComponent(downloadButton.dataset.downloadLicense)}`);
          setMessage(t("downloadReady"), "good");
          window.location.href = data.downloadUrl || publicSetupUrl;
        } catch (error) {
          setMessage((error.message || "Download could not be prepared.") + " Opening the public setup download.", "error");
          window.location.href = publicSetupUrl;
        } finally {
          downloadButton.disabled = false;
        }
        return;
      }

      const secureDownloadButton = event.target.closest("[data-download-license-secret]");
      if (secureDownloadButton) {
        const key = readLicenseSecret(secureDownloadButton.dataset.downloadLicenseSecret);
        if (!key) {
          setMessage(t("licenseNotFound"), "error");
          return;
        }
        secureDownloadButton.disabled = true;
        try {
          const data = await api(`/api/download?licenseKey=${encodeURIComponent(key)}`);
          setMessage(t("downloadReady"), "good");
          window.location.href = data.downloadUrl || publicSetupUrl;
        } catch (error) {
          setMessage((error.message || "Download could not be prepared.") + " Opening the public setup download.", "error");
          window.location.href = publicSetupUrl;
        } finally {
          secureDownloadButton.disabled = false;
        }
        return;
      }

      const extendIdButton = event.target.closest("[data-extend-license-id]");
      if (extendIdButton) {
        extendIdButton.disabled = true;
        setMessage(t("checkout"));
        try {
          const checkout = await post(`/api/me/license-records/${encodeURIComponent(extendIdButton.dataset.extendLicenseId)}/extend-checkout`, {
            plan: extendIdButton.dataset.plan,
            currency: localStorage.getItem("fima.currency") || "EUR",
            language: language()
          });
          window.location.href = checkout.url;
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          extendIdButton.disabled = false;
        }
        return;
      }

      const extendButton = event.target.closest("[data-extend-license]");
      if (extendButton) {
        extendButton.disabled = true;
        setMessage(t("checkout"));
        try {
          const checkout = await post(`/api/me/licenses/${encodeURIComponent(extendButton.dataset.extendLicense)}/extend-checkout`, {
            plan: extendButton.dataset.plan,
            currency: localStorage.getItem("fima.currency") || "EUR",
            language: language()
          });
          window.location.href = checkout.url;
        } catch (error) {
          setMessage(error.message, "error");
          extendButton.disabled = false;
        }
        return;
      }

      const secureExtendButton = event.target.closest("[data-extend-license-secret]");
      if (secureExtendButton) {
        const key = readLicenseSecret(secureExtendButton.dataset.extendLicenseSecret);
        if (!key) {
          setMessage(t("licenseNotFound"), "error");
          return;
        }
        secureExtendButton.disabled = true;
        setMessage(t("checkout"));
        try {
          const checkout = await post(`/api/me/licenses/${encodeURIComponent(key)}/extend-checkout`, {
            plan: secureExtendButton.dataset.plan,
            language: language()
          });
          window.location.href = checkout.url;
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          secureExtendButton.disabled = false;
        }
        return;
      }

      const directGiftButton = event.target.closest("[data-claim-direct-gift]");
      if (directGiftButton) {
        directGiftButton.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post("/api/gifts/claim-direct", { packageId: directGiftButton.dataset.claimDirectGift });
          await refreshDashboardAccess();
          showGiftLicenseModal({
            title: t("giftRedeemedTitle"),
            message: t("giftRedeemedText"),
            license: data.license
          });
          setMessage(t("giftClaimed"), "good");
        } catch (error) {
          setMessage(error.message, "error");
          directGiftButton.disabled = false;
        }
        return;
      }

      const closeGiftModal = event.target.closest("[data-close-gift-modal]");
      if (closeGiftModal || event.target.classList.contains("gift-success-overlay")) {
        const overlay = event.target.closest(".gift-success-overlay") || $(".gift-success-overlay");
        if (overlay) {
          overlay.classList.remove("is-visible");
          window.setTimeout(() => overlay.remove(), 220);
        }
        document.body.classList.remove("modal-open");
        return;
      }

      const disconnectButton = event.target.closest("[data-disconnect-provider]");
      if (disconnectButton) {
        if (!window.confirm(t("disconnectConfirm"))) return;
        const provider = disconnectButton.dataset.disconnectProvider;
        disconnectButton.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post(`/api/auth/${provider}/disconnect`, {});
          renderConnectedAccounts(data.integrations || {});
          renderMonthlyTrial(data.trial || {});
          renderAccountSummary(data.user || {});
          renderAccountHeader(data.user || {});
          setMessage(t("working"), "good");
          window.setTimeout(() => setMessage(""), 1200);
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          disconnectButton.disabled = false;
        }
        return;
      }

      const trialButton = event.target.closest("[data-claim-trial]");
      if (trialButton) {
        trialButton.disabled = true;
        setMessage(t("working"));
        try {
          const data = await post("/api/trial/monthly/claim", {});
          await refreshDashboardAccess();
          showTrialClaimModal(data.trial, data.license);
          setMessage(t("trialClaimed"), "good");
        } catch (error) {
          setMessage(error.message, "error");
          trialButton.disabled = false;
        }
      }
    });
  };

  const updateCountdowns = () => {
    $$("[data-countdown]").forEach((node) => {
      const expiresAt = node.dataset.countdown;
      if (!expiresAt) return;
      const seconds = (new Date(expiresAt).getTime() - Date.now()) / 1000;
      node.textContent = seconds <= 0 ? t("expired") : duration(seconds);
    });
    $$("[data-sale-countdown]").forEach((node) => {
      const seconds = (saleEndsAt.getTime() - Date.now()) / 1000;
      node.textContent = seconds <= 0 ? "0m 0s" : duration(seconds);
    });
  };

  const initPasswordToggles = () => {
    $$("input[type='password']").forEach((input) => {
      if (input.dataset.passwordToggleReady === "1") return;
      input.dataset.passwordToggleReady = "1";
      const wrapper = document.createElement("span");
      wrapper.className = "password-field";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "password-toggle";
      button.setAttribute("aria-label", "Show password");
      button.title = "Show password";
      button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M12 5c5.2 0 8.7 4.7 9.8 6.4.3.4.3.8 0 1.2C20.7 14.3 17.2 19 12 19s-8.7-4.7-9.8-6.4a1 1 0 0 1 0-1.2C3.3 9.7 6.8 5 12 5Zm0 2C8.2 7 5.4 10.1 4.3 12c1.1 1.9 3.9 5 7.7 5s6.6-3.1 7.7-5C18.6 10.1 15.8 7 12 7Zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"/></svg>';
      button.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.setAttribute("aria-label", show ? "Hide password" : "Show password");
        button.title = show ? "Hide password" : "Show password";
        input.focus();
      });
      wrapper.appendChild(button);
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    applyStaticTranslations();
    initPasswordToggles();
    initOauthFlash();
    initLogout();
    initAccountActions();
    hydrateAccountHeader();
    window.setInterval(updateCountdowns, 1000);
    if (page === "register") {
      initAuthForm("/api/auth/register", dashboardRoute("overview"));
      initRobloxPreview();
      initReferralPrefill();
    }
    if (page === "login") initAuthForm("/api/auth/login", dashboardRoute("overview"));
    if (page === "forgot") initForgotPassword();
    if (page === "reset") initResetPassword();
    if (page === "store") initStore();
    if (page === "dashboard") initDashboard();
    if (page === "my-products") initMyProducts();
    if (page === "payment-success") initPaymentSuccess();
  });
})();
