(() => {
  const publicSetupUrl = "https://github.com/fieel83/fima-macro-releases/releases/download/v1.0.130/FIMA.MACRO.Setup.exe";
  const storage = {
    theme: "fima.theme",
    language: "fima.language",
    currency: "fima.currency",
    languageManual: "fima.language.manual",
    currencyManual: "fima.currency.manual",
    checkoutEmail: "fima.checkout.email"
  };

  const fallbackRates = {
    EUR: 1,
    USD: 1.1644,
    TRY: 53.4297,
    GBP: 0.86723,
    AED: 4.277, AFN: 81.2, ALL: 96.6, AMD: 449, ANG: 2.08, AOA: 1065, ARS: 1384, AUD: 1.78, AWG: 2.09, AZN: 1.98,
    BAM: 1.956, BBD: 2.33, BDT: 142, BGN: 1.956, BHD: 0.438, BIF: 3450, BMD: 1.164, BND: 1.50, BOB: 8.04, BRL: 6.24,
    BSD: 1.164, BTN: 97.1, BWP: 15.7, BYN: 3.81, BZD: 2.35, CAD: 1.59, CDF: 3330, CHF: 0.94, CLP: 1080, CNY: 8.29,
    COP: 4560, CRC: 592, CUP: 28, CVE: 110.3, CZK: 24.7, DJF: 207, DKK: 7.46, DOP: 69.5, DZD: 151, EGP: 55.4,
    ETB: 68.8, FJD: 2.64, GEL: 3.17, GHS: 12.5, GMD: 84, GTQ: 8.93, HKD: 9.08, HNL: 30.5, HRK: 7.53, HUF: 404,
    IDR: 18950, ILS: 4.18, INR: 97.1, IQD: 1525, ISK: 145, JMD: 185, JOD: 0.825, JPY: 182, KES: 150, KGS: 102,
    KHR: 4680, KRW: 1600, KWD: 0.356, KZT: 607, LAK: 25200, LBP: 104200, LKR: 350, MAD: 10.7, MDL: 19.8, MKD: 61.5,
    MMK: 2445, MNT: 4000, MOP: 9.36, MUR: 53.6, MVR: 17.9, MXN: 21.4, MYR: 4.92, MZN: 74.5, NAD: 20.8, NGN: 1780,
    NOK: 11.8, NPR: 155, NZD: 1.95, OMR: 0.448, PAB: 1.164, PEN: 4.28, PHP: 65.4, PKR: 325, PLN: 4.25, PYG: 8550,
    QAR: 4.24, RON: 4.98, RSD: 117.1, SAR: 4.37, SCR: 16.2, SEK: 10.8, SGD: 1.50, THB: 38.1, TND: 3.40, TWD: 35.5,
    TZS: 3050, UAH: 48.2, UGX: 4180, UYU: 46.5, UZS: 14700, VND: 30400, XAF: 656, XOF: 656, ZAR: 20.8, ZMW: 30.0
  };

  let rates = { ...fallbackRates };

  const currencyOptions = Object.keys(fallbackRates).sort((a, b) => a.localeCompare(b));
  const supportedCurrencySet = new Set(currencyOptions);

  const languageOptions = [
    ["en", "EN"], ["tr", "TR"], ["de", "DE"], ["fr", "FR"], ["bs", "BS"],
    ["es", "ES"], ["pt", "PT"], ["it", "IT"], ["nl", "NL"], ["pl", "PL"],
    ["ru", "RU"], ["uk", "UK"], ["ar", "AR"], ["hi", "HI"], ["id", "ID"],
    ["ja", "JA"], ["ko", "KO"], ["zh", "ZH"], ["ro", "RO"], ["sr", "SR"]
  ];

  const symbols = {
    USD: "$",
    EUR: "\u20ac",
    TRY: "\u20ba",
    GBP: "\u00a3"
  };

  const currencySymbolOverrides = {
    AED: "\u062f.\u0625", AFN: "\u060b", ALL: "L", AMD: "\u058f", ANG: "\u0192", AOA: "Kz", ARS: "$", AUD: "A$",
    AWG: "\u0192", AZN: "\u20bc", BAM: "KM", BBD: "Bds$", BDT: "\u09f3", BGN: "\u043b\u0432", BHD: "BD", BIF: "FBu",
    BMD: "$", BND: "B$", BOB: "Bs", BRL: "R$", BSD: "B$", BTN: "Nu", BWP: "P", BYN: "Br", BZD: "BZ$", CAD: "C$",
    CDF: "FC", CHF: "\u20a3", CLP: "$", CNY: "\u00a5", COP: "$", CRC: "\u20a1", CUP: "$", CVE: "$", CZK: "K\u010d",
    DJF: "Fdj", DKK: "kr", DOP: "RD$", DZD: "DA", EGP: "E\u00a3", ETB: "Br", EUR: "\u20ac", FJD: "FJ$", GBP: "\u00a3",
    GEL: "\u20be", GHS: "\u20b5", GMD: "D", GTQ: "Q", HKD: "HK$", HNL: "L", HRK: "kn", HUF: "Ft", IDR: "Rp",
    ILS: "\u20aa", INR: "\u20b9", IQD: "ID", ISK: "kr", JMD: "J$", JOD: "JD", JPY: "\u00a5", KES: "KSh", KGS: "\u0441",
    KHR: "\u17db", KRW: "\u20a9", KWD: "KD", KZT: "\u20b8", LAK: "\u20ad", LBP: "L\u00a3", LKR: "Rs", MAD: "DH",
    MDL: "L", MKD: "\u0434\u0435\u043d", MMK: "K", MNT: "\u20ae", MOP: "MOP$", MUR: "Rs", MVR: "Rf", MXN: "MX$",
    MYR: "RM", MZN: "MT", NAD: "N$", NGN: "\u20a6", NOK: "kr", NPR: "Rs", NZD: "NZ$", OMR: "OMR", PAB: "B/.",
    PEN: "S/", PHP: "\u20b1", PKR: "Rs", PLN: "z\u0142", PYG: "\u20b2", QAR: "QR", RON: "lei", RSD: "din",
    RUB: "\u20bd", SAR: "SR", SCR: "Rs", SEK: "kr", SGD: "S$", THB: "\u0e3f", TND: "DT", TRY: "\u20ba", TWD: "NT$",
    TZS: "TSh", UAH: "\u20b4", UGX: "USh", USD: "$", UYU: "$U", UZS: "so'm", VND: "\u20ab", XAF: "FCFA",
    XOF: "CFA", ZAR: "R", ZMW: "ZK"
  };

  const currencyNameOverrides = {
    USD: "US Dollar",
    EUR: "Euro",
    TRY: "Turkish Lira",
    GBP: "British Pound",
    JPY: "Japanese Yen",
    KRW: "South Korean Won",
    RUB: "Russian Ruble",
    CHF: "Swiss Franc",
    CAD: "Canadian Dollar",
    AUD: "Australian Dollar",
    CNY: "Chinese Yuan",
    INR: "Indian Rupee",
    BRL: "Brazilian Real",
    MXN: "Mexican Peso",
    PLN: "Polish Zloty",
    SEK: "Swedish Krona",
    NOK: "Norwegian Krone",
    DKK: "Danish Krone",
    AED: "UAE Dirham",
    SAR: "Saudi Riyal",
    BGN: "Bulgarian Lev",
    RON: "Romanian Leu",
    CZK: "Czech Koruna",
    HUF: "Hungarian Forint",
    IDR: "Indonesian Rupiah",
    PHP: "Philippine Peso",
    THB: "Thai Baht",
    VND: "Vietnamese Dong",
    ZAR: "South African Rand"
  };

  const currencyAliasOverrides = {
    TRY: ["tl", "lira", "turkish lira", "t\u00fcrk liras\u0131", "turk lirasi", "t\u00fcrk lirasi"],
    USD: ["dollar", "dolar", "us dollar", "american dollar", "amerika dolari", "amerikan dolari"],
    EUR: ["euro", "avro"],
    GBP: ["pound", "british pound", "sterlin", "pound sterling"],
    JPY: ["yen", "japanese yen"],
    CHF: ["swiss franc", "isvicre frangi", "isvi\u00e7re frang\u0131"],
    CAD: ["canadian dollar", "canada dollar"],
    AUD: ["australian dollar", "australia dollar"],
    RUB: ["ruble", "rouble", "russian ruble", "rus rublesi"],
    KRW: ["won", "korean won", "south korean won"],
    CNY: ["yuan", "renminbi", "chinese yuan"],
    INR: ["rupee", "indian rupee"],
    BRL: ["real", "brazilian real"],
    PLN: ["zloty", "polish zloty"],
    SAR: ["riyal", "saudi riyal"],
    AED: ["dirham", "uae dirham", "dubai dirham"]
  };

  const countryDefaults = {
    TR: { language: "tr", currency: "TRY" },
    DE: { language: "de", currency: "EUR" },
    AT: { language: "de", currency: "EUR" },
    CH: { language: "de", currency: "EUR" },
    FR: { language: "fr", currency: "EUR" },
    BE: { language: "fr", currency: "EUR" },
    BA: { language: "bs", currency: "EUR" },
    US: { language: "en", currency: "USD" },
    CA: { language: "en", currency: "USD" },
    GB: { language: "en", currency: "GBP" },
    IE: { language: "en", currency: "EUR" }
  };

  const macroNames = [
    "Loop Dash",
    "True Twisted",
    "Lethal Dash",
    "Void Tech",
    "Reversed Void Tech",
    "No Shiftlock Void Tech",
    "Shove M1 Reset",
    "Kyoto",
    "True Downslam",
    "Backdash Cancels",
    "Side Dash Cancel",
    "Emote BDC",
    "Supa Tech",
    "FastGarou",
    "10Tiles",
    "Tab Dashes",
    "Frontdash Cancel",
    "3 M1 Resets"
  ];

  const basePlans = [
    { id: "1day", basePrice: 0, sale: false, trial: true, robuxPremium: 0, robuxNoPremium: 0 },
    { id: "3days", basePrice: 0.99, sale: false, featured: true, robuxPremium: 150, robuxNoPremium: 215 },
    { id: "monthly", basePrice: 4.99, sale: false, subscription: true, featured: true, robuxPremium: 750, robuxNoPremium: 1080 },
    { id: "lifetime", basePrice: 29.99, compareAt: 39.99, sale: false, featured: true, robuxPremium: 4500, robuxNoPremium: 6430 }
  ];

  const saleStartsAt = new Date("2026-05-31T00:00:00+02:00");
  const saleEndsAt = new Date("2026-06-03T23:59:59+02:00");
  const robuxTicketUrl = "https://discord.com/channels/1419335632324657306/1421241033693462599";

  const isLaunchSaleActive = () => false;

  const uiTourViews = [
    { id: "home", image: "assets/images/fima-full-home.png?v=20260530-1" },
    { id: "macros", image: "assets/images/fima-full-macros.png?v=20260530-1" },
    { id: "shop", image: "assets/images/fima-full-shop.png?v=20260530-1" },
    { id: "updates", image: "assets/images/fima-full-updates.png?v=20260530-1" },
    { id: "benefits", image: "assets/images/fima-full-benefits.png?v=20260530-1" },
    { id: "tutorials", image: "assets/images/fima-full-tutorials.png?v=20260530-1" },
    { id: "feedback", image: "assets/images/fima-full-feedback.png?v=20260530-1" },
    { id: "settings", image: "assets/images/fima-full-settings.png?v=20260530-1" }
  ];

  const macroVideoFallback = [
    {
      id: "normal-supa",
      name: "Normal Supa",
      file: "normal-supa.mp4",
      description: "Supa route preview with the in-app timing flow shown as a clean loop.",
      meta: "Supa preview"
    },
    {
      id: "fastgarou-1-3",
      name: "FastGarou 1&3",
      file: "fastgarou-1-3.mp4",
      description: "FastGarou sequence preview focused on quick activation timing and repeatable movement.",
      meta: "FastGarou preview"
    },
    {
      id: "kyoto",
      name: "Kyoto",
      file: "kyoto.mp4",
      description: "Kyoto execution sample for users who want to see the profile before binding it.",
      meta: "Kyoto preview"
    },
    {
      id: "kakyo-tech",
      name: "Kakyo Tech",
      file: "kakyo-tech.mp4",
      description: "Kakyo Tech execution sample for checking jump uppercut timing before binding the profile.",
      meta: "Kakyo preview"
    },
    {
      id: "normal-void",
      name: "Normal Void",
      file: "normal-void.mp4",
      description: "Void Tech route shown with the same looped preview behavior used inside the macro section.",
      meta: "Void preview"
    },
    {
      id: "no-shiftlock-void",
      name: "No Shiftlock Void",
      file: "no-shiftlock-void.mp4",
      description: "No-shiftlock Void example for setups that avoid shiftlock during execution.",
      meta: "No-shiftlock preview"
    },
    {
      id: "emote-bdc",
      name: "Emote BDC",
      file: "emote-bdc.mp4",
      description: "Backdash cancel preview built around a fast emote-based activation flow.",
      meta: "BDC preview"
    },
    {
      id: "10tiles",
      name: "10Tiles",
      file: "10tiles.mp4",
      description: "10Tiles movement sample for checking spacing, direction and execution timing.",
      meta: "10Tiles preview"
    }
  ];

  let activeTourView = "home";
  let selectedMacroVideo = "normal-supa";
  let macroVideos = macroVideoFallback;
  let macroVideoSwitchToken = 0;
  let tourImageSwitchToken = 0;
  let tourTimer;

  const copy = {
    en: {
      accessibility: { skip: "Skip to content", menu: "Open menu" },
      controls: { theme: "Theme", language: "Language", currency: "Currency" },
      nav: {
        home: "Home",
        macros: "Macros",
        features: "Features",
        pricing: "Pricing",
        download: "Download",
        faq: "FAQ",
        support: "Support",
        dashboard: "Account",
        cta: "Buy Now"
      },
      hero: {
        eyebrow: "Fima Macro for TSBG",
        title: "Precision macros built around your setup.",
        description: "Fima Macro aligns clean movement timing with ping-aware profiles, resolution scaling and sensitivity-based values for smoother execution in TSBG.",
        primaryCta: "Get Fima Macro",
        secondaryCta: "Join Discord",
        floatOneLabel: "License",
        floatTwoLabel: "Updater",
        stats: [
          ["20+", "Macros"],
          ["Ping", "Adaptive"],
          ["Screen", "Scaling"],
          ["Auto", "Updates"],
          ["HWID", "License"],
          ["Secure", "Checkout ready"]
        ]
      },
      mockup: {
        realPreview: "Real app home preview",
        profiles: "Profiles",
        activeMacro: "Active macro",
        ready: "Ready",
        ping: "Ping",
        resolution: "Resolution",
        sensitivity: "Sensitivity",
        scaleTitle: "Setup scaling",
        scaleText: "Timing and movement values adapt from the base profile to your screen and sensitivity."
      },
      macros: {
        eyebrow: "Macro library",
        title: "Fast access to the techs players actually use.",
        description: "Every card is designed as a clean profile target, ready for keybind-based activation and future license-controlled delivery.",
        descriptions: [
          "Optimized movement timing for cleaner activation windows.",
          "Built with sensitivity and screen scaling support in mind.",
          "Designed for fast keybind-based activation during movement.",
          "Structured for consistent timing across different ping ranges.",
          "Prepared for profile tuning without overcomplicated setup.",
          "A focused tech profile for smoother repeated execution."
        ]
      },
      showcase: {
        eyebrow: "Live macro preview",
        title: "Choose a macro and watch the execution.",
        description: "Each preview is loaded from the public video manifest, so new clips can be added without rebuilding the page layout.",
        videoLabel: "Macro execution demo",
        currentLabel: "Now playing",
        sideTitle: "Profiles and binds",
        sideText: "Add a new MP4 and a manifest entry, then the selector refreshes with the new macro video automatically."
      },
      tour: {
        eyebrow: "App walkthrough",
        title: "Move through the real Fima Macro Studio channels.",
        description: "Home, macros, shop, updates, benefits, tutorials, feedback and settings are all captured from the live desktop app.",
        views: {
          home: { label: "Home", title: "Macro control studio", description: "Dashboard, macro power, activity and live status in one focused app window." },
          macros: { label: "Macros", title: "Profiles and binds", description: "Browse profiles, assign binds and tune macro timing without leaving the macro screen." },
          shop: { label: "Shop", title: "Stores and community", description: "Community links and store surfaces sit inside the same premium desktop shell." },
          updates: { label: "Updates", title: "Version changelog", description: "Release notes, updater checks and version history stay visible inside the app." },
          benefits: { label: "Benefits", title: "Macro benefits", description: "The app explains macro coverage and availability from a focused benefits screen." },
          tutorials: { label: "Tutorials", title: "Tutorial library", description: "Tutorial videos and macro guides can live beside the profiles users already run." },
          feedback: { label: "Feedback", title: "Feedback channel", description: "Users can send suggestions or issues from a dedicated in-app feedback surface." },
          settings: { label: "Settings", title: "Setup scaling and runtime", description: "Sensitivity, ping, screen size, theme and keyboard layout live in one settings surface." }
        }
      },
      upcoming: {
        eyebrow: "Coming soon",
        title: "Next macro profiles already have room in the system.",
        description: "These profiles are planned as locked or upcoming variants inside the app direction.",
        status: "Planned",
        items: [
          ["Tab Supa", "Additional Supa variant for tab-based routes."],
          ["No-Shiftlock Lethal", "Lethal Dash variant tuned for no-shiftlock setups."],
          ["Normal Twisted", "Future Twisted route beside True Twisted."],
          ["Shove 3M1 Reset", "Follow-up reset variant for the 3M1 family."],
          ["Boomy Tech", "New tech profile reserved for a later update."]
        ]
      },
      features: {
        eyebrow: "Core system",
        title: "Built to adapt timing and movement values to your setup.",
        description: "Fima Macro is structured around ping, resolution and sensitivity so profiles can stay consistent across different players and screens.",
        items: [
          ["Ping based timing", "Profiles can be tuned around network delay so inputs feel more consistent across sessions."],
          ["Screen resolution scaling", "Movement values can scale from a 2560x1440 base to match the player's current display."],
          ["Sensitivity scaling", "Macro values can adapt from a base sensitivity such as 1.2 to the user's real setup."],
          ["No shiftlock support", "Specific techs can be delivered with no-shiftlock friendly profile logic."],
          ["Auto update system", "The site preserves the downloads path and can read the existing latest.json manifest."],
          ["Clean keybind system", "Profiles are designed around clear activation, quick edits and less setup friction."],
          ["Macro profiles", "Each tech can live as its own profile for faster selection and future account syncing."],
          ["Discord support", "Support and release notes can stay close to the community while backend work continues."],
          ["HWID license lock", "Prepared for a license model tied to a device with controlled reset requests."],
          ["Lightweight app", "The product direction is a focused tool without unnecessary background clutter."],
          ["Simple setup", "The website explains setup paths without pretending a backend is already live."],
          ["Modern UI", "The interface direction is dark, compact and built for repeated use."],
          ["Multi-language website", "Language data is structured so more translations can be extended cleanly."],
          ["Theme customization", "Users can pick a color theme and keep it after refresh with localStorage."],
          ["Currency auto-detection", "Country-level defaults can set currency while manual choices stay respected."]
        ]
      },
      pricing: {
        eyebrow: "Pricing",
        title: "Beta access that stays simple.",
        description: "Early access pricing is lower while Fima Macro is still being stabilized. Prices may increase later; active users keep their paid period.",
        note: "Purchases create a time-based Fima Macro license automatically after Stripe confirms payment.",
        buy: "Buy",
        payCard: "Pay with Card",
        payRobux: "Pay with Robux",
        buyGiftCode: "Buy Gift Code",
        giftCodeBlocked: "Please login before buying gift codes. Roblox is optional on the website.",
        accessPass: "Access pass",
        saleEnds: "Early access",
        saleBannerTitle: "Beta / Early Access pricing",
        saleBannerText: "Prices may increase after the app becomes more stable. Existing active users keep the access they already paid for.",
        saleCountdown: "Updated",
        offBadge: "Deal",
        fixedPrice: "Fixed price",
        oldPrice: "Base price",
        salePrice: "Current price",
        robuxPremium: "Robux with Premium/Plus",
        robuxNoPremium: "Robux without Premium/Plus",
        robuxNote: "Without Premium/Plus includes Roblox's 30% fee, so we receive the correct amount.",
        robuxTicket: "Robux payments are manually verified by staff. Open a Discord ticket and include your plan, Roblox username and whether you pay with Premium/Plus.",
        robuxModalTitle: "Manual Robux payment",
        robuxModalDescription: "Robux payments are not automatic checkout. Open a Discord ticket, include the selected plan and Roblox username, and wait for staff to verify the payment and order.",
        robuxModalStaff: "Staff will verify the payment before any license is delivered.",
        robuxModalStripe: "No automatic Stripe checkout is started.",
        robuxOpenTicket: "Open Discord Ticket",
        accountPrompt: "Already bought? Log in to see your licenses in My Products. New here? Register first.",
        plans: {
          "1day": {
            name: "Free Trial",
            duration: "1 day trial access",
            badge: "Discord required",
            features: ["Free 1 day trial", "Discord link required only for trial", "Full Fima Macro access", "Updates included"]
          },
          "3days": {
            name: "3 Days Access",
            duration: "3 days license access",
            badge: "Starter",
            features: ["Low beta entry price", "No Discord or Roblox required", "Full Fima Macro access", "Updates included"]
          },
          "monthly": {
            name: "Monthly Subscription",
            duration: "Auto-renews monthly",
            badge: "Most Popular",
            features: ["EUR 4.99/month beta price", "Cancel renewal anytime", "Access remains active until period end", "Full Fima Macro access"]
          },
          lifetime: {
            name: "Lifetime",
            duration: "Lifetime license",
            badge: "Best long-term",
            features: ["One-time beta price", "Full Fima Macro access", "Future updates included", "Lifetime license"]
          }
        }
      },
      checkout: {
        eyebrow: "Secure checkout",
        title: "Log in first",
        description: "Your license needs an account, so log in or register before buying.",
        loginFirstTitle: "Log in first",
        loginFirstBody: "Your license needs an account, so log in or register before buying.",
        loginButton: "Log in",
        registerButton: "Register",
        emailLabel: "Email address",
        cancel: "Cancel",
        continue: "Continue to Stripe",
        loading: "Creating checkout...",
        invalidEmail: "Enter a valid email address.",
        failed: "Checkout is not ready right now. Try again or open support.",
        backendMissing: "Payment is not reachable right now. Try again or open support."
      },
      download: {
        eyebrow: "Download",
        title: "Download the current setup.",
        description: "Install Fima Macro, then use your license key or free trial inside the app.",
        primaryCta: "Download Fima Macro",
        secondaryCta: "Setup Help",
        latest: "Latest version",
        versionFallback: "Manifest check pending",
        versionUnavailable: "latest.json not found",
        platform: "Platform",
        updater: "Auto updater",
        updaterValue: "Supported",
        support: "Support"
      },
      dashboard: {
        eyebrow: "Dashboard preview",
        title: "License management will live here after backend integration.",
        description: "This placeholder shows the planned direction: license login, plan info, expiry date, HWID reset requests, downloads and support links.",
        inputLabel: "License key",
        button: "License system coming soon",
        plan: "Plan",
        planValue: "Backend required",
        hwid: "HWID",
        hwidValue: "Reset requests planned",
        access: "Download access",
        accessValue: "Connected after login"
      },
      faq: {
        title: "Common questions before buying.",
        description: "Short, clear answers about access, updates, licenses, refunds and the move away from SellAuth.",
        items: [
          ["What is Fima Macro?", "Fima Macro is a premium macro app built around clean timing, keybind profiles, ping-aware setups and scaling for resolution and sensitivity."],
          ["Is this a one-time purchase or subscription?", "Both are available: 3 Days and Lifetime are one-time, Monthly is a cancellable subscription, and the free trial is 1 day."],
          ["Do I get updates?", "Yes. Active licenses include updates during the access period, and lifetime includes future updates."],
          ["Can I change my PC?", "The license system is planned around HWID locking with reset requests handled through support or the dashboard."],
          ["What happens when my license expires?", "The app will no longer unlock until the license is renewed or extended."],
          ["Do you offer refunds?", "Due to the digital nature of the product, refunds may be limited after access or license delivery. Please contact support if you have an issue."],
          ["How do I get support?", "Discord will be the main support channel, with contact email available for account or billing issues."],
          ["Is SellAuth used?", "No. This site is prepared for Fima Macro's own domain, checkout and license system."],
          ["Which payment methods will be supported?", "Stripe Checkout and PayPal support are planned for the backend phase."],
          ["Does the app support different sensitivities and resolutions?", "The system direction supports scaling from base resolution and sensitivity values to the user's actual setup."]
        ]
      },
      support: {
        eyebrow: "Support",
        title: "Need setup help or checkout updates?",
        description: "Discord will be the fastest place for setup questions, license help and release announcements while the new backend is being built.",
        discord: "Join Discord",
        contact: "Contact Support"
      },
      legal: {
        termsTitle: "Terms of Service",
        termsText: "Use of Fima Macro will be governed by the final terms published with the checkout and license backend.",
        privacyTitle: "Privacy Policy",
        privacyText: "This static site stores theme, language and currency preferences locally in your browser. Country detection is used only for defaults.",
        refundTitle: "Refund Policy",
        refundText: "Due to the digital nature of the product, refunds may be limited after access or license delivery. Please contact support if you have an issue."
      },
      footer: {
        disclaimer: "Fima Macro is not affiliated with, endorsed by, or sponsored by Roblox Corporation.",
        terms: "Terms of Service",
        privacy: "Privacy Policy",
        refund: "Refund Policy",
        contact: "Contact"
      }
    },
    tr: {
      accessibility: { skip: "\u0130\u00e7eri\u011fe ge\u00e7", menu: "Men\u00fcy\u00fc a\u00e7" },
      controls: { theme: "Tema", language: "Dil", currency: "Para birimi" },
      nav: {
        home: "Ana",
        macros: "Macrolar",
        features: "\u00d6zellikler",
        pricing: "Fiyatlar",
        download: "\u0130ndir",
        faq: "SSS",
        support: "Destek",
        dashboard: "Hesap",
        cta: "Sat\u0131n Al"
      },
      hero: {
        eyebrow: "TSBG i\u00e7in Fima Macro",
        title: "Ayarlar\u0131na uyumlu hassas macrolar.",
        description: "Fima Macro; ping'e duyarl\u0131 profiller, \u00e7\u00f6z\u00fcn\u00fcrl\u00fck \u00f6l\u00e7ekleme ve sensitivity tabanl\u0131 de\u011ferlerle TSBG i\u00e7in daha temiz hareket zamanlamas\u0131 sunar.",
        primaryCta: "Fima Macro Al",
        secondaryCta: "Discord'a Kat\u0131l",
        floatOneLabel: "Lisans",
        floatTwoLabel: "Updater",
        stats: [["20+", "Macro"], ["Ping", "Uyumlu"], ["Ekran", "\u00d6l\u00e7ekleme"], ["Otomatik", "G\u00fcncelleme"], ["HWID", "Lisans"], ["G\u00fcvenli", "Checkout haz\u0131r"]]
      },
      mockup: {
        realPreview: "Ger\u00e7ek app ana ekran \u00f6nizlemesi",
        profiles: "Profiller",
        activeMacro: "Aktif macro",
        ready: "Haz\u0131r",
        ping: "Ping",
        resolution: "\u00c7\u00f6z\u00fcn\u00fcrl\u00fck",
        sensitivity: "Sensitivity",
        scaleTitle: "Kurulum \u00f6l\u00e7ekleme",
        scaleText: "Zamanlama ve hareket de\u011ferleri base profilden ekran\u0131na ve sensitivity ayar\u0131na g\u00f6re uyarlan\u0131r."
      },
      macros: {
        eyebrow: "Macro k\u00fct\u00fcphanesi",
        title: "Oyuncular\u0131n ger\u00e7ekten kulland\u0131\u011f\u0131 techlere h\u0131zl\u0131 eri\u015fim.",
        description: "Her kart temiz bir profil hedefi olarak tasarland\u0131; keybind aktivasyonu ve gelecekte lisans kontroll\u00fc da\u011f\u0131t\u0131m i\u00e7in haz\u0131r.",
        descriptions: [
          "Daha temiz aktivasyon aral\u0131klar\u0131 i\u00e7in optimize edilmi\u015f hareket zamanlamas\u0131.",
          "Sensitivity ve ekran \u00f6l\u00e7ekleme deste\u011fi d\u00fc\u015f\u00fcn\u00fclerek haz\u0131rlanm\u0131\u015ft\u0131r.",
          "Hareket s\u0131ras\u0131nda h\u0131zl\u0131 keybind aktivasyonu i\u00e7in tasarlanm\u0131\u015ft\u0131r.",
          "Farkl\u0131 ping aral\u0131klar\u0131nda daha tutarl\u0131 zamanlama hedefler.",
          "Karma\u015f\u0131k kurulum olmadan profil ayar\u0131 yap\u0131labilecek \u015fekilde haz\u0131rland\u0131.",
          "Tekrarl\u0131 kullan\u0131mda daha ak\u0131c\u0131 sonu\u00e7 i\u00e7in odaklanm\u0131\u015f tech profili."
        ]
      },
      showcase: {
        eyebrow: "Canli macro onizleme",
        title: "Macro sec ve calisma akisini izle.",
        description: "Her onizleme public video manifestinden yuklenir; yeni klip eklediginde sayfa tasarimini tekrar kurmadan liste genisler.",
        videoLabel: "Macro execution demo",
        currentLabel: "Simdi oynuyor",
        sideTitle: "Profiller ve bindler",
        sideText: "Yeni MP4 ve manifest kaydi eklediginde secici otomatik olarak yeni macro videosunu gosterir."
      },
      tour: {
        eyebrow: "App walkthrough",
        title: "Gercek Fima Macro Studio kanallarinda gez.",
        description: "Home, macros, shop, updates, benefits, tutorials, feedback ve settings ekranlari direkt canli desktop app'ten yakalandi.",
        views: {
          home: { label: "Home", title: "Macro control studio", description: "Dashboard, macro power, activity ve live status tek odakli app penceresinde." },
          macros: { label: "Macros", title: "Profiller ve bindler", description: "Profilleri gez, bind ata ve timing ayarlarini macro ekranindan cikmadan duzenle." },
          shop: { label: "Shop", title: "Stores and community", description: "Community ve store yuzeyleri ayni premium desktop shell icinde durur." },
          updates: { label: "Updates", title: "Version changelog", description: "Release notlari, updater kontrolu ve version gecmisi app icinde gorunur." },
          benefits: { label: "Benefits", title: "Macro benefits", description: "App, macro kapsamini ve hazir olan kisimlari odakli bir benefits ekraninda anlatir." },
          tutorials: { label: "Tutorials", title: "Tutorial library", description: "Tutorial videolari ve macro rehberleri profillerin yaninda hazir durur." },
          feedback: { label: "Feedback", title: "Feedback channel", description: "Kullanicilar onerileri veya sorunlari app icindeki feedback ekranindan gonderebilir." },
          settings: { label: "Settings", title: "Setup scaling ve runtime", description: "Sensitivity, ping, ekran boyutu, tema ve klavye duzeni tek settings yuzeyinde." }
        }
      },
      upcoming: {
        eyebrow: "Yakinda",
        title: "Sonraki macro profilleri sistemde yerini aliyor.",
        description: "Bu profiller app tarafinda locked veya upcoming variant olarak planlanan yeni techler.",
        status: "Planlandi",
        items: [
          ["Tab Supa", "Tab tabanli rotalar icin ek Supa varianti."],
          ["No-Shiftlock Lethal", "No-shiftlock setup icin ayarlanacak Lethal Dash varianti."],
          ["Normal Twisted", "True Twisted yaninda gelecek Twisted rotasi."],
          ["Shove 3M1 Reset", "3M1 ailesi icin follow-up reset varianti."],
          ["Boomy Tech", "Sonraki update icin ayrilan yeni tech profili."]
        ]
      },
      features: {
        eyebrow: "\u00c7ekirdek sistem",
        title: "Zamanlama ve hareket de\u011ferlerini senin kurulumuna uyarlamak i\u00e7in tasarland\u0131.",
        description: "Fima Macro; ping, \u00e7\u00f6z\u00fcn\u00fcrl\u00fck ve sensitivity mant\u0131\u011f\u0131 etraf\u0131nda yap\u0131land\u0131r\u0131l\u0131r, b\u00f6ylece profiller farkl\u0131 ekranlarda daha tutarl\u0131 kalabilir.",
        items: [
          ["Ping tabanl\u0131 zamanlama", "Profiller a\u011f gecikmesine g\u00f6re ayarlanabilecek yap\u0131da tutulur."],
          ["Ekran \u00e7\u00f6z\u00fcn\u00fcrl\u00fc\u011f\u00fc \u00f6l\u00e7ekleme", "Hareket de\u011ferleri 2560x1440 base ekrandan oyuncunun mevcut ekran\u0131na \u00f6l\u00e7eklenebilir."],
          ["Sensitivity \u00f6l\u00e7ekleme", "Macro de\u011ferleri 1.2 gibi base sensitivity de\u011ferinden kullan\u0131c\u0131n\u0131n ger\u00e7ek ayar\u0131na uyarlanabilir."],
          ["No shiftlock deste\u011fi", "Belirli techler no-shiftlock kullan\u0131m\u0131na uygun profil mant\u0131\u011f\u0131yla haz\u0131rlanabilir."],
          ["Otomatik update sistemi", "Site downloads yolunu korur ve mevcut latest.json manifestini okuyabilir."],
          ["Temiz keybind sistemi", "Profiller net aktivasyon, h\u0131zl\u0131 d\u00fczenleme ve daha az kurulum karma\u015fas\u0131 i\u00e7in tasarlan\u0131r."],
          ["Macro profilleri", "Her tech kendi profili olarak tutulabilir; ileride hesap senkronizasyonuna haz\u0131rd\u0131r."],
          ["Discord deste\u011fi", "Destek ve release notlar\u0131 backend tamamlan\u0131rken toplulu\u011fa yak\u0131n kal\u0131r."],
          ["HWID lisans kilidi", "Cihaza ba\u011fl\u0131 lisans ve kontroll\u00fc reset talepleri i\u00e7in haz\u0131rlanm\u0131\u015ft\u0131r."],
          ["Hafif uygulama", "Gereksiz arka plan karma\u015fas\u0131 olmayan odakl\u0131 bir tool hedeflenir."],
          ["Basit kurulum", "Site backend canl\u0131ym\u0131\u015f gibi davranmadan kurulum yolunu a\u00e7\u0131k anlat\u0131r."],
          ["Modern UI", "Aray\u00fcz y\u00f6n\u00fc dark, kompakt ve tekrar kullan\u0131ma uygun olacak \u015fekilde tasarland\u0131."],
          ["\u00c7ok dilli website", "Dil verisi yeni \u00e7eviriler kolay eklenecek \u015fekilde yap\u0131land\u0131r\u0131ld\u0131."],
          ["Tema \u00f6zelle\u015ftirme", "Kullan\u0131c\u0131 tema rengini se\u00e7er ve se\u00e7im localStorage ile yenilemeden sonra korunur."],
          ["Para birimi alg\u0131lama", "\u00dclke seviyesinde varsay\u0131lan para birimi se\u00e7ilir; manuel se\u00e7imler korunur."]
        ]
      },
      pricing: {
        eyebrow: "Fiyatlar",
        title: "Beta eri\u015fim plan\u0131n\u0131 se\u00e7.",
        description: "Fima Macro beta d\u00f6nemindeyken fiyatlar daha uygun. Uygulama daha stabil olunca fiyatlar artabilir; aktif kullan\u0131c\u0131lar \u00f6dedikleri s\u00fcreyi korur.",
        note: "Stripe \u00f6demeyi onaylad\u0131ktan sonra s\u00fcreli Fima Macro lisans\u0131 otomatik olu\u015fturulur.",
        buy: "Sat\u0131n Al",
        payCard: "Kart ile \u00d6de",
        payRobux: "Robux ile \u00d6de",
        buyGiftCode: "Gift Code Sat\u0131n Al",
        giftCodeBlocked: "Gift code sat\u0131n almadan \u00f6nce giri\u015f yapmal\u0131s\u0131n. Roblox web sitesinde opsiyoneldir.",
        accessPass: "Eri\u015fim kart\u0131",
        saleEnds: "Erken eri\u015fim",
        saleBannerTitle: "Beta / erken eri\u015fim fiyat\u0131",
        saleBannerText: "Fiyatlar uygulama stabil olduktan sonra artabilir. Aktif kullan\u0131c\u0131lar mevcut \u00f6denmi\u015f s\u00fcrelerini korur.",
        saleCountdown: "Guncel",
        offBadge: "%25 \u0130ndirim",
        fixedPrice: "Sabit fiyat",
        oldPrice: "Normal fiyat",
        salePrice: "Guncel fiyat",
        robuxPremium: "Premium/Plus ile Robux",
        robuxNoPremium: "Premium/Plus olmadan Robux",
        robuxNote: "Premium/Plus olmadan Roblox %30 kesinti al\u0131r; bu fiyat kesintiyi kapsar.",
        robuxTicket: "Robux \u00f6demeleri staff taraf\u0131ndan manuel do\u011frulan\u0131r. Ticket a\u00e7\u0131p plan\u0131n\u0131, Roblox kullan\u0131c\u0131 ad\u0131n\u0131 ve Premium/Plus durumunu yaz.",
        robuxModalTitle: "Manuel Robux \u00f6demesi",
        robuxModalDescription: "Robux \u00f6demeleri otomatik checkout de\u011fildir. Discord ticket a\u00e7, se\u00e7ilen plan\u0131 ve Roblox kullan\u0131c\u0131 ad\u0131n\u0131 yaz, staff \u00f6demeyi ve sipari\u015fi do\u011frulas\u0131n.",
        robuxModalStaff: "Lisans teslim edilmeden \u00f6nce staff \u00f6demeyi do\u011frular.",
        robuxModalStripe: "Bu i\u015flem Stripe Checkout ba\u015flatmaz.",
        robuxOpenTicket: "Discord Ticket A\u00e7",
        accountPrompt: "Zaten ald\u0131ysan Login veya Register ile My Products i\u00e7inde lisanslar\u0131n\u0131 g\u00f6rebilirsin.",
        plans: {
          "1day": { name: "Free Trial", duration: "1 g\u00fcn deneme eri\u015fimi", badge: "Discord gerekli", features: ["1 g\u00fcn \u00fccretsiz deneme", "Discord sadece trial i\u00e7in gerekli", "Tam Fima Macro eri\u015fimi", "G\u00fcncellemeler dahil"] },
          "3days": { name: "3 G\u00fcn Eri\u015fim", duration: "3 g\u00fcn lisans eri\u015fimi", badge: "Ba\u015flang\u0131\u00e7", features: ["Uygun beta fiyat\u0131", "Discord veya Roblox gerekmez", "Tam Fima Macro eri\u015fimi", "G\u00fcncellemeler dahil"] },
          "monthly": { name: "Ayl\u0131k Abonelik", duration: "Her ay otomatik yenilenir", badge: "En Pop\u00fcler", features: ["EUR 4.99/ay beta fiyat\u0131", "Yenilemeyi istedi\u011fin zaman iptal et", "Eri\u015fim d\u00f6nem sonuna kadar aktif kal\u0131r", "Tam Fima Macro eri\u015fimi"] },
          lifetime: { name: "Lifetime", duration: "S\u00fcresiz lisans", badge: "Uzun vade", features: ["Tek seferlik beta fiyat\u0131", "Tam Fima Macro eri\u015fimi", "Gelecek g\u00fcncellemeler dahil", "S\u00fcresiz lisans"] }
        }
      },
      checkout: {
        eyebrow: "G\u00fcvenli checkout",
        title: "\u00d6nce giri\u015f yap",
        description: "Lisans\u0131n bir hesaba ba\u011flanmal\u0131. Sat\u0131n almadan \u00f6nce giri\u015f yap veya kaydol.",
        loginFirstTitle: "\u00d6nce giri\u015f yap",
        loginFirstBody: "Lisans\u0131n bir hesaba ba\u011flanmal\u0131. Sat\u0131n almadan \u00f6nce giri\u015f yap veya kaydol.",
        loginButton: "Giri\u015f yap",
        registerButton: "Kaydol",
        emailLabel: "E-posta adresi",
        cancel: "\u0130ptal",
        continue: "Stripe'a devam et",
        loading: "Checkout olu\u015fturuluyor...",
        invalidEmail: "Ge\u00e7erli bir e-posta adresi gir.",
        failed: "Checkout ba\u015flat\u0131lamad\u0131. Birazdan tekrar dene.",
        backendMissing: "\u00d6deme sunucusuna \u015fu an ula\u015f\u0131lam\u0131yor. Backend deploy edildikten sonra tekrar dene."
      },
      download: {
        eyebrow: "\u0130ndir",
        title: "Guncel setup'i indir.",
        description: "Fima Macro'yu kur, sonra lisans keyini veya free trial'ini uygulamada kullan.",
        primaryCta: "Fima Macro indir",
        secondaryCta: "Kurulum Yard\u0131m\u0131",
        latest: "Son s\u00fcr\u00fcm",
        versionFallback: "Manifest kontrol ediliyor",
        versionUnavailable: "latest.json bulunamad\u0131",
        platform: "Platform",
        updater: "Auto updater",
        updaterValue: "Destekleniyor",
        support: "Destek"
      },
      dashboard: {
        eyebrow: "Dashboard \u00f6nizleme",
        title: "Lisans y\u00f6netimi backend entegrasyonundan sonra burada olacak.",
        description: "Bu placeholder planlanan y\u00f6n\u00fc g\u00f6sterir: lisans giri\u015fi, plan bilgisi, biti\u015f tarihi, HWID reset talepleri, indirme ve destek linkleri.",
        inputLabel: "Lisans anahtar\u0131",
        button: "Lisans sistemi yak\u0131nda",
        plan: "Plan",
        planValue: "Backend gerekli",
        hwid: "HWID",
        hwidValue: "Reset talepleri planland\u0131",
        access: "Download eri\u015fimi",
        accessValue: "Login sonras\u0131 ba\u011flanacak"
      },
      faq: {
        title: "Sat\u0131n alma \u00f6ncesi s\u0131k sorulanlar.",
        description: "Eri\u015fim, g\u00fcncellemeler, lisans, iade ve SellAuth'tan ayr\u0131lma hakk\u0131nda k\u0131sa cevaplar.",
        items: [
          ["Fima Macro nedir?", "Fima Macro; temiz zamanlama, keybind profilleri, ping'e duyarl\u0131 kurulum ve \u00e7\u00f6z\u00fcn\u00fcrl\u00fck/sensitivity \u00f6l\u00e7ekleme etraf\u0131nda geli\u015ftirilen premium macro uygulamas\u0131d\u0131r."],
          ["Tek seferlik sat\u0131n alma m\u0131 abonelik mi?", "Ikisi de var: 3 Gun ve Lifetime tek seferlik, Monthly iptal edilebilir abonelik, free trial ise 1 gundur."],
          ["G\u00fcncelleme alacak m\u0131y\u0131m?", "Evet. Aktif lisanslar eri\u015fim s\u00fcresi boyunca g\u00fcncelleme al\u0131r; lifetime gelecekteki g\u00fcncellemeleri kapsar."],
          ["Bilgisayar\u0131m\u0131 de\u011fi\u015ftirebilir miyim?", "Lisans sistemi HWID kilidi ve destek/dashboard \u00fczerinden reset talepleri mant\u0131\u011f\u0131yla planlan\u0131yor."],
          ["Lisans\u0131m bitince ne olur?", "Lisans yenilenene veya uzat\u0131lana kadar uygulama a\u00e7\u0131lmaz."],
          ["\u0130ade var m\u0131?", "\u00dcr\u00fcn dijital oldu\u011fu i\u00e7in eri\u015fim veya lisans tesliminden sonra iadeler s\u0131n\u0131rl\u0131 olabilir. Sorun ya\u015farsan destekle ileti\u015fime ge\u00e7."],
          ["Nas\u0131l destek al\u0131r\u0131m?", "Ana destek kanal\u0131 Discord olacak; hesap veya \u00f6deme konular\u0131 i\u00e7in e-posta da bulunacak."],
          ["SellAuth kullan\u0131l\u0131yor mu?", "Hay\u0131r. Bu site Fima Macro'nun kendi domaini, checkout ve lisans sistemi i\u00e7in haz\u0131rland\u0131."],
          ["Hangi \u00f6deme y\u00f6ntemleri desteklenecek?", "Backend a\u015famas\u0131nda Stripe Checkout ve PayPal deste\u011fi planlan\u0131yor."],
          ["Uygulama farkl\u0131 sensitivity ve \u00e7\u00f6z\u00fcn\u00fcrl\u00fckleri destekler mi?", "Sistem y\u00f6n\u00fc base \u00e7\u00f6z\u00fcn\u00fcrl\u00fck ve sensitivity de\u011ferlerinden kullan\u0131c\u0131n\u0131n ger\u00e7ek kurulumuna \u00f6l\u00e7ekleme destekler."]
        ]
      },
      support: {
        eyebrow: "Destek",
        title: "Kurulum yard\u0131m\u0131 veya checkout geli\u015fmeleri mi laz\u0131m?",
        description: "Yeni backend haz\u0131rlan\u0131rken kurulum sorular\u0131, lisans yard\u0131m\u0131 ve s\u00fcr\u00fcm duyurular\u0131 i\u00e7in en h\u0131zl\u0131 yer Discord olacak.",
        discord: "Discord'a Kat\u0131l",
        contact: "Destekle \u0130leti\u015fim"
      },
      legal: {
        termsTitle: "Kullan\u0131m \u015eartlar\u0131",
        termsText: "Fima Macro kullan\u0131m\u0131, checkout ve lisans backend'iyle birlikte yay\u0131nlanacak final \u015fartlara ba\u011fl\u0131 olacakt\u0131r.",
        privacyTitle: "Gizlilik Politikas\u0131",
        privacyText: "Bu statik site tema, dil ve para birimi tercihlerini taray\u0131c\u0131da yerel olarak saklar. \u00dclke tespiti sadece varsay\u0131lanlar i\u00e7in kullan\u0131l\u0131r.",
        refundTitle: "\u0130ade Politikas\u0131",
        refundText: "\u00dcr\u00fcn dijital oldu\u011fu i\u00e7in eri\u015fim veya lisans tesliminden sonra iadeler s\u0131n\u0131rl\u0131 olabilir. Sorun ya\u015farsan destekle ileti\u015fime ge\u00e7."
      },
      footer: {
        disclaimer: "Fima Macro; Roblox Corporation ile ba\u011flant\u0131l\u0131, onayl\u0131 veya sponsorlu de\u011fildir.",
        terms: "Kullan\u0131m \u015eartlar\u0131",
        privacy: "Gizlilik Politikas\u0131",
        refund: "\u0130ade Politikas\u0131",
        contact: "\u0130leti\u015fim"
      }
    },
    de: {
      accessibility: { skip: "Zum Inhalt springen", menu: "Men\u00fc \u00f6ffnen" },
      controls: { theme: "Theme", language: "Sprache", currency: "W\u00e4hrung" },
      nav: { home: "Start", macros: "Macros", features: "Features", pricing: "Preise", download: "Download", faq: "FAQ", support: "Support", dashboard: "Konto", cta: "Kaufen" },
      hero: {
        eyebrow: "Fima Macro f\u00fcr TSBG",
        title: "Pr\u00e4zise Macros f\u00fcr dein Setup.",
        description: "Fima Macro kombiniert sauberes Timing mit ping-bewussten Profilen, Aufl\u00f6sungsskalierung und sensitivity-basierten Werten f\u00fcr fl\u00fcssigere Ausf\u00fchrung in TSBG.",
        primaryCta: "Fima Macro holen",
        secondaryCta: "Discord beitreten",
        floatOneLabel: "Lizenz",
        floatTwoLabel: "Updater",
        stats: [["20+", "Macros"], ["Ping", "Adaptiv"], ["Screen", "Scaling"], ["Auto", "Updates"], ["HWID", "Lizenz"], ["Sicher", "Checkout bereit"]]
      },
      mockup: { realPreview: "Echte App-Home-Vorschau", profiles: "Profile", activeMacro: "Aktives Macro", ready: "Bereit", ping: "Ping", resolution: "Aufl\u00f6sung", sensitivity: "Sensitivity", scaleTitle: "Setup-Skalierung", scaleText: "Timing- und Bewegungswerte passen sich vom Basisprofil an Bildschirm und Sensitivity an." },
      macros: { eyebrow: "Macro-Bibliothek", title: "Schneller Zugriff auf Techs, die Spieler wirklich nutzen.", description: "Jede Karte ist als klares Profilziel f\u00fcr Keybind-Aktivierung und sp\u00e4tere lizenzierte Auslieferung vorbereitet.", descriptions: ["Optimiertes Bewegungstiming f\u00fcr sauberere Aktivierung.", "Mit Sensitivity- und Screen-Scaling im Blick gebaut.", "F\u00fcr schnelle Keybind-Aktivierung w\u00e4hrend der Bewegung gedacht.", "F\u00fcr konsistentes Timing \u00fcber verschiedene Ping-Bereiche strukturiert.", "F\u00fcr Profil-Tuning ohne kompliziertes Setup vorbereitet.", "Ein fokussiertes Tech-Profil f\u00fcr gleichm\u00e4\u00dfigere Wiederholung."] },
      features: {
        eyebrow: "Kernsystem",
        title: "Gebaut, um Timing und Bewegung an dein Setup anzupassen.",
        description: "Fima Macro ist um Ping, Aufl\u00f6sung und Sensitivity strukturiert, damit Profile auf verschiedenen Screens konsistent bleiben.",
        items: [
          ["Ping-basiertes Timing", "Profile k\u00f6nnen rund um Netzwerklatenz abgestimmt werden."],
          ["Aufl\u00f6sungsskalierung", "Bewegungswerte k\u00f6nnen von 2560x1440 auf den aktuellen Bildschirm skaliert werden."],
          ["Sensitivity-Skalierung", "Macro-Werte k\u00f6nnen von einer Basis wie 1.2 auf das echte Setup angepasst werden."],
          ["No-shiftlock Support", "Bestimmte Techs k\u00f6nnen mit no-shiftlock-freundlicher Profil-Logik geliefert werden."],
          ["Auto-Update-System", "Die Site bewahrt den downloads-Pfad und kann latest.json lesen."],
          ["Sauberes Keybind-System", "Profile sind f\u00fcr klare Aktivierung und schnelle \u00c4nderungen gedacht."],
          ["Macro-Profile", "Jede Tech kann als eigenes Profil f\u00fcr sp\u00e4tere Account-Syncs leben."],
          ["Discord Support", "Support und Release Notes bleiben nah an der Community."],
          ["HWID-Lizenzlock", "Vorbereitet f\u00fcr ger\u00e4tegebundene Lizenzen mit kontrollierten Resets."],
          ["Leichte App", "Eine fokussierte Tool-Richtung ohne unn\u00f6tige Hintergrundlast."],
          ["Einfaches Setup", "Die Site erkl\u00e4rt den Weg, ohne ein Live-Backend vorzut\u00e4uschen."],
          ["Modernes UI", "Dunkel, kompakt und f\u00fcr wiederholte Nutzung gebaut."],
          ["Mehrsprachige Website", "Sprachdaten sind sauber erweiterbar."],
          ["Theme-Anpassung", "Theme-Auswahl bleibt per localStorage erhalten."],
          ["W\u00e4hrungs-Autoerkennung", "L\u00e4nderbasierte Defaults respektieren manuelle Auswahl."]
        ]
      },
      pricing: {
        eyebrow: "Preise",
        title: "W\u00e4hle deinen Beta-Zugang.",
        description: "Early-Access-Preise sind niedriger, solange Fima Macro stabilisiert wird. Preise k\u00f6nnen sp\u00e4ter steigen; aktive Nutzer behalten ihren bezahlten Zeitraum.",
        note: "Nach der Stripe Zahlung erscheint die Lizenz direkt auf der Success-Seite.",
        buy: "Kaufen",
        accessPass: "Access Pass",
        saleEnds: "Early Access",
        saleBannerTitle: "Beta / Early-Access Preis",
        saleBannerText: "Preise k\u00f6nnen nach mehr Stabilit\u00e4t steigen. Aktive Nutzer behalten ihren bezahlten Zeitraum.",
        saleCountdown: "Endet in",
        plans: {
          "1day": { name: "Free Trial", duration: "1 Tag Testzugang", badge: "Discord erforderlich", features: ["1 Tag kostenlos testen", "Discord nur f\u00fcr Trial erforderlich", "Voller Fima Macro Zugriff", "Updates inklusive"] },
          "3days": { name: "3 Tage Zugang", duration: "3 Tage Lizenzzugriff", badge: "Starter", features: ["G\u00fcnstiger Beta-Einstieg", "Kein Discord oder Roblox n\u00f6tig", "Voller Fima Macro Zugriff", "Updates inklusive"] },
          "monthly": { name: "Monatsabo", duration: "Verl\u00e4ngert sich monatlich", badge: "Am beliebtesten", features: ["EUR 4.99/Monat Beta-Preis", "Verl\u00e4ngerung jederzeit k\u00fcndbar", "Zugang bleibt bis Periodenende aktiv", "Voller Fima Macro Zugriff"] },
          lifetime: { name: "Lifetime", duration: "Lifetime Lizenz", badge: "Langfristig", features: ["Einmaliger Beta-Preis", "Voller Fima Macro Zugriff", "K\u00fcnftige Updates inklusive", "Lifetime Lizenz"] }
        }
      },
      checkout: { eyebrow: "Sicherer Checkout", title: "Erst einloggen", description: "Deine Lizenz braucht einen Account. Logge dich ein oder registriere dich vor dem Kauf.", loginFirstTitle: "Erst einloggen", loginFirstBody: "Deine Lizenz braucht einen Account. Logge dich ein oder registriere dich vor dem Kauf.", loginButton: "Einloggen", registerButton: "Registrieren", emailLabel: "E-Mail-Adresse", cancel: "Abbrechen", continue: "Weiter zu Stripe", loading: "Checkout wird erstellt...", invalidEmail: "Gib eine gültige E-Mail-Adresse ein.", failed: "Checkout konnte nicht gestartet werden. Bitte versuche es gleich erneut.", backendMissing: "Der Zahlungsserver ist gerade nicht erreichbar. Bitte versuche es gleich erneut." },
      download: { eyebrow: "Download", title: "Aktuelles Setup herunterladen.", description: "Installiere Fima Macro und nutze danach deinen Lizenzschluessel oder Free Trial in der App.", primaryCta: "Fima Macro herunterladen", secondaryCta: "Setup-Hilfe", latest: "Neueste Version", versionFallback: "Manifest wird gepr\u00fcft", versionUnavailable: "latest.json nicht gefunden", platform: "Plattform", updater: "Auto Updater", updaterValue: "Unterst\u00fctzt", support: "Support" },
      dashboard: { eyebrow: "Dashboard Vorschau", title: "Lizenzverwaltung erscheint hier nach Backend-Integration.", description: "Dieser Platzhalter zeigt die Richtung: Lizenzlogin, Plan, Ablaufdatum, HWID-Reset, Downloads und Supportlinks.", inputLabel: "Lizenzschl\u00fcssel", button: "Lizenzsystem kommt bald", plan: "Plan", planValue: "Backend erforderlich", hwid: "HWID", hwidValue: "Reset-Anfragen geplant", access: "Downloadzugriff", accessValue: "Nach Login verbunden" },
      faq: {
        title: "H\u00e4ufige Fragen vor dem Kauf.",
        description: "Kurze Antworten zu Zugriff, Updates, Lizenzen, R\u00fcckerstattung und dem Wechsel weg von SellAuth.",
        items: [
          ["Was ist Fima Macro?", "Eine Premium-Macro-App f\u00fcr sauberes Timing, Keybind-Profile, ping-bewusste Setups und Skalierung f\u00fcr Aufl\u00f6sung und Sensitivity."],
          ["Einmaliger Kauf oder Abo?", "Beides ist verfuegbar: 3 Tage und Lifetime sind Einmalkaeufe, Monthly ist ein kuendbares Abo und Free Trial ist 1 Tag kostenlos."],
          ["Bekomme ich Updates?", "Ja. Aktive Lizenzen erhalten Updates im Zugriffszeitraum, Lifetime umfasst k\u00fcnftige Updates."],
          ["Kann ich den PC wechseln?", "Geplant ist HWID-Lock mit Reset-Anfragen \u00fcber Support oder Dashboard."],
          ["Was passiert nach Ablauf?", "Die App wird erst nach Verl\u00e4ngerung oder Erneuerung wieder freigeschaltet."],
          ["Gibt es R\u00fcckerstattungen?", "Wegen des digitalen Produkts k\u00f6nnen R\u00fcckerstattungen nach Zugriff oder Lizenzlieferung begrenzt sein. Kontaktiere Support bei Problemen."],
          ["Wie bekomme ich Support?", "Discord ist der Hauptkanal, E-Mail f\u00fcr Account- oder Zahlungsfragen."],
          ["Wird SellAuth genutzt?", "Nein. Diese Site ist f\u00fcr eigene Domain, Checkout und Lizenzsystem vorbereitet."],
          ["Welche Zahlungsarten kommen?", "Stripe Checkout und PayPal sind f\u00fcr die Backend-Phase geplant."],
          ["Unterst\u00fctzt die App verschiedene Sensitivities und Aufl\u00f6sungen?", "Die Systemrichtung unterst\u00fctzt Skalierung von Basiswerten zum echten Setup."]
        ]
      },
      support: { eyebrow: "Support", title: "Setup-Hilfe oder Checkout-Updates?", description: "Discord ist der schnellste Ort f\u00fcr Setup-Fragen, Lizenzhilfe und Release-Ank\u00fcndigungen.", discord: "Discord beitreten", contact: "Support kontaktieren" },
      legal: { termsTitle: "Nutzungsbedingungen", termsText: "Die Nutzung von Fima Macro wird durch die finalen Bedingungen mit Checkout und Lizenzbackend geregelt.", privacyTitle: "Datenschutz", privacyText: "Diese statische Site speichert Theme, Sprache und W\u00e4hrung lokal im Browser. L\u00e4ndererkennung dient nur Defaults.", refundTitle: "R\u00fcckerstattung", refundText: "Wegen des digitalen Produkts k\u00f6nnen R\u00fcckerstattungen nach Zugriff oder Lizenzlieferung begrenzt sein. Kontaktiere Support bei Problemen." },
      footer: { disclaimer: "Fima Macro ist nicht mit Roblox Corporation verbunden, wird nicht von Roblox Corporation unterst\u00fctzt und nicht gesponsert.", terms: "Nutzungsbedingungen", privacy: "Datenschutz", refund: "R\u00fcckerstattung", contact: "Kontakt" }
    },
    fr: {
      accessibility: { skip: "Aller au contenu", menu: "Ouvrir le menu" },
      controls: { theme: "Th\u00e8me", language: "Langue", currency: "Devise" },
      nav: { home: "Accueil", macros: "Macros", features: "Fonctions", pricing: "Prix", download: "Download", faq: "FAQ", support: "Aide", dashboard: "Compte", cta: "Acheter" },
      hero: {
        eyebrow: "Fima Macro pour TSBG",
        title: "Des macros pr\u00e9cises adapt\u00e9es \u00e0 ton setup.",
        description: "Fima Macro associe un timing propre, des profils sensibles au ping, le scaling de r\u00e9solution et des valeurs bas\u00e9es sur la sensibilit\u00e9 pour une ex\u00e9cution plus fluide dans TSBG.",
        primaryCta: "Obtenir Fima Macro",
        secondaryCta: "Rejoindre Discord",
        floatOneLabel: "Licence",
        floatTwoLabel: "Updater",
        stats: [["20+", "Macros"], ["Ping", "Adaptatif"], ["\u00c9cran", "Scaling"], ["Auto", "Updates"], ["HWID", "Licence"], ["Checkout", "Pr\u00eat"]]
      },
      mockup: { realPreview: "Aper\u00e7u r\u00e9el de l'app", profiles: "Profils", activeMacro: "Macro active", ready: "Pr\u00eat", ping: "Ping", resolution: "R\u00e9solution", sensitivity: "Sensibilit\u00e9", scaleTitle: "Scaling du setup", scaleText: "Le timing et les mouvements s'adaptent du profil de base \u00e0 ton \u00e9cran et ta sensibilit\u00e9." },
      macros: { eyebrow: "Biblioth\u00e8que de macros", title: "Acc\u00e8s rapide aux techs vraiment utilis\u00e9es.", description: "Chaque carte est pens\u00e9e comme un profil clair pour activation par keybind et distribution future sous licence.", descriptions: ["Timing de mouvement optimis\u00e9 pour une activation plus propre.", "Con\u00e7u avec le scaling de sensibilit\u00e9 et d'\u00e9cran en t\u00eate.", "Pens\u00e9 pour une activation rapide par keybind en mouvement.", "Structur\u00e9 pour un timing coh\u00e9rent sur diff\u00e9rentes plages de ping.", "Pr\u00e9par\u00e9 pour r\u00e9gler les profils sans setup compliqu\u00e9.", "Un profil tech cibl\u00e9 pour une ex\u00e9cution r\u00e9p\u00e9t\u00e9e plus fluide."] },
      features: {
        eyebrow: "Syst\u00e8me central",
        title: "Con\u00e7u pour adapter timing et mouvements \u00e0 ton setup.",
        description: "Fima Macro est structur\u00e9 autour du ping, de la r\u00e9solution et de la sensibilit\u00e9 pour garder les profils coh\u00e9rents entre joueurs.",
        items: [
          ["Timing bas\u00e9 sur le ping", "Les profils peuvent \u00eatre ajust\u00e9s autour de la latence r\u00e9seau."],
          ["Scaling de r\u00e9solution", "Les valeurs peuvent partir d'une base 2560x1440 vers l'\u00e9cran actuel."],
          ["Scaling de sensibilit\u00e9", "Les valeurs peuvent s'adapter d'une base comme 1.2 au vrai setup."],
          ["Support no shiftlock", "Certaines techs peuvent utiliser une logique compatible no-shiftlock."],
          ["Auto update", "Le site conserve le chemin downloads et peut lire latest.json."],
          ["Keybinds propres", "Profils pens\u00e9s pour activation claire et \u00e9dition rapide."],
          ["Profils macro", "Chaque tech peut vivre comme profil s\u00e9par\u00e9."],
          ["Support Discord", "Support et releases proches de la communaut\u00e9."],
          ["Licence HWID", "Pr\u00e9par\u00e9 pour une licence li\u00e9e \u00e0 l'appareil avec resets contr\u00f4l\u00e9s."],
          ["App l\u00e9g\u00e8re", "Direction produit focalis\u00e9e sans bruit inutile."],
          ["Setup simple", "Le site explique le chemin sans simuler un backend live."],
          ["UI moderne", "Interface sombre, compacte et utilisable au quotidien."],
          ["Site multilingue", "Donn\u00e9es de langue faciles \u00e0 \u00e9tendre."],
          ["Personnalisation du th\u00e8me", "Le th\u00e8me choisi reste apr\u00e8s refresh via localStorage."],
          ["Devise automatique", "Les defaults par pays respectent les choix manuels."]
        ]
      },
      pricing: {
        eyebrow: "Prix",
        title: "Choisis la dur\u00e9e d'acc\u00e8s adapt\u00e9e.",
        description: "Les prix beta restent simples et sont affiches clairement; Stripe Checkout encaisse en EUR.",
        note: "Apres le paiement Stripe, la licence apparait directement sur la page de succes.",
        buy: "Acheter",
        accessPass: "Pass d'acc\u00e8s",
        saleEnds: "Acces beta",
        saleBannerTitle: "Tarifs beta simples",
        saleBannerText: "Les produits actuels sont Free Trial, 3 Jours, Mensuel et Lifetime.",
        saleCountdown: "Mise a jour",
        plans: {
          "1day": { name: "Free Trial", duration: "Essai gratuit 1 jour", badge: "Discord requis", features: ["Essai gratuit 1 jour", "Discord requis uniquement pour l'essai", "Acces complet Fima Macro", "Updates incluses"] },
          "3days": { name: "3 Jours", duration: "3 jours d'acces", badge: "Starter", features: ["Prix beta bas", "Discord et Roblox non requis", "Acces complet Fima Macro", "Updates incluses"] },
          "monthly": { name: "Mensuel", duration: "Renouvellement mensuel", badge: "Populaire", features: ["EUR 4.99/mois", "Annulation possible", "Acces actif jusqu'a la fin de periode", "Acces complet Fima Macro"] },
          lifetime: { name: "Lifetime", duration: "Licence \u00e0 vie", badge: "Prix fixe", features: ["Payer une fois, utiliser toujours", "Acc\u00e8s complet Fima Macro", "Futures updates incluses", "Support prioritaire", "Licence \u00e0 vie", "Meilleure valeur long terme"] }
        }
      },
      checkout: { eyebrow: "Checkout s\u00e9curis\u00e9", title: "Connecte-toi d'abord", description: "Ta licence a besoin d'un compte. Connecte-toi ou inscris-toi avant d'acheter.", loginFirstTitle: "Connecte-toi d'abord", loginFirstBody: "Ta licence a besoin d'un compte. Connecte-toi ou inscris-toi avant d'acheter.", loginButton: "Connexion", registerButton: "S'inscrire", emailLabel: "Adresse e-mail", cancel: "Annuler", continue: "Continuer vers Stripe", loading: "Cr\u00e9ation du checkout...", invalidEmail: "Entre une adresse e-mail valide.", failed: "Impossible de d\u00e9marrer le checkout. R\u00e9essaie dans un instant.", backendMissing: "Le paiement n'est pas joignable pour l'instant. R\u00e9essaie dans un instant." },
      download: { eyebrow: "Download", title: "Telecharge le setup actuel.", description: "Installe Fima Macro, puis utilise ta cle de licence ou ton free trial dans l'app.", primaryCta: "Telecharger Fima Macro", secondaryCta: "Aide setup", latest: "Derni\u00e8re version", versionFallback: "V\u00e9rification du manifest", versionUnavailable: "latest.json introuvable", platform: "Plateforme", updater: "Auto updater", updaterValue: "Support\u00e9", support: "Support" },
      dashboard: { eyebrow: "Aper\u00e7u dashboard", title: "La gestion des licences arrivera ici apr\u00e8s backend.", description: "Placeholder pour login licence, plan, expiration, reset HWID, downloads et support.", inputLabel: "Cl\u00e9 de licence", button: "Syst\u00e8me de licence bient\u00f4t", plan: "Plan", planValue: "Backend requis", hwid: "HWID", hwidValue: "Resets pr\u00e9vus", access: "Acc\u00e8s download", accessValue: "Connect\u00e9 apr\u00e8s login" },
      faq: {
        title: "Questions fr\u00e9quentes avant achat.",
        description: "R\u00e9ponses courtes sur acc\u00e8s, updates, licences, remboursements et sortie de SellAuth.",
        items: [
          ["Qu'est-ce que Fima Macro ?", "Une app macro premium pour timing propre, profils keybind, setup ping-aware et scaling r\u00e9solution/sensibilit\u00e9."],
          ["Achat unique ou abonnement ?", "3 jours et Lifetime sont uniques; Monthly est un abonnement annulable; l'essai gratuit dure 1 jour."],
          ["Les updates sont incluses ?", "Oui, pendant la p\u00e9riode active; lifetime inclut les futures updates."],
          ["Puis-je changer de PC ?", "Le syst\u00e8me pr\u00e9vu utilise HWID lock avec demandes de reset via support/dashboard."],
          ["Que se passe-t-il \u00e0 expiration ?", "L'app ne se d\u00e9verrouille plus jusqu'au renouvellement ou extension."],
          ["Remboursements ?", "Produit digital: remboursements limit\u00e9s apr\u00e8s livraison d'acc\u00e8s/licence. Contacte le support en cas de probl\u00e8me."],
          ["Comment obtenir du support ?", "Discord sera le canal principal, avec e-mail pour compte ou paiement."],
          ["SellAuth est utilis\u00e9 ?", "Non. Cette site pr\u00e9pare le domaine, checkout et syst\u00e8me licence propres \u00e0 Fima Macro."],
          ["Quels paiements seront support\u00e9s ?", "Stripe Checkout et PayPal sont pr\u00e9vus pour le backend."],
          ["Diff\u00e9rentes sensibilit\u00e9s et r\u00e9solutions ?", "Le syst\u00e8me vise le scaling des valeurs de base vers le setup r\u00e9el."]
        ]
      },
      support: { eyebrow: "Support", title: "Besoin d'aide setup ou d'updates checkout ?", description: "Discord sera l'endroit le plus rapide pour setup, licence et annonces.", discord: "Rejoindre Discord", contact: "Contacter support" },
      legal: { termsTitle: "Conditions d'utilisation", termsText: "L'utilisation de Fima Macro sera r\u00e9gie par les conditions finales publi\u00e9es avec le backend.", privacyTitle: "Confidentialit\u00e9", privacyText: "Ce site statique stocke th\u00e8me, langue et devise localement. La d\u00e9tection pays sert seulement aux defaults.", refundTitle: "Politique de remboursement", refundText: "Produit digital: remboursements limit\u00e9s apr\u00e8s livraison d'acc\u00e8s/licence. Contacte le support en cas de probl\u00e8me." },
      footer: { disclaimer: "Fima Macro n'est pas affili\u00e9, approuv\u00e9 ou sponsoris\u00e9 par Roblox Corporation.", terms: "Conditions", privacy: "Confidentialit\u00e9", refund: "Remboursement", contact: "Contact" }
    },
    bs: {
      accessibility: { skip: "Idi na sadr\u017eaj", menu: "Otvori meni" },
      controls: { theme: "Tema", language: "Jezik", currency: "Valuta" },
      nav: { home: "Po\u010detna", macros: "Macroi", features: "Funkcije", pricing: "Cijene", download: "Preuzmi", faq: "FAQ", support: "Podr\u0161ka", dashboard: "Nalog", cta: "Kupi" },
      hero: {
        eyebrow: "Fima Macro za TSBG",
        title: "Precizni macroi prilago\u0111eni tvom setupu.",
        description: "Fima Macro spaja \u010disto timing pona\u0161anje, profile prilago\u0111ene pingu, scaling rezolucije i vrijednosti po sensitivtyju za gla\u0111e izvo\u0111enje u TSBG.",
        primaryCta: "Uzmi Fima Macro",
        secondaryCta: "Pridru\u017ei se Discordu",
        floatOneLabel: "Licenca",
        floatTwoLabel: "Updater",
        stats: [["20+", "Macroa"], ["Ping", "Adaptivan"], ["Ekran", "Scaling"], ["Auto", "Updates"], ["HWID", "Licenca"], ["Siguran", "Checkout spreman"]]
      },
      mockup: { realPreview: "Pravi preview app po\u010detne", profiles: "Profili", activeMacro: "Aktivni macro", ready: "Spremno", ping: "Ping", resolution: "Rezolucija", sensitivity: "Sensitivity", scaleTitle: "Setup scaling", scaleText: "Timing i vrijednosti pokreta prilago\u0111avaju se od baznog profila prema ekranu i sensitivityju." },
      macros: { eyebrow: "Macro biblioteka", title: "Brz pristup techovima koje igra\u010di stvarno koriste.", description: "Svaka kartica je \u010dist profil za keybind aktivaciju i budu\u0107u licenciranu isporuku.", descriptions: ["Optimizovan timing pokreta za \u010di\u0161\u0107u aktivaciju.", "Gra\u0111eno s podr\u0161kom za sensitivity i screen scaling.", "Dizajnirano za brzu keybind aktivaciju tokom pokreta.", "Strukturirano za stabilniji timing kroz razli\u010dit ping.", "Spremno za pode\u0161avanje profila bez komplikovanog setupa.", "Fokusiran tech profil za gla\u0111e ponavljanje."] },
      features: {
        eyebrow: "Glavni sistem",
        title: "Napravljeno da prilagodi timing i pokrete tvom setupu.",
        description: "Fima Macro je strukturiran oko pinga, rezolucije i sensitivityja da profili ostanu konzistentni.",
        items: [
          ["Timing po pingu", "Profili se mogu pode\u0161avati prema mre\u017enom ka\u0161njenju."],
          ["Scaling rezolucije", "Vrijednosti pokreta mogu skalirati iz 2560x1440 baze na trenutni ekran."],
          ["Scaling sensitivityja", "Macro vrijednosti mogu se prilagoditi iz baze kao 1.2 na stvarni setup."],
          ["No shiftlock podr\u0161ka", "Odre\u0111eni techovi mogu imati logiku pogodnu za no-shiftlock."],
          ["Auto update sistem", "Sajt \u010duva downloads putanju i mo\u017ee \u010ditati latest.json."],
          ["\u010cist keybind sistem", "Profili su napravljeni za jasnu aktivaciju i brzo ure\u0111ivanje."],
          ["Macro profili", "Svaki tech mo\u017ee biti poseban profil za budu\u0107i account sync."],
          ["Discord podr\u0161ka", "Podr\u0161ka i release notes ostaju blizu zajednici."],
          ["HWID license lock", "Spremno za licencu vezanu za ure\u0111aj i kontrolisane reset zahtjeve."],
          ["Lagana aplikacija", "Fokusiran tool bez nepotrebnog pozadinskog nereda."],
          ["Jednostavan setup", "Sajt obja\u0161njava proces bez la\u017enog backend pona\u0161anja."],
          ["Moderan UI", "Tamno, kompaktno i napravljeno za svakodnevnu upotrebu."],
          ["Vi\u0161ejezi\u010dni website", "Jezi\u010dki podaci su spremni za lako pro\u0161irenje."],
          ["Tema po izboru", "Odabrana tema ostaje sa\u010duvana preko localStorage."],
          ["Auto valuta", "Default po dr\u017eavi po\u0161tuje ru\u010dni izbor korisnika."]
        ]
      },
      pricing: {
        eyebrow: "Cijene",
        title: "Odaberi pristup koji ti odgovara.",
        description: "Beta cijene su jednostavne i jasno prikazane; Stripe Checkout naplacuje u EUR.",
        note: "Nakon Stripe placanja, licenca se prikazuje direktno na success stranici.",
        buy: "Kupi",
        accessPass: "Access pass",
        saleEnds: "Beta pristup",
        saleBannerTitle: "Jednostavne beta cijene",
        saleBannerText: "Trenutni proizvodi su Free Trial, 3 Dana, Monthly i Lifetime.",
        saleCountdown: "Azurirano",
        plans: {
          "1day": { name: "Free Trial", duration: "1 dan besplatne probe", badge: "Discord potreban", features: ["1 dan besplatne probe", "Discord je potreban samo za trial", "Pun Fima Macro pristup", "Updates uklju\u010deni"] },
          "3days": { name: "3 Dana", duration: "3 dana pristupa", badge: "Starter", features: ["Niska beta cijena", "Discord i Roblox nisu obavezni", "Pun Fima Macro pristup", "Updates ukljuceni"] },
          "monthly": { name: "Monthly", duration: "Mjesecna pretplata", badge: "Popularno", features: ["EUR 4.99/mjesec", "Otkazi obnovu bilo kada", "Pristup ostaje do kraja perioda", "Pun Fima Macro pristup"] },
          lifetime: { name: "Lifetime", duration: "Do\u017eivotna licenca", badge: "Fiksna cijena", features: ["Plati jednom, koristi zauvijek", "Pun Fima Macro pristup", "Budu\u0107i updates uklju\u010deni", "Prioritetna podr\u0161ka", "Do\u017eivotna licenca", "Najbolja dugoro\u010dna vrijednost"] }
        }
      },
      checkout: { eyebrow: "Siguran checkout", title: "Prvo se prijavi", description: "Licenca mora biti vezana za account. Prijavi se ili registruj prije kupovine.", loginFirstTitle: "Prvo se prijavi", loginFirstBody: "Licenca mora biti vezana za account. Prijavi se ili registruj prije kupovine.", loginButton: "Login", registerButton: "Register", emailLabel: "E-mail adresa", cancel: "Otkaži", continue: "Nastavi na Stripe", loading: "Kreiranje checkouta...", invalidEmail: "Unesi validnu e-mail adresu.", failed: "Checkout nije mogao biti pokrenut. Pokušaj ponovo za trenutak.", backendMissing: "Payment trenutno nije dostupan. Pokušaj ponovo za trenutak." },
      download: { eyebrow: "Download", title: "Preuzmi trenutni setup.", description: "Instaliraj Fima Macro, zatim koristi license key ili free trial u appu.", primaryCta: "Preuzmi Fima Macro", secondaryCta: "Setup pomo\u0107", latest: "Zadnja verzija", versionFallback: "Provjera manifesta", versionUnavailable: "latest.json nije prona\u0111en", platform: "Platforma", updater: "Auto updater", updaterValue: "Podr\u017eano", support: "Podr\u0161ka" },
      dashboard: { eyebrow: "Dashboard preview", title: "Upravljanje licencom dolazi ovdje nakon backend integracije.", description: "Placeholder pokazuje smjer: login licencom, plan, istek, HWID reset, download i support linkovi.", inputLabel: "License key", button: "License sistem uskoro", plan: "Plan", planValue: "Backend potreban", hwid: "HWID", hwidValue: "Reset zahtjevi planirani", access: "Download pristup", accessValue: "Povezano nakon logina" },
      faq: {
        title: "\u010cesta pitanja prije kupovine.",
        description: "Kratki odgovori o pristupu, updateima, licencama, refundu i napu\u0161tanju SellAuth-a.",
        items: [
          ["\u0160ta je Fima Macro?", "Premium macro app za \u010disto timing pona\u0161anje, keybind profile, ping-aware setup i scaling rezolucije/sensitivityja."],
          ["Jednokratna kupovina ili pretplata?", "3 dana i Lifetime su jednokratni; Monthly je pretplata koju mozes otkazati; free trial traje 1 dan."],
          ["Da li dobijam updates?", "Da. Aktivne licence uklju\u010duju updates tokom pristupa, lifetime uklju\u010duje budu\u0107e updates."],
          ["Mogu li promijeniti PC?", "Planiran je HWID lock sa reset zahtjevima kroz support ili dashboard."],
          ["\u0160ta kad licenca istekne?", "App se ne\u0107e otklju\u010dati dok se licenca ne obnovi ili produ\u017ei."],
          ["Da li nudite refund?", "Zbog digitalne prirode proizvoda refund mo\u017ee biti ograni\u010den nakon isporuke pristupa/licence. Kontaktiraj support ako ima\u0161 problem."],
          ["Kako dobijam podr\u0161ku?", "Discord \u0107e biti glavni kanal, e-mail za account ili billing pitanja."],
          ["Da li se koristi SellAuth?", "Ne. Ovaj sajt je pripremljen za vlastiti domain, checkout i license sistem."],
          ["Koje metode pla\u0107anja dolaze?", "Stripe Checkout i PayPal planirani su za backend fazu."],
          ["Podr\u017eava li app razli\u010dite sensitivity i rezolucije?", "Sistem je usmjeren na scaling iz baznih vrijednosti prema stvarnom setupu."]
        ]
      },
      support: { eyebrow: "Podr\u0161ka", title: "Treba ti setup pomo\u0107 ili checkout info?", description: "Discord \u0107e biti najbr\u017ee mjesto za setup pitanja, license pomo\u0107 i release najave.", discord: "Pridru\u017ei se Discordu", contact: "Kontaktiraj podr\u0161ku" },
      legal: { termsTitle: "Uslovi kori\u0161tenja", termsText: "Kori\u0161tenje Fima Macro bit \u0107e regulisano finalnim uslovima objavljenim sa checkout i license backendom.", privacyTitle: "Privatnost", privacyText: "Ovaj stati\u010dni sajt \u010duva temu, jezik i valutu lokalno u browseru. Detekcija dr\u017eave slu\u017ei samo za default.", refundTitle: "Refund politika", refundText: "Zbog digitalne prirode proizvoda refund mo\u017ee biti ograni\u010den nakon isporuke pristupa/licence. Kontaktiraj support ako ima\u0161 problem." },
      footer: { disclaimer: "Fima Macro nije povezan, odobren ili sponzorisan od Roblox Corporation.", terms: "Uslovi kori\u0161tenja", privacy: "Privatnost", refund: "Refund", contact: "Kontakt" }
    }
  };

  const state = {
    language: "en",
    currency: "USD",
    trialPromo: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const isKnownLanguage = (language) => languageOptions.some(([code]) => code === language);
  const currencyDisplayName = (code) => {
    if (currencyNameOverrides[code]) return currencyNameOverrides[code];
    try {
      return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) || code;
    } catch {
      return code;
    }
  };
  const normalizeSearchText = (value = "") =>
    String(value)
      .toLowerCase()
      .replace(/\u20ba/g, " try tl lira ")
      .replace(/\u20ac/g, " eur euro avro ")
      .replace(/\u00a3/g, " gbp pound sterlin ")
      .replace(/\u00a5/g, " jpy yen ")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u0131/g, "i")
      .trim();
  const currencyMetadata = currencyOptions.map((code) => {
    const symbol = currencySymbolOverrides[code] || code;
    const name = currencyDisplayName(code);
    const aliases = currencyAliasOverrides[code] || [];
    const search = normalizeSearchText([code, symbol, name, ...aliases].join(" "));
    return {
      code,
      symbol,
      name,
      aliases,
      search,
      shortLabel: `${symbol} ${code}`,
      menuLabel: `${symbol} ${code} \u2014 ${name}`
    };
  });
  const currencyMetaByCode = Object.fromEntries(currencyMetadata.map((item) => [item.code, item]));

  const populateSelectOptions = () => {
    const languageSelect = $("#languageSelect");
    const languageMenu = document.querySelector('[data-custom-select="languageSelect"] [data-select-menu]');
    if (languageSelect && languageMenu) {
      languageSelect.innerHTML = languageOptions
        .map(([code, label]) => `<option value="${code}">${label}</option>`)
        .join("");
      languageMenu.innerHTML = languageOptions
        .map(([code, label]) => `<button type="button" role="option" data-value="${code}">${label}</button>`)
        .join("");
    }

    const currencySelect = $("#currencySelect");
    const currencyMenu = document.querySelector('[data-custom-select="currencySelect"] [data-select-menu]');
    if (currencySelect && currencyMenu) {
      currencySelect.innerHTML = currencyOptions
        .map((code) => `<option value="${code}">${escapeHtml(currencyMetaByCode[code]?.shortLabel || code)}</option>`)
        .join("");
      currencyMenu.innerHTML = `
        <label class="select-search">
          <span class="sr-only">Search currency</span>
          <input type="search" autocomplete="off" spellcheck="false" placeholder="Search by code, symbol, or name..." data-select-search>
        </label>
        <div class="select-options" data-select-options>
          ${currencyMetadata.map((item) => `<button type="button" role="option" data-value="${item.code}" data-search="${escapeHtml(item.search)}">${escapeHtml(item.menuLabel)}</button>`).join("")}
        </div>
        <p class="select-empty" data-select-empty hidden>No currencies found</p>
      `;
    }
  };

  const getCopy = () => copy[state.language] || copy.en;

  const pageSections = {
    home: ["home", "app-preview"],
    macros: ["macros"],
    features: ["features"],
    pricing: ["pricing"],
    download: ["download"],
    faq: ["faq"],
    support: ["support"],
    security: ["security"],
    dashboard: ["dashboard"],
    legal: ["legal"]
  };

  const pageFromPath = () => {
    const file = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (file === "" || file === "index.html") return "home";
    return file.replace(/\.html$/, "") || "home";
  };

  const applyPageMode = () => {
    const page = document.body.dataset.page || pageFromPath();
    const visibleSections = new Set(pageSections[page] || pageSections.home);
    document.body.dataset.page = pageSections[page] ? page : "home";
    document.body.classList.add("page-mode");

    $$("main > section").forEach((section) => {
      const isVisible = visibleSections.has(section.id);
      section.classList.toggle("page-section-hidden", !isVisible);
      section.setAttribute("aria-hidden", String(!isVisible));
    });

    $$("[data-page-link]").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.pageLink === document.body.dataset.page);
    });
  };

  const readPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

  const escapeHtml = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[char]
    ));

  const setText = () => {
    const activeCopy = getCopy();
    document.documentElement.lang = state.language;
    $$("[data-i18n]").forEach((node) => {
      const value = readPath(activeCopy, node.dataset.i18n) ?? readPath(copy.en, node.dataset.i18n);
      if (typeof value === "string") {
        node.textContent = value;
      }
    });
    renderStats();
    renderMacros();
    renderShowcase();
    renderUpcoming();
    renderUiTour();
    renderFeatures();
    renderPricing();
    renderHomeTrialPromoBanner();
    renderFaq();
    hydrateLatestVersion();
    renderSiteAccountNav(currentSiteAccount);
  };

  const formatPrice = (eur) => {
    const currency = rates[state.currency] ? state.currency : "USD";
    const value = eur * (rates[currency] || fallbackRates[currency] || 1);
    const locale = { EUR: "de-DE", USD: "en-US", TRY: "tr-TR", GBP: "en-GB" }[currency] || "en-US";

    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: currency === "TRY" ? 0 : 2,
        maximumFractionDigits: currency === "TRY" ? 0 : 2
      }).format(value);
    } catch (error) {
      if (currency === "TRY") {
        return `${symbols.TRY}${Math.round(value).toLocaleString("tr-TR")}`;
      }
      return `${currencySymbolOverrides[currency] || symbols[currency] || ""}${value.toFixed(2)}`;
    }
  };

  const formatCountdown = (targetDate) => {
    const total = Math.max(0, Math.floor((targetDate.getTime() - Date.now()) / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  const trialPromoActive = () => Boolean(state.trialPromo?.active && state.trialPromo?.endAt);
  const trialPromoDays = () => Number(state.trialPromo?.promoDays || state.trialPromo?.days || 7);
  const trialPromoLabel = () => trialPromoActive() ? `${trialPromoDays()}-Day Free Trial` : "Free Trial";
  const trialPromoDuration = () => trialPromoActive() ? `${trialPromoDays()} days free trial access` : "Free trial access";
  const trialPromoCountdown = () => {
    const endAt = state.trialPromo?.endAt ? new Date(state.trialPromo.endAt) : null;
    return endAt && Number.isFinite(endAt.getTime()) ? formatCountdown(endAt) : "";
  };

  const renderStats = () => {
    const target = $("#heroStats");
    if (!target) return;
    target.innerHTML = getCopy().hero.stats
      .map(([value, label]) => `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`)
      .join("");
  };

  const renderMacros = () => {
    const target = $("#macroGrid");
    if (!target) return;
    const descriptions = getCopy().macros.descriptions;
    target.innerHTML = macroNames
      .map((name, index) => {
        const number = String(index + 1).padStart(2, "0");
        const description = descriptions[index % descriptions.length];
        return `<article class="macro-card"><span class="card-index">${number}</span><h3>${name}</h3><p>${description}</p></article>`;
      })
      .join("");
  };

  const switchMacroVideo = (video, source, sourceUrl) => {
    const token = ++macroVideoSwitchToken;
    video.removeAttribute("poster");
    video.classList.add("is-switching");

    const preloader = document.createElement("video");
    preloader.muted = true;
    preloader.playsInline = true;
    preloader.preload = "auto";

    let committed = false;
    const commit = () => {
      if (committed || token !== macroVideoSwitchToken) return;
      committed = true;
      source.src = sourceUrl;
      video.load();

      let revealed = false;
      const reveal = () => {
        if (revealed || token !== macroVideoSwitchToken) return;
        revealed = true;
        video.play().catch(() => {});
        window.setTimeout(() => video.classList.remove("is-switching"), 140);
      };

      video.addEventListener("canplay", reveal, { once: true });
      window.setTimeout(reveal, 900);
    };

    preloader.addEventListener("canplay", commit, { once: true });
    preloader.addEventListener("error", commit, { once: true });
    preloader.src = sourceUrl;
    preloader.load();
  };

  const renderShowcase = () => {
    const list = $("#macroVideoList");
    const video = $("#macroVideo");
    const source = $("#macroVideoSource");
    const title = $("#macroVideoTitle");
    const description = $("#macroVideoDescription");
    const meta = $("#macroVideoMeta");
    if (!list || !video || !source || !title || !description || !meta) return;

    const active = macroVideos.find((item) => item.id === selectedMacroVideo) || macroVideos[0] || macroVideoFallback[0];
    selectedMacroVideo = active.id;

    const sourceUrl = `assets/videos/${active.file}?v=20260605-1`;
    if (!source.src.includes(active.file)) {
      switchMacroVideo(video, source, sourceUrl);
    }

    title.textContent = active.name;
    description.textContent = active.description;
    meta.textContent = active.meta || `${active.name} preview`;
    list.innerHTML = macroVideos
      .map((item) => `
        <button class="${item.id === selectedMacroVideo ? "is-active" : ""}" type="button" data-video-id="${escapeHtml(item.id)}">
          ${escapeHtml(item.name)}
        </button>
      `)
      .join("");
  };

  const hydrateMacroVideos = async () => {
    try {
      const response = await fetch("assets/videos/macro-videos.json?v=20260605-1", { cache: "no-store" });
      if (!response.ok) return;
      const manifest = await response.json();
      const videos = Array.isArray(manifest.videos)
        ? manifest.videos.filter((item) => item?.id && item?.name && item?.file)
        : [];
      if (!videos.length) return;
      macroVideos = videos.map((item) => ({
        id: item.id,
        name: item.name,
        file: item.file,
        description: item.description || "Macro execution preview loaded from the public video manifest.",
        meta: item.meta || `${item.name} preview`
      }));
      if (!macroVideos.some((item) => item.id === selectedMacroVideo)) {
        selectedMacroVideo = macroVideos[0].id;
      }
      renderShowcase();
    } catch (error) {
      console.warn("Macro video manifest unavailable", error);
    }
  };

  const initMacroVideoGallery = () => {
    const list = $("#macroVideoList");
    if (!list) return;
    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-video-id]");
      if (!button) return;
      selectedMacroVideo = button.dataset.videoId;
      renderShowcase();
    });
  };

  const renderUpcoming = () => {
    const target = $("#upcomingGrid");
    if (!target) return;
    const upcomingCopy = getCopy().upcoming || copy.en.upcoming;
    target.innerHTML = upcomingCopy.items
      .map(([name, description]) => `
        <article class="upcoming-card">
          <span>${upcomingCopy.status}</span>
          <h3>${name}</h3>
          <p>${description}</p>
        </article>
      `)
      .join("");
  };

  const renderUiTour = () => {
    const controls = $("#uiTourControls");
    const image = $("#uiTourImage");
    const title = $("#uiTourTitle");
    const description = $("#uiTourDescription");
    if (!controls || !image || !title || !description) return;

    const tourCopy = getCopy().tour || copy.en.tour;
    controls.innerHTML = uiTourViews
      .map((view) => {
        const data = tourCopy.views[view.id] || copy.en.tour.views[view.id];
        return `<button class="${view.id === activeTourView ? "is-active" : ""}" type="button" data-ui-view="${view.id}">${data.label}</button>`;
      })
      .join("");

    const active = uiTourViews.find((view) => view.id === activeTourView) || uiTourViews[0];
    const data = tourCopy.views[active.id] || copy.en.tour.views[active.id];
    title.textContent = data.title;
    description.textContent = data.description;
    if (!image.src.includes(active.image)) {
      const token = ++tourImageSwitchToken;
      image.classList.add("is-switching");
      const loader = new Image();
      const swap = () => {
        if (token !== tourImageSwitchToken) return;
        image.src = active.image;
        image.alt = `${data.title} screenshot`;
        window.setTimeout(() => {
          if (token === tourImageSwitchToken) image.classList.remove("is-switching");
        }, 140);
      };
      loader.onload = () => window.setTimeout(swap, 380);
      loader.onerror = () => window.setTimeout(swap, 380);
      loader.src = active.image;
    } else {
      image.alt = `${data.title} screenshot`;
    }
  };

  const renderFeatures = () => {
    const target = $("#featureGrid");
    if (!target) return;
    target.innerHTML = getCopy().features.items
      .map(([title, description], index) => {
        const label = String(index + 1).padStart(2, "0");
        return `<article class="feature-card"><span class="feature-icon">${label}</span><div><h3>${title}</h3><p>${description}</p></div></article>`;
      })
      .join("");
  };

  const renderHomeTrialPromoBanner = () => {
    const host = document.querySelector(".hero-copy");
    if (!host) return;
    let banner = $("#homeTrialPromoBanner");
    if (!trialPromoActive()) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("article");
      banner.id = "homeTrialPromoBanner";
      banner.className = "trial-promo-card home-trial-promo-card";
      const anchor = host.querySelector(".hero-actions");
      if (anchor) {
        anchor.insertAdjacentElement("afterend", banner);
      } else {
        host.appendChild(banner);
      }
    }
    banner.innerHTML = `
      <div>
        <span>Limited beta offer</span>
        <strong>Free trials are now ${trialPromoDays()} days for the next week.</strong>
        <p>One promotional trial per account during this event.</p>
      </div>
      <div class="trial-promo-actions">
        <b data-trial-promo-countdown>${trialPromoCountdown()}</b>
        <a class="button primary" href="dashboard.html#monthly-trial" data-trial-claim-link>Claim ${trialPromoLabel()}</a>
      </div>
    `;
  };

  const renderPricing = () => {
    const target = $("#pricingGrid");
    if (!target) return;
    const pricingCopy = getCopy().pricing;
    const fallbackPricing = copy.en.pricing;
    const saleActive = isLaunchSaleActive();
    const giftRecipient = selectedGiftRecipientForCheckout();
    const giftName = giftRecipient?.name || giftRecipient?.maskedEmail || "";
    const saleBanner = saleActive ? `
      <article class="sale-campaign-card">
        <div>
          <span>${pricingCopy.saleBannerTitle || fallbackPricing.saleBannerTitle}</span>
          <strong>${pricingCopy.saleEnds || fallbackPricing.saleEnds}</strong>
          <p>${pricingCopy.saleBannerText || fallbackPricing.saleBannerText}</p>
        </div>
        <div class="sale-campaign-clock">
          <span>${pricingCopy.saleCountdown || fallbackPricing.saleCountdown}</span>
          <b data-pricing-countdown>${formatCountdown(saleEndsAt)}</b>
        </div>
      </article>
    ` : "";
    const promoBanner = trialPromoActive() ? `
      <article class="trial-promo-card">
        <div>
          <span>Limited beta offer</span>
          <strong>Free trials are now ${trialPromoDays()} days for the next week.</strong>
          <p>One promotional trial per account during this event.</p>
        </div>
        <div class="trial-promo-actions">
          <b data-trial-promo-countdown>${trialPromoCountdown()}</b>
          <a class="button primary" href="dashboard.html#monthly-trial" data-trial-claim-link>Claim ${trialPromoLabel()}</a>
        </div>
      </article>
    ` : "";
    const accountPrompt = currentSiteAccount ? `
      <article class="pricing-account-prompt">
        <strong>${giftRecipient?.id
          ? (state.language === "tr" ? `${escapeHtml(giftName)} i\u00e7in hediye checkout haz\u0131r.` : `Gift checkout ready for ${escapeHtml(giftName)}.`)
          : (state.language === "tr" ? "Hesab\u0131n ba\u011fl\u0131. Sat\u0131n ald\u0131\u011f\u0131n lisanslar My Products i\u00e7inde kal\u0131r." : "Your account is connected. Purchases stay in My Products.")}
        </strong>
        <div>
          <a href="dashboard.html">${siteAccountLabel()}</a>
          <a href="my-products.html">My Products</a>
        </div>
      </article>
    ` : `
      <article class="pricing-account-prompt">
        <strong>${pricingCopy.accountPrompt || fallbackPricing.accountPrompt}</strong>
        <div>
          <a href="login.html">${copy[state.language]?.nav?.dashboard === "Panel" ? "Login" : "Login"}</a>
          <a href="register.html">${state.language === "tr" ? "Register" : "Register"}</a>
        </div>
      </article>
    `;
    target.innerHTML = promoBanner + saleBanner + accountPrompt + basePlans
      .map((plan, index) => {
        const data = { ...(pricingCopy.plans[plan.id] || fallbackPricing.plans[plan.id]) };
        if (plan.trial) {
          data.name = trialPromoLabel();
          data.duration = trialPromoDuration();
          data.features = trialPromoActive()
            ? [`${trialPromoDays()} days free trial`, "Discord link required only for trial", "Full Fima Macro access", "Updates included"]
            : ["Free trial", "Discord link required only for trial", "Full Fima Macro access", "Updates included"];
        }
        const badge = data.badge ? `<span class="price-badge">${data.badge}</span>` : "";
        const features = data.features.map((feature) => `<li>${feature}</li>`).join("");
        const litCount = Math.min(4, index + 1);
        const accessLine = Array.from({ length: 4 }, (_, itemIndex) => `<span class="${itemIndex < litCount ? "is-lit" : ""}"></span>`).join("");
        const saleIsActive = plan.sale && saleActive;
        const finalPrice = saleIsActive ? plan.salePrice : plan.basePrice;
        const compareLine = plan.compareAt
          ? `<span class="price-compare" aria-label="${pricingCopy.oldPrice || fallbackPricing.oldPrice}">${formatPrice(plan.compareAt)}</span>`
          : (saleIsActive ? `<span class="price-compare" aria-label="${pricingCopy.oldPrice || fallbackPricing.oldPrice}">${formatPrice(plan.basePrice)}</span>` : "");
        const discountBadge = saleIsActive ? `<span class="price-discount-badge">${pricingCopy.offBadge || fallbackPricing.offBadge}</span>` : "";
        const fixedLine = plan.id === "lifetime"
          ? `<span class="price-fixed">${pricingCopy.fixedPrice || fallbackPricing.fixedPrice}</span>`
          : (plan.subscription ? `<span class="price-fixed">Subscription - cancel anytime</span>` : "");
        const saleLine = saleIsActive ? `<span class="price-sale">${pricingCopy.saleEnds || fallbackPricing.saleEnds} - <b data-pricing-countdown>${formatCountdown(saleEndsAt)}</b></span>` : "";
        const planCode = {
          "1day": "FIMA-TRIAL",
          "3days": "FIMA-3D",
          "monthly": "FIMA-MONTHLY",
          lifetime: "FIMA-LIFE"
        }[plan.id];
        const cardButton = plan.trial
          ? `<a class="button ${plan.featured ? "primary" : "secondary"}" href="dashboard.html#monthly-trial" data-trial-claim-link>Claim ${trialPromoLabel()}</a>`
          : `<a class="button ${plan.featured ? "primary" : "secondary"}" href="#checkout" data-checkout-plan="${plan.id}">${pricingCopy.payCard || fallbackPricing.payCard}</a>`;
        const robuxButton = plan.trial ? "" : `<button class="button secondary robux-ticket-button" type="button" data-robux-plan="${plan.id}">${pricingCopy.payRobux || fallbackPricing.payRobux}</button>`;
        const giftIcon = `<svg class="gift-button-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M20 7h-2.2c.2-.5.3-1 .2-1.5A3 3 0 0 0 15 3c-1.4 0-2.4.8-3 1.8A3.5 3.5 0 0 0 9 3a3 3 0 0 0-3 2.5C5.9 6 6 6.5 6.2 7H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1Zm-5-2c.6 0 1 .4 1 1s-.4 1-1 1h-2c.2-.9.8-2 2-2ZM8 6c0-.6.4-1 1-1 1.2 0 1.8 1.1 2 2H9c-.6 0-1-.4-1-1Zm-4 7v7a1 1 0 0 0 1 1h6v-8H4Zm9 0v8h6a1 1 0 0 0 1-1v-7h-7Z"/></svg>`;
        const giftButton = plan.trial ? "" : `<a class="button secondary gift-code-button" href="#checkout" data-gift-code-checkout-plan="${plan.id}">${giftIcon}<span>${pricingCopy.buyGiftCode || fallbackPricing.buyGiftCode || "Buy Gift Code"}</span></a>`;
        const robuxBox = plan.trial ? "" : `
            <div class="robux-box" aria-label="Robux">
              <div>
                <span>${pricingCopy.robuxPremium || fallbackPricing.robuxPremium}</span>
                <strong>${plan.robuxPremium.toLocaleString("en-US")} Robux</strong>
              </div>
              <div>
                <span>${pricingCopy.robuxNoPremium || fallbackPricing.robuxNoPremium}</span>
                <strong>${plan.robuxNoPremium.toLocaleString("en-US")} Robux</strong>
              </div>
              <p>${pricingCopy.robuxNote || fallbackPricing.robuxNote}</p>
            </div>
        `;
        return `
          <article class="price-card ${plan.featured ? "featured" : ""} ${plan.id === "lifetime" ? "is-lifetime" : ""}">
            <div class="plan-head">
              <span class="plan-chip">${pricingCopy.accessPass}</span>
              <span class="plan-code">${planCode}</span>
            </div>
            ${discountBadge}
            ${badge}
            <span class="price-name">${data.name}</span>
            <div class="price-row">
              ${compareLine}
              <strong class="price-value" data-plan-price="${plan.id}">${formatPrice(finalPrice)}</strong>
            </div>
            ${fixedLine}
            ${saleLine}
            <span class="price-duration">${data.duration}</span>
            ${robuxBox}
            <div class="price-access-line" aria-hidden="true">${accessLine}</div>
            <ul class="price-features">${features}</ul>
            <div class="price-actions">
              ${cardButton}
              ${robuxButton}
              ${giftButton}
            </div>
          </article>
        `;
      })
      .join("");
  };

  const renderFaq = () => {
    const target = $("#faqList");
    if (!target) return;
    target.innerHTML = getCopy().faq.items
      .map(([question, answer], index) => `
        <details class="faq-item" ${index === 0 ? "open" : ""}>
          <summary>${question}</summary>
          <p>${answer}</p>
        </details>
      `)
      .join("");
  };

  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(storage.theme, theme);
    const select = $("#themeSelect");
    if (select) select.value = theme;
    syncCustomSelect("themeSelect");
  };

  const applyLanguage = (language, manual = false) => {
    state.language = isKnownLanguage(language) ? language : "en";
    localStorage.setItem(storage.language, state.language);
    if (manual) localStorage.setItem(storage.languageManual, "true");
    const select = $("#languageSelect");
    if (select) select.value = state.language;
    syncCustomSelect("languageSelect");
    setText();
  };

  const applyCurrency = (currency, manual = false) => {
    state.currency = rates[currency] || fallbackRates[currency] ? currency : "USD";
    localStorage.setItem(storage.currency, state.currency);
    if (manual) localStorage.setItem(storage.currencyManual, "true");
    const select = $("#currencySelect");
    if (select) select.value = state.currency;
    syncCustomSelect("currencySelect");
    renderPricing();
  };

  const syncCustomSelect = (selectId) => {
    const select = document.getElementById(selectId);
    if (!select) return;
    const wrapper = document.querySelector(`[data-custom-select="${selectId}"]`);
    if (!wrapper) return;
    const button = wrapper.querySelector("[data-select-button]");
    const selectedOption = select.options[select.selectedIndex];
    if (button && selectedOption) button.textContent = selectedOption.textContent;
    wrapper.querySelectorAll("[data-value]").forEach((option) => {
      option.setAttribute("aria-selected", String(option.dataset.value === select.value));
    });
  };

  const closeCustomSelects = (except) => {
    $$("[data-custom-select]").forEach((wrapper) => {
      if (wrapper === except) return;
      wrapper.classList.remove("is-open");
      wrapper.querySelector("[data-select-button]")?.setAttribute("aria-expanded", "false");
    });
  };

  const initCustomSelects = () => {
    $$("[data-custom-select]").forEach((wrapper) => {
      const selectId = wrapper.dataset.customSelect;
      const select = document.getElementById(selectId);
      const button = wrapper.querySelector("[data-select-button]");
      const menu = wrapper.querySelector("[data-select-menu]");
      if (!select || !button || !menu) return;
      const searchInput = menu.querySelector("[data-select-search]");
      const empty = menu.querySelector("[data-select-empty]");

      const visibleOptions = () => $$("[data-value]", menu).filter((option) => !option.hidden);
      const setHighlighted = (index) => {
        const options = visibleOptions();
        options.forEach((option) => option.classList.remove("is-highlighted"));
        if (!options.length) return;
        const normalizedIndex = Math.max(0, Math.min(index, options.length - 1));
        options[normalizedIndex].classList.add("is-highlighted");
        options[normalizedIndex].scrollIntoView({ block: "nearest" });
      };
      const filterOptions = () => {
        const query = normalizeSearchText(searchInput?.value || "");
        let visible = 0;
        $$("[data-value]", menu).forEach((option) => {
          const match = !query || normalizeSearchText(`${option.dataset.value || ""} ${option.textContent || ""} ${option.dataset.search || ""}`).includes(query);
          option.hidden = !match;
          if (match) visible += 1;
        });
        if (empty) empty.hidden = visible > 0;
        setHighlighted(0);
      };

      button.addEventListener("click", () => {
        const willOpen = !wrapper.classList.contains("is-open");
        closeCustomSelects(wrapper);
        wrapper.classList.toggle("is-open", willOpen);
        button.setAttribute("aria-expanded", String(willOpen));
        if (willOpen && searchInput) {
          searchInput.value = "";
          filterOptions();
          window.setTimeout(() => searchInput.focus(), 0);
        }
      });

      menu.addEventListener("click", (event) => {
        const option = event.target.closest("[data-value]");
        if (!option) return;
        select.value = option.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeCustomSelects();
      });

      if (searchInput) {
        searchInput.addEventListener("input", filterOptions);
        searchInput.addEventListener("keydown", (event) => {
          const options = visibleOptions();
          const current = Math.max(0, options.findIndex((option) => option.classList.contains("is-highlighted")));
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted(current + 1);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted(current - 1);
          } else if (event.key === "Enter") {
            const selected = options[current] || options[0];
            if (selected) {
              event.preventDefault();
              select.value = selected.dataset.value;
              select.dispatchEvent(new Event("change", { bubbles: true }));
              closeCustomSelects();
              button.focus();
            }
          } else if (event.key === "Escape") {
            closeCustomSelects();
            button.focus();
          }
        });
      }

      syncCustomSelect(selectId);
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("[data-custom-select]")) closeCustomSelects();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCustomSelects();
    });
  };

  const apiBase = String(window.FIMA_API_BASE_URL || "https://api.fimamacro.com").replace(/\/+$/, "");
  let publicSettings = {};
  let checkoutTimer;
  let selectedCheckoutPlan = null;
  let checkoutInFlight = false;

  const showCheckoutNotice = (message) => {
    const toast = $("#checkoutToast");
    if (!toast) return;
    toast.textContent = message || getCopy().checkout?.failed || copy.en.checkout.failed;
    toast.classList.add("is-visible");
    window.clearTimeout(checkoutTimer);
    checkoutTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 5200);
  };

  let accountPromise = null;
  let currentSiteAccount = null;

  const getCurrentAccount = async () => {
    if (!accountPromise) {
      accountPromise = fetchWithTimeout(`${apiBase}/api/auth/me`, {
        credentials: "include"
      }, 8000)
        .then(async (response) => {
          if (!response.ok) return null;
          const data = await response.json().catch(() => ({}));
          return data.user || null;
        })
        .catch(() => null);
    }
    return accountPromise;
  };

  const siteAccountLabel = () => ({
    tr: "Hesab\u0131m",
    de: "Account",
    fr: "Compte",
    bs: "Nalog",
    en: "Account"
  }[state.language] || "Account");

  const loginRegisterLabel = () => ({
    tr: "Login",
    de: "Login",
    fr: "Login",
    bs: "Login",
    en: "Login"
  }[state.language] || "Login");

  const siteProfileFor = (user) => {
    if (user?.robloxUsername) {
      return { label: user.robloxUsername, sub: "Roblox", avatar: user.robloxAvatarUrl || "", fallback: "R" };
    }
    if (user?.discordUsername) {
      return { label: user.discordUsername, sub: "Discord", avatar: user.discordAvatarUrl || "", fallback: "D" };
    }
    if (user?.email) {
      return { label: user.loginName || user.email.split("@")[0], sub: user.emailMasked || user.email, avatar: "", fallback: "F" };
    }
    return { label: "Fima", sub: "Account", avatar: "", fallback: "F" };
  };

  const siteProfileMenuItems = (user) => ([
    ["Account", "dashboard.html#overview", true],
    ["My Products", "my-products.html", true],
    ["Billing", "dashboard.html#billing", true],
    ["Redeem Key", "dashboard.html#gift-access", true],
    ["Gift Codes", "dashboard.html#purchased-gifts", true],
    ["Invite Code", "dashboard.html#referrals", true],
    ["Connected Accounts", "dashboard.html#connected-accounts", true],
    ["Security / Password", "dashboard.html#security", true],
    ["Downloads", "download.html", true],
    ["Support", "support.html", true],
    ["Admin Panel", "/admin", Boolean(user?.role === "admin" || user?.role === "owner" || user?.role === "super_admin")],
    ["Logout", "#logout", true]
  ]).filter((item) => item[2]);

  const wireSiteProfileDropdown = (menu) => {
    if (!menu || menu.dataset.wired === "1") return;
    menu.dataset.wired = "1";
    const toggle = menu.querySelector("[data-site-profile-toggle]");
    const panel = menu.querySelector("[data-site-profile-panel]");
    const setOpen = (open) => {
      if (!panel || !toggle) return;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    toggle?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(panel?.hidden);
    });
    panel?.addEventListener("click", async (event) => {
      const logout = event.target.closest("[data-site-logout]");
      if (!logout) return;
      event.preventDefault();
      await fetchWithTimeout(`${apiBase}/api/auth/logout`, { method: "POST", credentials: "include", headers: await csrfHeaders() }, 8000).catch(() => {});
      currentSiteAccount = null;
      location.href = "index.html";
    });
    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  };

  const renderSiteAccountNav = (user) => {
    const dashboardLink = document.querySelector('[data-page-link="dashboard"]');
    if (dashboardLink) {
      dashboardLink.href = user ? "dashboard.html" : "login.html";
      dashboardLink.textContent = user ? siteAccountLabel() : loginRegisterLabel();
    }

    const controls = $(".nav-controls");
    if (!controls) return;
    controls.querySelector("[data-site-profile]")?.remove();
    controls.querySelectorAll("[data-site-auth-link]").forEach((node) => node.remove());
    const cta = $(".nav-cta", controls);
    if (!user) {
      if (cta) {
        const login = document.createElement("a");
        login.className = "nav-auth-link";
        login.href = "login.html";
        login.dataset.siteAuthLink = "login";
        login.textContent = "Login";
        const register = document.createElement("a");
        register.className = "nav-auth-link nav-auth-register";
        register.href = "register.html";
        register.dataset.siteAuthLink = "register";
        register.textContent = "Register";
        controls.insertBefore(login, cta);
        controls.insertBefore(register, cta);
      }
      return;
    }

    const profile = siteProfileFor(user);
    const menu = document.createElement("div");
    menu.className = "site-profile-menu";
    menu.dataset.siteProfile = "true";
    const links = siteProfileMenuItems(user).map(([label, href]) => href === "#logout"
      ? `<button class="site-dropdown-link" type="button" data-site-logout>${escapeHtml(label)}</button>`
      : `<a class="site-dropdown-link" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`
    ).join("");
    menu.innerHTML = `
      <button class="site-profile-chip" type="button" data-site-profile-toggle aria-expanded="false" aria-label="${escapeHtml(profile.label)} menu">
        ${profile.avatar ? `<img src="${escapeHtml(profile.avatar)}" alt="">` : `<span>${escapeHtml(profile.fallback)}</span>`}
        <div><strong>${escapeHtml(profile.label)}</strong><small>${escapeHtml(profile.sub)}</small></div>
      </button>
      <div class="site-profile-dropdown" data-site-profile-panel hidden>
        <div class="site-profile-summary">
          ${profile.avatar ? `<img src="${escapeHtml(profile.avatar)}" alt="">` : `<span>${escapeHtml(profile.fallback)}</span>`}
          <div><strong>${escapeHtml(profile.label)}</strong><small>${escapeHtml(profile.sub)}</small></div>
        </div>
        ${links}
      </div>
    `;
    if (cta) {
      cta.textContent = user?.subscriptionStatus ? "Manage Plan" : (copy[state.language]?.nav?.cta || copy.en.nav.cta);
      cta.href = "pricing.html";
    }
    controls.insertBefore(menu, cta || null);
    wireSiteProfileDropdown(menu);
  };

  const hydrateSiteAccountNav = async () => {
    currentSiteAccount = await getCurrentAccount();
    renderSiteAccountNav(currentSiteAccount);
    renderPricing();
  };

  const selectedGiftRecipientForCheckout = () => {
    const params = new URLSearchParams(location.search);
    const urlRecipientId = params.get("giftRecipient") || "";
    let stored = null;
    try {
      stored = JSON.parse(sessionStorage.getItem("fima.giftRecipient") || "null");
    } catch {
      stored = null;
    }
    const id = urlRecipientId || stored?.id || "";
    if (!id) return null;
    return {
      id,
      maskedEmail: stored?.maskedEmail || "",
      name: stored?.roblox?.username || stored?.discord?.username || stored?.maskedEmail || "Fima user"
    };
  };

  const checkoutPayload = (planId, options = {}) => {
    const giftRecipient = selectedGiftRecipientForCheckout();
    return {
      plan: planId,
      currency: state.currency,
      language: state.language,
      ...(options.checkoutType ? { checkoutType: options.checkoutType } : {}),
      ...(giftRecipient?.id ? { giftRecipientUserId: giftRecipient.id } : {})
    };
  };

  const redirectToRegisterForCheckout = (planId, options = {}) => {
    const giftRecipient = selectedGiftRecipientForCheckout();
    const params = new URLSearchParams({ checkout: planId });
    if (giftRecipient?.id) params.set("giftRecipient", giftRecipient.id);
    if (options.checkoutType === "gift_code_purchase") params.set("giftCode", "1");
    const next = `pricing.html?${params.toString()}`;
    window.location.href = `register.html?next=${encodeURIComponent(next)}`;
  };

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

  const setCheckoutError = (message = "") => {
    const error = $("#checkoutError");
    if (error) error.textContent = message;
  };

  const setCheckoutLoading = (isLoading) => {
    const button = $("#checkoutSubmit");
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading
      ? (getCopy().checkout?.loading || copy.en.checkout.loading)
      : (getCopy().checkout?.continue || copy.en.checkout.continue);
  };

  const openCheckoutModal = (planId) => {
    const plan = basePlans.find((item) => item.id === planId);
    const modal = $("#checkoutModal");
    const emailInput = $("#checkoutEmail");
    if (!plan || !modal) return;
    selectedCheckoutPlan = plan.id;
    setCheckoutError("");
    setCheckoutLoading(false);
    if (emailInput) {
      emailInput.value = localStorage.getItem(storage.checkoutEmail) || "";
      window.setTimeout(() => emailInput.focus(), 40);
    }
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  const closeCheckoutModal = () => {
    const modal = $("#checkoutModal");
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  const checkoutNextUrl = (planId, options = {}) => {
    if (options.next) return options.next;
    const giftRecipient = selectedGiftRecipientForCheckout();
    const params = new URLSearchParams({ checkout: planId });
    if (giftRecipient?.id) params.set("giftRecipient", giftRecipient.id);
    if (options.checkoutType === "gift_code_purchase") params.set("giftCode", "1");
    return `pricing.html?${params.toString()}`;
  };

  const ensureLoginBeforeCheckoutModal = () => {
    let modal = $("#loginBeforeCheckoutModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "checkout-modal login-before-checkout-modal";
    modal.id = "loginBeforeCheckoutModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="loginBeforeCheckoutTitle">
        <button class="modal-close" type="button" data-login-checkout-close aria-label="Close">x</button>
        <p class="eyebrow" data-login-checkout-eyebrow></p>
        <h2 id="loginBeforeCheckoutTitle" data-login-checkout-title></h2>
        <p data-login-checkout-body></p>
        <div class="modal-actions">
          <a class="button secondary" href="login.html" data-login-checkout-login></a>
          <a class="button primary" href="register.html" data-login-checkout-register></a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  };

  const openLoginBeforeCheckoutModal = (planId, options = {}) => {
    const activeCopy = getCopy().checkout || copy.en.checkout;
    const modal = ensureLoginBeforeCheckoutModal();
    const next = checkoutNextUrl(planId, options);
    const loginHref = `login.html?next=${encodeURIComponent(next)}`;
    const registerHref = `register.html?next=${encodeURIComponent(next)}`;
    const title = activeCopy.loginFirstTitle || copy.en.checkout.loginFirstTitle || "Log in first";
    $("[data-login-checkout-eyebrow]", modal).textContent = activeCopy.eyebrow || copy.en.checkout.eyebrow;
    $("[data-login-checkout-title]", modal).textContent = title;
    $("[data-login-checkout-body]", modal).textContent = activeCopy.loginFirstBody || copy.en.checkout.loginFirstBody || copy.en.checkout.description;
    const login = $("[data-login-checkout-login]", modal);
    const register = $("[data-login-checkout-register]", modal);
    if (login) {
      login.href = loginHref;
      login.textContent = activeCopy.loginButton || copy.en.checkout.loginButton || "Log in";
    }
    if (register) {
      register.href = registerHref;
      register.textContent = activeCopy.registerButton || copy.en.checkout.registerButton || "Register";
    }
    if (options.trialClaim) {
      $("[data-login-checkout-title]", modal).textContent = "Log in first";
      $("[data-login-checkout-body]", modal).textContent = "Claim your free trial from your account. Discord is required only for trial claims. Roblox is optional on the website.";
    }
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  const closeLoginBeforeCheckoutModal = () => {
    const modal = $("#loginBeforeCheckoutModal");
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  const submitCheckout = async (event) => {
    event.preventDefault();
    const activeCopy = getCopy().checkout || copy.en.checkout;

    if (!selectedCheckoutPlan || !basePlans.some((plan) => plan.id === selectedCheckoutPlan)) {
      setCheckoutError(activeCopy.failed);
      return;
    }

    setCheckoutError("");
    setCheckoutLoading(true);

    try {
      const response = await fetchWithTimeout(`${apiBase}/api/checkout/create-session`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...(await csrfHeaders()) },
        body: JSON.stringify(checkoutPayload(selectedCheckoutPlan))
      }, 15000);
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || data.error === "account_required") {
        openLoginBeforeCheckoutModal(selectedCheckoutPlan);
        return;
      }
      if (!response.ok || !data.url) throw new Error(checkoutBlockedMessage(data));
      window.location.href = data.url;
    } catch (error) {
      const message = error?.name === "AbortError"
        ? activeCopy.backendMissing
        : activeCopy.failed;
      setCheckoutError(message);
      showCheckoutNotice(message);
      setCheckoutLoading(false);
    }
  };

  const checkoutBlockedMessage = (data, options = {}) => {
    const pricingCopy = getCopy().pricing || copy.en.pricing;
    const activeCopy = getCopy().checkout || copy.en.checkout;
    const code = data?.error || data?.reason || "";
    if (options.checkoutType === "gift_code_purchase" && (code === "discord_not_connected" || code === "roblox_not_connected" || code === "account_not_connected")) {
      return data?.message || pricingCopy.giftCodeBlocked || copy.en.pricing.giftCodeBlocked;
    }
    if (code === "discord_not_connected") return data?.message || (state.language === "tr" ? "Bu islem icin Discord gerekirse hesap ayarlarindan bagla." : "Connect Discord from account settings if this action requires it.");
    if (code === "roblox_not_connected") return data?.message || (state.language === "tr" ? "Roblox web sitesinde opsiyoneldir." : "Roblox is optional on the website.");
    return data?.message || activeCopy.failed;
  };

  const startAccountCheckout = async (planId, options = {}) => {
    if (!basePlans.some((plan) => plan.id === planId)) return;
    if (checkoutInFlight) return;
    selectedCheckoutPlan = planId;
    const activeCopy = getCopy().checkout || copy.en.checkout;
    const user = await getCurrentAccount();
    if (!user) {
      openLoginBeforeCheckoutModal(planId, options);
      return;
    }
    showCheckoutNotice(activeCopy.loading || copy.en.checkout.loading);
    checkoutInFlight = true;

    try {
      const response = await fetchWithTimeout(`${apiBase}/api/checkout/create-session`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...(await csrfHeaders()) },
        body: JSON.stringify(checkoutPayload(planId, options))
      }, 15000);
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || data.error === "account_required") {
        openLoginBeforeCheckoutModal(planId, options);
        return;
      }
      if (!response.ok || !data.url) throw new Error(checkoutBlockedMessage(data, options));
      window.location.href = data.url;
    } catch (error) {
      const message = error?.name === "AbortError"
        ? activeCopy.backendMissing
        : (error?.message || activeCopy.failed);
      showCheckoutNotice(message);
    } finally {
      checkoutInFlight = false;
    }
  };

  const robuxPlanLabel = (planId) => {
    const pricingCopy = getCopy().pricing || copy.en.pricing;
    const planCopy = pricingCopy.plans?.[planId] || copy.en.pricing.plans?.[planId] || {};
    return planCopy.name || planId || "Fima Macro";
  };

  const ensureRobuxModal = () => {
    let modal = $("#robuxModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "checkout-modal robux-modal";
    modal.id = "robuxModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="checkout-dialog robux-dialog" role="dialog" aria-modal="true" aria-labelledby="robuxTitle">
        <button class="modal-close" type="button" data-robux-close aria-label="Close">X</button>
        <p class="eyebrow">Manual payment</p>
        <h2 id="robuxTitle"></h2>
        <p data-robux-description></p>
        <div class="robux-modal-points">
          <span data-robux-staff></span>
          <span data-robux-stripe></span>
        </div>
        <div class="modal-actions">
          <button class="button secondary" type="button" data-robux-close>Cancel</button>
          <a class="button primary" href="${robuxTicketUrl}" target="_blank" rel="noopener" data-robux-ticket>Open Discord Ticket</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  };

  const openRobuxModal = (planId) => {
    const pricingCopy = getCopy().pricing || copy.en.pricing;
    const modal = ensureRobuxModal();
    const planName = robuxPlanLabel(planId);
    modal.querySelector("#robuxTitle").textContent = `${pricingCopy.robuxModalTitle || copy.en.pricing.robuxModalTitle}: ${planName}`;
    modal.querySelector("[data-robux-description]").textContent = pricingCopy.robuxModalDescription || copy.en.pricing.robuxModalDescription;
    modal.querySelector("[data-robux-staff]").textContent = pricingCopy.robuxModalStaff || copy.en.pricing.robuxModalStaff;
    modal.querySelector("[data-robux-stripe]").textContent = pricingCopy.robuxModalStripe || copy.en.pricing.robuxModalStripe;
    modal.querySelector("[data-robux-ticket]").textContent = pricingCopy.robuxOpenTicket || copy.en.pricing.robuxOpenTicket;
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };

  const closeRobuxModal = () => {
    const modal = $("#robuxModal");
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  const initCheckoutFlow = () => {
    const form = $("#checkoutForm");
    form?.addEventListener("submit", submitCheckout);

    document.addEventListener("click", (event) => {
      const giftCodeTrigger = event.target.closest("[data-gift-code-checkout-plan]");
      if (giftCodeTrigger) {
        event.preventDefault();
        startAccountCheckout(giftCodeTrigger.dataset.giftCodeCheckoutPlan, { checkoutType: "gift_code_purchase" });
        return;
      }

      const robuxTrigger = event.target.closest("[data-robux-plan]");
      if (robuxTrigger) {
        event.preventDefault();
        openRobuxModal(robuxTrigger.dataset.robuxPlan);
        return;
      }

      if (event.target.closest("[data-robux-close]") || event.target.classList.contains("robux-modal")) {
        event.preventDefault();
        closeRobuxModal();
        return;
      }

      const trialClaimTrigger = event.target.closest("[data-trial-claim-link]");
      if (trialClaimTrigger) {
        event.preventDefault();
        const next = "dashboard.html#monthly-trial";
        if (!currentSiteAccount) openLoginBeforeCheckoutModal("1day", { next, trialClaim: true });
        else window.location.href = next;
        return;
      }

      const trigger = event.target.closest("[data-checkout-plan]");
      if (trigger) {
        event.preventDefault();
        startAccountCheckout(trigger.dataset.checkoutPlan);
        return;
      }

      if (event.target.closest("[data-checkout-close]") || event.target === $("#checkoutModal")) {
        event.preventDefault();
        closeCheckoutModal();
      }

      if (event.target.closest("[data-login-checkout-close]") || event.target === $("#loginBeforeCheckoutModal")) {
        event.preventDefault();
        closeLoginBeforeCheckoutModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeCheckoutModal();
        closeLoginBeforeCheckoutModal();
      }
    });

    const checkoutParam = new URLSearchParams(location.search).get("checkout");
    const isGiftCodeCheckout = new URLSearchParams(location.search).get("giftCode") === "1";
    if (checkoutParam && basePlans.some((plan) => plan.id === checkoutParam)) {
      window.setTimeout(() => startAccountCheckout(checkoutParam, isGiftCodeCheckout ? { checkoutType: "gift_code_purchase" } : {}), 350);
    }
  };

  const updatePricingCountdowns = () => {
    $$("[data-pricing-countdown]").forEach((node) => {
      node.textContent = formatCountdown(saleEndsAt);
    });
    $$("[data-trial-promo-countdown]").forEach((node) => {
      node.textContent = trialPromoCountdown();
    });
  };

  const hydrateTrialPromo = async () => {
    try {
      const response = await fetchWithTimeout(`${apiBase}/api/trial-promo`, {}, 2600);
      if (!response.ok) return;
      const data = await response.json();
      state.trialPromo = data.promo || null;
      renderHomeTrialPromoBanner();
      renderPricing();
    } catch (error) {
      state.trialPromo = null;
      renderHomeTrialPromoBanner();
    }
  };

  const loadPublicSiteSettings = async () => {
    try {
      const response = await fetchWithTimeout(`${apiBase}/api/public/site-settings`, {}, 2600);
      if (!response.ok) return;
      const data = await response.json();
      publicSettings = data.settings || {};
    } catch (error) {
      publicSettings = {};
    }
  };

  const hydrateDiscordLinks = () => {
    const discordInviteUrl = String(publicSettings.discordInviteUrl || window.FIMA_DISCORD_INVITE_URL || "").trim();
    if (!discordInviteUrl) return;
    $$('a[href="#discord"], [data-discord-link]').forEach((link) => {
      link.href = discordInviteUrl;
      link.target = "_blank";
      link.rel = "noopener";
    });
  };

  const fetchWithTimeout = async (url, options = {}, timeout = 1800) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    } finally {
      window.clearTimeout(timer);
    }
  };

  let csrfTokenPromise = null;
  const getCsrfToken = async () => {
    if (!csrfTokenPromise) {
      csrfTokenPromise = fetchWithTimeout(`${apiBase}/api/csrf-token`, {
        credentials: "include",
        cache: "no-store"
      }, 8000)
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

  const csrfHeaders = async () => {
    try {
      return { "x-fima-csrf": await getCsrfToken() };
    } catch (error) {
      return {};
    }
  };

  const applyCurrencyRates = (nextRates) => {
    const parsed = Object.fromEntries(Object.entries(nextRates || {})
      .map(([currency, value]) => [currency, Number(value)])
      .filter(([currency, value]) => supportedCurrencySet.has(currency) && Number.isFinite(value) && value > 0));
    if (!parsed.USD || !parsed.TRY || !parsed.GBP) return false;
    rates = { ...fallbackRates, ...parsed, EUR: 1 };
    renderPricing();
    return true;
  };

  const hydrateCurrencyRates = async () => {
    try {
      const response = await fetchWithTimeout(`https://api.frankfurter.app/latest?from=EUR&to=${currencyOptions.filter((code) => code !== "EUR").join(",")}`, {}, 2600);
      if (response.ok) {
        const data = await response.json();
        if (applyCurrencyRates(data.rates)) return;
      }
    } catch (error) {
      // Static fallback rates keep pricing usable when public FX endpoints are unavailable.
    }

    try {
      const response = await fetchWithTimeout("https://open.er-api.com/v6/latest/EUR", {}, 2600);
      if (response.ok) {
        const data = await response.json();
        applyCurrencyRates(data.rates);
      }
    } catch (error) {
      // Keep fallback rates.
    }
  };

  const detectCountry = async () => {
    try {
      const response = await fetchWithTimeout("https://get.geojs.io/v1/ip/country.json");
      if (response.ok) {
        const data = await response.json();
        const country = String(data.country || data.country_code || "").toUpperCase();
        if (country) return country;
      }
    } catch (error) {
      // Fallback below.
    }

    try {
      const response = await fetchWithTimeout("https://ipapi.co/country/");
      if (response.ok) {
        const country = (await response.text()).trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(country)) return country;
      }
    } catch (error) {
      // Default preferences remain active.
    }
    return "";
  };

  const applyAutoLocale = async () => {
    const languageManual = localStorage.getItem(storage.languageManual) === "true";
    const currencyManual = localStorage.getItem(storage.currencyManual) === "true";
    if (languageManual && currencyManual) return;

    const country = await detectCountry();
    const defaults = countryDefaults[country];
    if (!defaults) return;

    if (!languageManual && !localStorage.getItem(storage.language)) {
      applyLanguage(defaults.language, false);
    }
    if (!currencyManual && !localStorage.getItem(storage.currency)) {
      applyCurrency(defaults.currency, false);
    }
  };

  const hydrateLatestVersion = async () => {
    const target = $("#latestVersion");
    const preview = $("#previewVersion");
    const downloadButton = $("#downloadButton");
    if (downloadButton) {
      downloadButton.href = publicSetupUrl;
      downloadButton.target = "_blank";
      downloadButton.rel = "noopener";
    }
    if (!target) return;

    const activeCopy = getCopy();
    try {
      const response = await fetch("latest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("manifest missing");
      const manifest = await response.json();
      const version = manifest.version || manifest.latest || manifest.latestVersion || manifest.tag || manifest.name || "Manifest found";
      target.textContent = version;
      if (preview) preview.textContent = String(version).startsWith("v") ? version : `v${version}`;
      const setupUrl = manifest.downloadUrl || manifest.setupUrl;
      if (downloadButton && /^https:\/\/github\.com\/fieel83\/fima-macro-releases\/releases\/download\//i.test(setupUrl || "")) {
        downloadButton.href = setupUrl;
      }

    } catch (error) {
      target.textContent = activeCopy.download.versionUnavailable;
    }
  };

  const initMenu = () => {
    const header = $("[data-header]");
    const toggle = $("[data-menu-toggle]");
    const menu = $("[data-menu]");
    if (!header || !toggle || !menu) return;

    toggle.addEventListener("click", () => {
      const isOpen = header.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    menu.addEventListener("click", (event) => {
      if (event.target instanceof HTMLAnchorElement) {
        header.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  };

  const initCanvas = () => {
    const canvas = $("#ambientCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let particles = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(80, Math.max(34, Math.floor(width / 18)));
      particles = Array.from({ length: count }, (_, index) => ({
        x: (index * 97) % width,
        y: (index * 53) % height,
        vx: ((index % 7) - 3) * 0.05,
        vy: (((index + 3) % 9) - 4) * 0.04,
        size: 1 + (index % 3) * 0.45
      }));
    };

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, width, height);
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#42d9ff";
      const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#9b5cff";

      particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;

        const shimmer = 0.42 + Math.sin(frame * 0.015 + index) * 0.22;
        ctx.globalAlpha = shimmer;
        ctx.fillStyle = index % 3 === 0 ? accent : primary;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();

        const next = particles[(index + 9) % particles.length];
        const dx = particle.x - next.x;
        const dy = particle.y - next.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 145) {
          ctx.globalAlpha = (1 - distance / 145) * 0.16;
          ctx.strokeStyle = index % 2 === 0 ? accent : primary;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(next.x, next.y);
          ctx.stroke();
        }
      });

      ctx.globalAlpha = 1;
      if (!prefersReducedMotion) requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    draw();
  };

  const initUiTour = () => {
    const controls = $("#uiTourControls");
    if (!controls) return;

    controls.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-ui-view]");
      if (!trigger) return;
      activeTourView = trigger.dataset.uiView;
      renderUiTour();
      restartUiTourTimer();
    });

    restartUiTourTimer();
  };

  const restartUiTourTimer = () => {
    window.clearInterval(tourTimer);
    tourTimer = window.setInterval(() => {
      const currentIndex = uiTourViews.findIndex((view) => view.id === activeTourView);
      activeTourView = uiTourViews[(currentIndex + 1) % uiTourViews.length].id;
      renderUiTour();
    }, 10000);
  };

  const initPreferences = () => {
    const savedTheme = localStorage.getItem(storage.theme) || "violet-dragon";
    const savedLanguage = localStorage.getItem(storage.language);
    const savedCurrency = localStorage.getItem(storage.currency);

    applyTheme(savedTheme);
    state.language = isKnownLanguage(savedLanguage) ? savedLanguage : "en";
    state.currency = rates[savedCurrency] || fallbackRates[savedCurrency] ? savedCurrency : "USD";

    const languageSelect = $("#languageSelect");
    const currencySelect = $("#currencySelect");
    const themeSelect = $("#themeSelect");

    if (languageSelect) {
      languageSelect.value = state.language;
      languageSelect.addEventListener("change", (event) => applyLanguage(event.target.value, true));
    }

    if (currencySelect) {
      currencySelect.value = state.currency;
      currencySelect.addEventListener("change", (event) => applyCurrency(event.target.value, true));
    }

    if (themeSelect) {
      themeSelect.value = savedTheme;
      themeSelect.addEventListener("change", (event) => applyTheme(event.target.value));
    }

    syncCustomSelect("themeSelect");
    syncCustomSelect("languageSelect");
    syncCustomSelect("currencySelect");
    setText();
    applyAutoLocale();
    hydrateCurrencyRates();
  };

  document.addEventListener("DOMContentLoaded", async () => {
    applyPageMode();
    populateSelectOptions();
    initMenu();
    initCustomSelects();
    initCheckoutFlow();
    await loadPublicSiteSettings();
    hydrateDiscordLinks();
    initPreferences();
    hydrateTrialPromo();
    hydrateSiteAccountNav();
    window.setInterval(updatePricingCountdowns, 1000);
    initMacroVideoGallery();
    hydrateMacroVideos();
    initUiTour();
    initCanvas();
  });
})();
