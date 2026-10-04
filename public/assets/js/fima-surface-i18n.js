(() => {
  "use strict";

  const supportedLanguages = new Set(["tr", "en"]);
  const preferenceKey = "fimaUiLanguage";
  const legacyPreferenceKey = "paradiseUiLanguage";
  const sitePreferenceKey = "fima.language";
  const siteManualPreferenceKey = "fima.language.manual";
  const ignoredParents = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  let activeController = null;

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function safeStorageSet(language, { syncSite = false } = {}) {
    try {
      localStorage.setItem(preferenceKey, language);
      localStorage.setItem(legacyPreferenceKey, language);
      const siteLanguage = localStorage.getItem(sitePreferenceKey);
      if (syncSite && (!siteLanguage || supportedLanguages.has(siteLanguage))) {
        localStorage.setItem(sitePreferenceKey, language);
        localStorage.setItem(siteManualPreferenceKey, "true");
      }
    } catch {}
  }

  function requestedLanguage(sourceLocale) {
    const queryLanguage = new URLSearchParams(location.search).get("lang");
    if (supportedLanguages.has(queryLanguage)) return queryLanguage;
    const siteLanguage = safeStorageGet(sitePreferenceKey);
    if (supportedLanguages.has(siteLanguage)) return siteLanguage;
    const storedLanguage = safeStorageGet(preferenceKey) || safeStorageGet(legacyPreferenceKey);
    return supportedLanguages.has(storedLanguage) ? storedLanguage : sourceLocale;
  }

  function preserveWhitespace(source, translated) {
    const leading = source.match(/^\s*/u)?.[0] || "";
    const trailing = source.match(/\s*$/u)?.[0] || "";
    return `${leading}${translated}${trailing}`;
  }

  function mount(options = {}) {
    activeController?.destroy();

    const sourceLocale = options.sourceLocale === "en" ? "en" : "tr";
    const targetLocale = sourceLocale === "tr" ? "en" : "tr";
    const translations = Object.freeze({ ...(options.translations || {}) });
    const patterns = Array.isArray(options.patterns) ? options.patterns : [];
    const selector = document.getElementById(options.selectorId || "fimaUiLanguage");
    const metadata = options.metadata || {};
    let language = requestedLanguage(sourceLocale);
    let observer = null;

    function translate(source) {
      if (language === sourceLocale || typeof source !== "string") return source;
      const exact = translations[source];
      if (typeof exact === "string") return exact;
      for (const pattern of patterns) {
        if (!(pattern?.match instanceof RegExp) || typeof pattern.replace !== "function") continue;
        pattern.match.lastIndex = 0;
        const match = pattern.match.exec(source);
        if (match) return pattern.replace(match, source);
      }
      return source;
    }

    function translateTextNode(node) {
      if (!node?.parentElement || ignoredParents.has(node.parentElement.tagName)) return;
      const raw = node.nodeValue || "";
      if (!raw.trim()) return;
      let state = textSources.get(node);
      if (!state || raw !== state.rendered) state = { source: raw, rendered: raw };
      const compactSource = state.source.trim();
      const translated = translate(compactSource);
      const rendered = preserveWhitespace(state.source, translated);
      state.rendered = rendered;
      textSources.set(node, state);
      if (raw !== rendered) node.nodeValue = rendered;
    }

    function translateAttribute(element, attribute) {
      if (!element?.hasAttribute?.(attribute)) return;
      const raw = element.getAttribute(attribute) || "";
      let states = attributeSources.get(element);
      if (!states) {
        states = new Map();
        attributeSources.set(element, states);
      }
      let state = states.get(attribute);
      if (!state || raw !== state.rendered) state = { source: raw, rendered: raw };
      const rendered = translate(state.source);
      state.rendered = rendered;
      states.set(attribute, state);
      if (raw !== rendered) element.setAttribute(attribute, rendered);
    }

    function translateElement(element) {
      if (!element || ignoredParents.has(element.tagName)) return;
      for (const attribute of ["placeholder", "title", "aria-label"]) translateAttribute(element, attribute);
    }

    function translateTree(root = document.body) {
      if (!root) return;
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      if (root.nodeType === Node.ELEMENT_NODE) translateElement(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
        else translateElement(node);
        node = walker.nextNode();
      }
    }

    function applyMetadata() {
      const localeMetadata = metadata[language] || {};
      if (localeMetadata.title) document.title = localeMetadata.title;
      if (localeMetadata.description) {
        document.querySelector('meta[name="description"]')?.setAttribute("content", localeMetadata.description);
      }
    }

    function setLanguage(nextLanguage, { persist = true, syncSite = true } = {}) {
      language = supportedLanguages.has(nextLanguage) ? nextLanguage : sourceLocale;
      document.documentElement.lang = language;
      if (selector) selector.value = language;
      if (persist) safeStorageSet(language, { syncSite });
      applyMetadata();
      translateTree(document.body);
      document.dispatchEvent(new CustomEvent("fima:language-change", { detail: { language } }));
      return language;
    }

    selector?.addEventListener("change", event => setLanguage(event.target.value));
    observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "characterData") translateTextNode(record.target);
        else if (record.type === "attributes") translateAttribute(record.target, record.attributeName);
        else for (const node of record.addedNodes) translateTree(node);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"]
    });

    const storageListener = event => {
      if (
        (event.key === preferenceKey || event.key === legacyPreferenceKey || event.key === sitePreferenceKey)
        && supportedLanguages.has(event.newValue)
      ) {
        setLanguage(event.newValue, { persist: false });
      }
    };
    window.addEventListener("storage", storageListener);

    activeController = Object.freeze({
      getLanguage: () => language,
      setLanguage,
      translate,
      destroy() {
        observer?.disconnect();
        window.removeEventListener("storage", storageListener);
      }
    });
    setLanguage(language, { syncSite: false });
    return activeController;
  }

  window.FimaSurfaceI18n = Object.freeze({ mount });
})();
