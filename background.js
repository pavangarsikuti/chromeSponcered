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
    // /\.googlesyndication\.com/i,
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

  // Add this at the top of background.js
  static async isUserRegistered() {
    const userData = await chrome.storage.local.get("ifatFormData");
    return !!userData.ifatFormData;
  }

  static async getIfatFormData() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get("ifatFormData", (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error fetching ifatFormData:",
            chrome.runtime.lastError
          );
          return reject(chrome.runtime.lastError);
        }
        resolve(result.ifatFormData || null);
      });
    });
  }

  static guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return (
      s4() +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      "-" +
      s4() +
      s4() +
      s4()
    );
  }

  static ytURL(video_id) {
    // alert(video_id);
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

  static setupAdDetection() {
    // Initialize storage for ad logs
    chrome.storage.local.get(["adLogs"], (result) => {
      if (!result.adLogs) {
        chrome.storage.local.set({ adLogs: [] });
      }
    });

    chrome.webRequest.onBeforeRequest.addListener(
      (request) => {
        const pageUrl = request.initiator || request.documentUrl;
        if (!pageUrl) return;

        let pageDomain = "";

        try {
          pageDomain = new URL(pageUrl).hostname.replace(/^www\./, "");
        } catch (err) {
          console.warn("Invalid page URL:", pageUrl);
          return;
        }

        const ALLOWED_DOMAINS = [
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
        ];

        const isAllowed = ALLOWED_DOMAINS.some((domain) =>
          pageDomain.endsWith(domain)
        );

        if (!isAllowed) {
          return;
        }
        // this.detectNetworkAd(request);

        var page_url = "";
        function getLocation(href) {
          if (!href) return null;
          var l = {};
          var index = href.indexOf("?");
          var base = href;
          l.search = "";
          if (index >= 0) {
            l.search = href.slice(index + 1);
            base = href.slice(0, index);
          }
          var startHost = base.indexOf("://");
          if (startHost >= 0) startHost += 3;
          else startHost = 0;
          var endHost = base.indexOf("/", startHost + 1);
          if (endHost >= 0) {
            l.hostname = base.slice(startHost, endHost);
            l.pathname = base.slice(endHost);
          } else {
            l.hostname = base.slice(startHost);
            l.pathname = "";
          }
          return l;
        }

        var u = request.url;
        if (!u) return;
        var Sitelocation = getLocation(u);
        var t = page_url;
        if (
          Sitelocation.hostname.indexOf("youtube.com") !== -1 ||
          t.indexOf("youtube.com") !== -1
        ) {
          if (
            Sitelocation.hostname.indexOf("youtube.com") !== -1 &&
            Sitelocation.pathname.indexOf("ptracking") !== -1 &&
            Sitelocation.search.indexOf("adhost") !== -1
          ) {
            var ad_url = this.ytURL(this.getURLParameter(u, "video_id"));
            console.log("++Ad", ad_url);
            var content_murl = this.ytURL(this.getURLParameter(u, "content_v"));
            var content_v = this.getURLParameter(u, "content_v");
            console.log("++Ad", content_murl);
            if (!content_v || content_v.length < 6) {
              content_v = this.getURLParameter(t, "content_v");
            }
            if (!content_v || content_v.length < 6) {
              var content_url = t;
            } else {
              content_url = this.ytURL(content_v);
            }
          } else if (
            Sitelocation.pathname.indexOf("pagead/conversion") !== -1 &&
            Sitelocation.search.indexOf("label=videoskipped") !== -1
          ) {
            //skipping event
            // adSkipped(null, null);
          }
        }

        (async () => {
          const registered = await this.isUserRegistered();

          if (
            registered &&
            Sitelocation.hostname.includes("youtube.com") &&
            ad_url
          ) {
            try {
              const userData = await BackgroundService.getIfatFormData();
              const payload = BackgroundService.createAdEventPayload(
                "View",
                ad_url,
                content_murl,
                userData,
                request.timeStamp
              );

              console.log("check ytd3", payload);

              await BackgroundService.sendAdEvent(payload);
            } catch (error) {
              console.error("Error in sending ad event:", error);
            }
          }
        })();
      },
      { urls: ["<all_urls>"] }
    );

    // Clean up when tabs close
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detectedAds.delete(tabId);
    });
  }

  static detectNetworkAd(request) {
    console.log("check 1", request);
    if (request.tabId === -1) return; // Skip internal chrome requests
    const isAd = this.AD_PATTERNS.some((pattern) => pattern.test(request.url));
    if (isAd && !request.initiator?.includes("youtube.com")) {
      console.log("check 2", isAd);
      this.processDetectedAd(request);
    }
  }

  static extractDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  static async processDetectedAd(request) {
    // Initialize tab tracking if not exists
    if (!this.detectedAds.has(request.tabId)) {
      this.detectedAds.set(request.tabId, new Set());
    }

    const tabAds = this.detectedAds.get(request.tabId);
    if (tabAds.has(request.url)) return;

    tabAds.add(request.url);

    const adData = {
      url: request.url,
      timestamp: new Date().toISOString(),
      tabId: request.tabId,
      frameId: request.frameId,
      type: request.type,
      initiator: request.initiator,
      domain: this.extractDomain(request.url),
      adNetwork: this.detectAdNetwork(request.url)
    };
    const registered = await this.isUserRegistered();
    if (registered) {
      const userData = await chrome.storage.local.get("ifatFormData");
      await this.handleAdData({
        type: "network_ad",
        advertiser: adData.domain,
        videoData: request.url,
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

  static setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("ytd1", message);
      if (message.type === "YTD_SPONCERED_DATA") {
        console.log("ytd2", message.data);
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

    let site = "unknown";
    let ad_urll = advertiser.url;
    let content_urll = videoData.url;
    // try {
    //   if ((videoData.url && videoData.url !== "unknown") || videoData) {
    //     if (videoData.url) {
    //       const url = new URL(videoData.url);
    //       site = url.hostname.replace(/^www\./, "");
    //     } else {
    //       const url = new URL(videoData);
    //       site = url.hostname.replace(/^www\./, "");
    //     }
    //   }
    // } catch (e) {
    //   console.warn("Couldn't parse site URL:", videoData.url);
    // }
    try {
      if ((videoData.url && videoData.url !== "unknown") || videoData) {
        let rawUrl = videoData.url || videoData;
        const url = new URL(rawUrl);
        const hostname = url.hostname;
        if (hostname === "www.youtube.com" || hostname === "youtube.com") {
          site = "www.youtube.com";
        } else {
          site = hostname.replace(/^www\./, "");
        }
      }
    } catch (e) {
      console.warn("Couldn't parse site URL:", videoData.url);
    }
    if (advertiser) {
      ad_urll = advertiser;
    } else {
      ad_urll = advertiser.url;
    }
    if (videoData) {
      content_urll = videoData;
    } else {
      content_urll = videoData.url;
    }
    console.log("urls", ad_urll, content_urll);
    var _id = this.guid();

    return {
      event_type: type,
      ad_url: ad_urll,
      content_url: content_urll,
      ad_type: "preroll",
      timestamp,
      app_version: this.manifest.version,
      browser: this.browserInfo.browserName,
      browser_version: this.browserInfo.chromeVersion,
      os: this.browserInfo.os,
      user: {
        birth_date: birthDate,
        code: userFormData.code,
        gender: userFormData.gender,
        id: _id,
        lang: userFormData.lang,
        location: userFormData.location,
        panel_id: userFormData.panel_id,
        serial_num: userFormData.serial_num,
        serial_num1: userFormData.serial_num1
      },
      site: site // Now dynamic based on initiator
    };
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
