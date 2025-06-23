const CONFIG = {
  BASE_URL: "http://172.20.20.72:9008",
  REGISTRATION_PATH: "/Registration",
  API_ENDPOINT: "/Data/api/Panel/Add",
  ALLOWED_DOMAINS: [
    "10.tv",
    "walla.co.il",
    "ynet.co.il",
    "sport5.co.il",
    "one.co.il",
    "nana10.co.il",
    "tapuz.co.il",
    "mako.co.il",
    "reshet.tv",
    "13tv.co.il",
    "xnet.ynet.co.il",
    "youtube.com"
  ],
  AD_NETWORK_MAP: {
    "flashtalking.com": "Flashtalking",
    "doubleclick.net": "Google DoubleClick",
    "googlesyndication.com": "Google AdSense",
    "innovid.com": "Innovid",
    "adform.net": "Adform",
    "criteo.com": "Criteo",
    "taboola.com": "Taboola",
    "outbrain.com": "Outbrain"
  },
  AD_PATTERNS: [
    /cdn\.flashtalking\.com/i,
    /\.doubleclick\.net/i,
    /googleads\.g\.doubleclick\.net/i,
    /\.youtube\.com\/api\/stats\/ads/i,
    /\.innovid\.com/i,
    /\.brightcove\.com\/.*?ad/i,
    /\.adform\.net/i,
    /\.criteo\.com/i,
    /\.taboola\.com/i,
    /\.outbrain\.com/i,
    /\.revcontent\.com/i,
    /\.scorecardresearch\.com/i,
    /\.quantserve\.com/i,
    /\.exelator\.com/i,
    /\/ads?\//i,
    /[?&]ad_/i,
    /_adserver/i,
    /\.(mp4|m3u8|mov|flv)(\?.*)?$/i,
    /\.(gif|jpg|jpeg|png)\?.*ad/i
  ]
};

class BackgroundService {
  static manifest = chrome.runtime.getManifest();
  static browserInfo = this.getBrowserInfo();
  static detectedAds = new Map();
  static lastAdEvent = null;
  static userData = null;

  static init() {
    this.setupEventListeners();
    this.logStartupInfo();
    this.loadUserData();
  }

  // Initialization Methods

  static setupEventListeners() {
    this.setupInstallListener();
    this.setupMessageListener();
    this.setupAdDetection();
  }

  static setupInstallListener() {
    chrome.runtime.onInstalled.addListener(({ reason }) => {
      if (reason === "install" || reason === "update") {
        chrome.tabs.create({
          url: `${CONFIG.BASE_URL}${CONFIG.REGISTRATION_PATH}`
        });
      }
    });
  }

  static setupMessageListener() {
    chrome.runtime.onMessage.addListener(
      async (message, sender, sendResponse) => {
        try {
          switch (message.type) {
            case "YTD_SPONCERED_DATA":
              await this.handleAdData(message.data);
              break;
            case "UPDATE_USER_DATA":
              await this.updateUserData(message.data);
              sendResponse({ success: true });
              break;
            case "GET_USER_DATA":
              sendResponse({ data: this.userData });
              break;
          }
        } catch (error) {
          console.error("Message handling error:", error);
          sendResponse({ success: false, error: error.message });
        }
        return true;
      }
    );
  }

