const CONFIG = {
  BASE_URL: "http://172.20.20.72:9008",
  REGISTRATION_PATH: "/Registration",
  API_ENDPOINT: "/Data/api/Panel/Add"
};

console.log("Background loaded");

class BackgroundService {
  static manifest = chrome.runtime.getManifest();
  static browserInfo = this.getBrowserInfo();
  static detectedAds = new Map(); // Track ads per tab

  // Enhanced ad domain patterns
  static AD_PATTERNS = [
    // Video Ads
    /cdn\.flashtalking\.com/i,
    /\.doubleclick\.net/i,
    /googleads\.g\.doubleclick\.net/i,
    /\.youtube\.com\/api\/stats\/ads/i,
    /\.googlesyndication\.com/i,
    /\.innovid\.com/i,
    /\.brightcove\.com\/.*?ad/i,

    // Display Ads
    /\.adform\.net/i,
    /\.criteo\.com/i,
    /\.taboola\.com/i,
    /\.outbrain\.com/i,
    /\.revcontent\.com/i,

    // Tracking
    /\.scorecardresearch\.com/i,
    /\.quantserve\.com/i,
    /\.exelator\.com/i,

    // Generic Patterns
    /\/ads?\//i,
    /[?&]ad_/i,
    /_adserver/i,
    /\.(mp4|m3u8|mov|flv)(\?.*)?$/i,
    /\.(gif|jpg|jpeg|png)\?.*ad/i
  ];

  static init() {
    this.setupInstallListener();
    this.setupMessageListener();
    this.setupAdDetection();
    this.logStartupInfo();
  }

  static setupInstallListener() {
    chrome.runtime.onInstalled.addListener(({ reason }) => {
      if (reason === "install" || reason === "update") {
        chrome.tabs.create(
          {
            url: `${CONFIG.BASE_URL}${CONFIG.REGISTRATION_PATH}`
          },
          (tab) => {
            console.log("New tab launched with registration page");
          }
        );
      }
    });
  }