  static setupAdDetection() {
    chrome.storage.local.get(["adLogs"], (result) => {
      if (!result.adLogs) chrome.storage.local.set({ adLogs: [] });
    });

    chrome.webRequest.onBeforeRequest.addListener(
      this.handleWebRequest.bind(this),
      { urls: ["<all_urls>"] }
    );

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detectedAds.delete(tabId);
    });
  }

  // User Data Methods

  static async loadUserData() {
    this.userData = await this.getStorageData("ifatFormData");
  }

  static async updateUserData(newData) {
    this.userData = newData;
    await this.setStorageData("ifatFormData", newData);
  }

  static async isUserRegistered() {
    return !!this.userData;
  }

  // Storage Helper Methods

  static getStorageData(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || null);
      });
    });
  }

  static setStorageData(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  // Ad Event Handling

  static handleWebRequest(request) {
    if (!this.isValidRequest(request)) return;

    const { url, initiator } = request;
    const location = this.parseUrl(url);

    if (this.isYouTubeClick(url, location)) {
      this.handleYouTubeClick(url);
      return;
    }

    if (this.isYouTubeAd(url, location)) {
      this.handleYouTubeAd(url, location);
    }
  }

  static isValidRequest(request) {
    const pageUrl = request.initiator || request.documentUrl;
    if (!pageUrl) return false;

    try {
      const pageDomain = new URL(pageUrl).hostname.replace(/^www\./, "");
      return CONFIG.ALLOWED_DOMAINS.some((domain) =>
        pageDomain.endsWith(domain)
      );
    } catch {
      return false;
    }
  }

  static async handleAdData(adData) {
    try {
      const payload = this.createAdEventPayload(adData);
      await this.sendAdEvent(payload);
    } catch (error) {
      console.error("Ad data handling error:", error);
    }
  }

  static createAdEventPayload({
    type = "network_ad",
    advertiser,
    videoData,
    userFormData = this.userData,
    timestamp = Math.floor(Date.now() / 1000)
  }) {
    if (!userFormData) {
      throw new Error("User data not available");
    }

    const { url: adUrl, domain: advertiserDomain } =
      this.parseAdvertiser(advertiser);
    const { url: contentUrl, site } = this.parseContent(videoData);

    return {
      event_type: type,
      ad_url: adUrl,
      content_url: contentUrl,
      ad_type: type,
      timestamp,
      app_version: this.manifest.version,
      browser: this.browserInfo.browserName,
      browser_version: this.browserInfo.chromeVersion,
      os: this.browserInfo.os,
      user: this.createUserPayload(userFormData),
      site
    };
  }

  static parseAdvertiser(advertiser) {
    let url =
      typeof advertiser === "string"
        ? advertiser
        : advertiser?.url || "unknown";
    let domain = "unknown";

    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      console.warn("Couldn't parse advertiser URL:", url);
    }

    return { url, domain };
  }

  static parseContent(content) {
    let url = typeof content === "string" ? content : content?.url || "unknown";
    let site = "unknown";

    try {
      const hostname = new URL(url).hostname;
      site = hostname.includes("youtube.com")
        ? hostname
        : hostname.replace(/^www\./, "");
    } catch (e) {
      console.warn("Couldn't parse content URL:", url);
    }

    return { url, site };
  }

  static createUserPayload(userData) {
    return {
      id: this.generateGuid(),
      birth_date: userData.birth_date,
      code: userData.code,
      gender: userData.gender,
      lang: userData.lang,
      location: userData.location,
      panel_id: userData.panel_id,
      serial_num: userData.serial_num,
      serial_num1: userData.serial_num1
    };
  }

  // YouTube Specific

  static isYouTubeClick(url, location) {
    if (!url || !location?.hostname) return false;

    const isDoubleClick =
      location.hostname.includes("doubleclick.net") ||
      location.hostname.includes("googleadservices.com");

    return isDoubleClick && location.pathname.includes("aclk");
  }

  static handleYouTubeClick(url) {
    const timestamp = Math.floor(Date.now() / 1000);
    this.setStorageData("lastClickData", { url, timestamp });
    this.adEventCallback({
      event_type: "_DetectedClick",
      click_url: url,
      timestamp
    });
  }

  static isYouTubeAd(url, location) {
    return (
      location?.hostname?.includes("youtube.com") &&
      location.pathname?.includes("ptracking") &&
      location.search?.includes("adhost")
    );
  }

  static handleYouTubeAd(url, location) {
    const videoId = this.getURLParameter(url, "video_id");
    const contentId = this.getURLParameter(url, "content_v");

    const adUrl = this.constructYouTubeUrl(videoId);
    const contentUrl = this.constructYouTubeUrl(contentId);

    this.adEventCallback({
      event_type: "view",
      ad_url: adUrl,
      content_url: contentUrl,
      ad_type: "preroll"
    });
  }

  static constructYouTubeUrl(videoId) {
    return videoId?.length >= 6
      ? `https://www.youtube.com/watch?v=${videoId}`
      : "https://www.youtube.com";
  }

  // Ad Callback Handling

  static async adEventCallback(data) {
    try {
      this.enrichAdData(data);
      this.validateAdEvent(data);
      await this.sendAdEvent(data);
    } catch (error) {
      console.error("Ad event callback error:", error);
    }
  }

  static enrichAdData(data) {
    data.time = Math.floor(Date.now() / 1000);
    data.app_version = this.manifest.version;
    data.browser = this.browserInfo.browserName;
    data.browser_version = this.browserInfo.chromeVersion;
    data.os = this.browserInfo.os || "unknown";

    if (!data.user) {
      data.user = this.userData;
    }
  }

  static validateAdEvent(data) {
    if (!data.user) {
      throw new Error("User data not available for ad event");
    }

    if (data.event_type !== "view" && !this.lastAdEvent) {
      throw new Error(`Orphan ${data.event_type} event detected`);
    }

    if (this.lastAdEvent) {
      this.checkForDuplicateEvents(data);
      this.enrichWithLastEventData(data);
    }
  }

  static checkForDuplicateEvents(data) {
    if (
      data.event_type === "view" &&
      data.content_url === this.lastAdEvent.content_url
    ) {
      const diff = data.time - this.lastAdEvent.time;
      if (diff <= 3 || data.ad_url === this.lastAdEvent.ad_url) {
        throw new Error(`Duplicate event detected (${diff} sec)`);
      }
    }
  }

  static enrichWithLastEventData(data) {
    if (!data.content_url) data.content_url = this.lastAdEvent.content_url;
    if (!data.ad_url) data.ad_url = this.lastAdEvent.ad_url;

    if (["skipped", "click", "_DetectedClick"].includes(data.event_type)) {
      if (data.time - this.lastAdEvent.time > 60) {
        throw new Error("Late interaction event detected");
      }
    }

    if (!data.ad_type) {
      data.ad_type = this.determineAdType(data);
    }
  }

  static determineAdType(data) {
    if (!this.lastAdEvent) return "preroll";
    if (data.event_type !== "view") return this.lastAdEvent.ad_type;

    return this.lastAdEvent.content_url === data.content_url &&
      data.time - this.lastAdEvent.time >= 10
      ? "midroll/postroll"
      : "preroll";
  }

  // Utility Methods

  static parseUrl(url) {
    if (!url) return null;

    const [base, search] = url.split("?");
    const startHost = base.indexOf("://") + 3 || 0;
    const endHost = base.indexOf("/", startHost + 1);

    return {
      hostname:
        endHost >= 0 ? base.slice(startHost, endHost) : base.slice(startHost),
      pathname: endHost >= 0 ? base.slice(endHost) : "",
      search: search ? `?${search}` : ""
    };
  }

  static getURLParameter(url, name) {
    const match = new RegExp(`[?&]${name}=([^&;]+)`).exec(url);
    return match ? decodeURIComponent(match[1].replace(/\+/g, "%20")) : null;
  }

  static generateGuid() {
    const s4 = () =>
      Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  static getBrowserInfo() {
    const ua = navigator.userAgent;
    const uaData = navigator.userAgentData;

    let browserName = "Unknown";
    let chromeVersion = "Unknown";

    if (/Chrome/.test(ua) && !/Edge|OPR/.test(ua)) {
      browserName = "Google Chrome";
      chromeVersion = ua.match(/Chrome\/([\d.]+)/)?.[1] || "Unknown";
    }

    const os = uaData?.platform || this.detectOSFromUA(ua);

    return { browserName, chromeVersion, os, fullUserAgent: ua };
  }

  static detectOSFromUA(ua) {
    if (/Win/.test(ua)) return "Windows";
    if (/Mac/.test(ua)) return "MacOS";
    if (/Linux/.test(ua)) return "Linux";
    if (/Android/.test(ua)) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    return "Unknown";
  }

  static async sendAdEvent(payload) {
    try {
      const response = await fetch(`${CONFIG.BASE_URL}${CONFIG.API_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      if (payload.event_type === "view") {
        this.lastAdEvent = payload;
      }
    } catch (error) {
      console.error("Failed to send ad event:", error);
      throw error;
    }
  }

  static logStartupInfo() {
    console.log(
      `[BackgroundService] Version ${this.manifest.version} | ` +
        `Browser: ${this.browserInfo.browserName} ${this.browserInfo.chromeVersion} | ` +
        `OS: ${this.browserInfo.os}`
    );
  }
}

// Initialize the service
BackgroundService.init();