  static setupAdDetection() {
    // Initialize storage for ad logs
    chrome.storage.local.get(["adLogs"], (result) => {
      if (!result.adLogs) {
        chrome.storage.local.set({ adLogs: [] });
      }
    });

    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        const pageUrl = details.initiator || details.documentUrl;
        if (!pageUrl) return;

        const pageDomain = new URL(pageUrl).hostname.replace(/^www\./, "");
        const ALLOWED_DOMAINS = [
          "10.tv",
          "walla.co.il",
          "ynet.co.il",
          "youtube.com",
          "sport5.co.il",
          "one.co.il",
          "nana10.co.il",
          "tapuz.co.il",
          "mako.co.il",
          "reshet.tv",
          "13tv.co.il",
          "xnet.ynet.co.il"
        ];

        if (!ALLOWED_DOMAINS.includes(pageDomain)) {
          return;
        }
        this.detectNetworkAd(details);
        // Continue detecting ads
        console.log("Allowed site, checking for ad:", details.url);
      },
      { urls: ["<all_urls>"] }
    );

    // Clean up when tabs close
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detectedAds.delete(tabId);
    });
  }

  static detectNetworkAd(details) {
    if (details.tabId === -1) return; // Skip internal chrome requests

    const isAd = this.AD_PATTERNS.some((pattern) => pattern.test(details.url));
    if (isAd) {
      this.processDetectedAd(details);
    }
  }

  static extractDomain(url) {
    try {
      const domain = new URL(url).hostname;
      console.log(new URL(url));
      return domain.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  static async processDetectedAd(details) {
    // Initialize tab tracking if not exists
    if (!this.detectedAds.has(details.tabId)) {
      this.detectedAds.set(details.tabId, new Set());
    }

    const tabAds = this.detectedAds.get(details.tabId);

    // Skip if we've already seen this ad
    if (tabAds.has(details.url)) return;

    tabAds.add(details.url);

    const adData = {
      url: details.url,
      timestamp: new Date().toISOString(),
      tabId: details.tabId,
      frameId: details.frameId,
      type: details.type,
      initiator: details.initiator,
      domain: this.extractDomain(details.url),
      adNetwork: this.detectAdNetwork(details.url)
    };

    // Save to storage
    const result = await chrome.storage.local.get(["adLogs"]);
    const logs = result.adLogs || [];
    console.log("Ads Detected", adData);
    logs.push(adData);
    await chrome.storage.local.set({
      adLogs: logs,
      lastDetected: adData
    });

    // If registered, send to server
    const registered = await this.isUserRegistered();
    if (registered) {
      const userData = await chrome.storage.local.get("ifatFormData");
      await this.handleAdData({
        type: "network_ad",
        advertiser: { url: details.url },
        videoData: { url: details.url },
        userFormData: userData.ifatFormData,
        timestamp: adData.timestamp
      });
    }
  }

  static detectAdNetwork(url) {
    const networkMap = {
      "flashtalking.com": "Flashtalking",
      "doubleclick.net": "Google DoubleClick",
      "googlesyndication.com": "Google AdSense",
      "innovid.com": "Innovid",
      "adform.net": "Adform",
      "criteo.com": "Criteo",
      "taboola.com": "Taboola",
      "outbrain.com": "Outbrain"
    };

    for (const [domain, name] of Object.entries(networkMap)) {
      if (url.includes(domain)) return name;
    }

    return "Unknown";
  }

  // Add this at the top of background.js
  static async isUserRegistered() {
    const userData = await chrome.storage.local.get("ifatFormData");
    return !!userData.ifatFormData;
  }

  static setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "YTD_SPONCERED_DATA") {
        this.handleAdData(message.data)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error }));
        return true;
      }
    });
  }

  static async handleAdData(adData) {
    console.log("Processing ad data:", adData);

    const { advertiser, videoData, userFormData, timestamp, initiator } =
      adData;
    const unixTimestamp = Math.floor(new Date(timestamp).getTime() / 1000);

    const adEventData = this.createAdEventPayload(
      adData.type || "network_ad", // Fallback to "network_ad" if type not provided
      advertiser,
      videoData,
      userFormData,
      unixTimestamp,
      {
        url: adData.url // Use the detected ad URL
      },
      {
        url: initiator || "unknown" // Use the initiator as content URL
      }
    );

    await this.sendAdEvent(adEventData);
  }

  static createAdEventPayload(
    type,
    advertiser,
    videoData,
    userFormData,
    timestamp
  ) {
    const birthDate = this.formatBirthDate(userFormData);

    // Extract domain from initiator URL if available
    let site = "unknown";
    try {
      if (videoData.url && videoData.url !== "unknown") {
        const url = new URL(videoData.url);
        site = url.hostname.replace(/^www\./, "");
      }
    } catch (e) {
      console.warn("Couldn't parse site URL:", videoData.url);
    }

    return {
      event_type: type,
      ad_url: advertiser.url, // Now using the actual ad URL
      content_url: videoData.url, // Using the initiator as content URL
      ad_type: "preroll", // You might want to make this dynamic too
      timestamp,
      app_version: this.manifest.version,
      browser: this.browserInfo.browserName,
      browser_version: this.browserInfo.chromeVersion,
      os: this.browserInfo.os,
      user: {
        birth_date: birthDate,
        code: userFormData.code,
        gender: userFormData.gender,
        id: "269234e4-5ee3-2ced-6a52-d901b40db585",
        lang: userFormData.lang,
        location: userFormData.location,
        panel_id: userFormData.panel_id,
        serial_num: userFormData.serial_num,
        serial_num1: userFormData.serial_num1
      },
      site: site // Now dynamic based on initiator
    };
  }

  static checkUrlForAds(url) {
    if (
      url.includes("youtube.com") &&
      url.includes("ptracking") &&
      url.includes("adhost")
    ) {
      const ad_url = this.ytURL(this.getURLParameter(url, "video_id"));
      console.log("add url", ad_url);
      const content_v = this.getURLParameter(url, "content_v");
      console.log("content", content_url);
      let content_url;

      if (!content_v || content_v.length < 6) {
        content_url = window.location.href;
        console.log("content1", content_url);
      } else {
        content_url = this.ytURL(content_v);
        console.log("content2", content_url);
      }

      console.log("Detected Ad Network Request:", { content_url, ad_url });
      this.sendAdData({
        type: "network_ad",
        timestamp: new Date().toISOString(),
        content_url,
        ad_url
      });
    }
  }

  static ytURL(video_id) {
    if (!video_id || video_id.length < 6) return "https://www.youtube.com";
    console.log("video id", video_id);
    return `https://www.youtube.com/watch?v=${video_id}`;
  }

  static getURLParameter(url, name) {
    return (
      decodeURIComponent(
        (new RegExp(`[?|&]${name}=([^&;]+?)(&|#|;|$)`).exec(url) || [
          ,
          ""
        ])[1].replace(/\+/g, "%20")
      ) || null
    );
  }

  static formatBirthDate({ dob_year, dob_month, dob_day }) {
    return `${dob_year}-${dob_month.padStart(2, "0")}-${dob_day.padStart(
      2,
      "0"
    )}`;
  }

  static async sendAdEvent(payload) {
    console.log("payload", payload);
    try {
      const response = await fetch(`${CONFIG.BASE_URL}${CONFIG.API_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to send ad event:", error);
      throw error;
    }
  }

  static getBrowserInfo() {
    const ua = navigator.userAgent;
    const uaData = navigator.userAgentData || null;

    // Browser detection
    let browserName = "Unknown";
    let chromeVersion = "Not Chrome";

    if (/Chrome/.test(ua) && !/Edge|OPR/.test(ua)) {
      browserName = "Google Chrome";
      const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
      chromeVersion = chromeMatch?.[1] ?? "Unknown";
    }

    // OS detection
    let os = "Unknown";
    if (uaData) {
      os = uaData.platform || "Unknown";
    } else {
      if (/Win/.test(ua)) os = "Windows";
      else if (/Mac/.test(ua)) os = "MacOS";
      else if (/Linux/.test(ua)) os = "Linux";
      else if (/Android/.test(ua)) os = "Android";
      else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    }

    return {
      browserName,
      chromeVersion,
      os,
      fullUserAgent: ua
    };
  }

  static logStartupInfo() {
    console.log(
      `[background] App Version: ${this.manifest.version} | ` +
        `Browser: CHROME ${this.browserInfo.chromeVersion} | ` +
        `OS: ${this.browserInfo.os}`
    );
  }
}

// Initialize the background service
BackgroundService.init();
