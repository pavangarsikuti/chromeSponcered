const CONFIG = {
  BASE_URL: "http://172.20.20.72:9008",
  REGISTRATION_PATH: "/Registration",
  API_ENDPOINT: "/Data/api/Panel/Add"
};

console.log("Background loaded");

class BackgroundService {
  static manifest = chrome.runtime.getManifest();
  static browserInfo = this.getBrowserInfo();
  static detectedAds = new Map();
  static lastOBJ = null;
  static userOBJ = null;
  static Gpage_url = "";

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
    this.getBrowserInfo();
    this.setupInstallListener();
    this.setupMessageListener();
    this.setupAdDetection();
    this.logStartupInfo();
    this.updateUserObj();
  }

  static getLocation(href) {
    if (!href) return null;
    var Sitelocation = {};
    var index = href.indexOf("?");
    var base = href;
    Sitelocation.search = "";
    if (index >= 0) {
      Sitelocation.search = href.slice(index + 1);
      base = href.slice(0, index);
    }
    var startHost = base.indexOf("://");
    if (startHost >= 0) startHost += 3;
    else startHost = 0;
    var endHost = base.indexOf("/", startHost + 1);
    if (endHost >= 0) {
      Sitelocation.hostname = base.slice(startHost, endHost);
      Sitelocation.pathname = base.slice(endHost);
    } else {
      Sitelocation.hostname = base.slice(startHost);
      Sitelocation.pathname = "";
    }
    return Sitelocation;
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

  static async isUserRegistered() {
    const userData = await chrome.storage.local.get("ifatFormData");
    return !!userData.ifatFormData;
  }

  static async getIfatFormData() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get("ifatFormData", (result) => {
        if (chrome.runtime.lastError) {
          console.log("Error fetching ifatFormData:", chrome.runtime.lastError);
          return reject(chrome.runtime.lastError);
        }
        resolve(result.ifatFormData || null);
      });
    });
  }

  static async updateUserObj() {
    this.userOBJ = await this.getIfatFormData();
    return this.userOBJ;
  }

  static ytURL(video_id) {
    if (!video_id || video_id.length < 6) return "https://www.youtube.com";
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

  static AllowedHost(site) {
    var map = [
      {
        name: "ytimg.com",
        site: "www.youtube.com"
      },
      {
        name: "youtube",
        site: "www.youtube.com"
      },
      {
        name: "wcdn.co.il",
        site: "walla.co.il"
      }
    ];
    for (var i = 0; i < map.length; i++) {
      if (site.indexOf(map[i].name) !== -1) return map[i].site;
    }

    var components = site.split(".");
    var n = components.length;
    if (n >= 4 && components[n - 1] === "il") {
      for (i = 3; i < n; i++) components.shift();
      return components.join(".");
    }
    if (n >= 3 && (components[n - 1] === "com" || components[n - 1] === "tv")) {
      for (i = 2; i < n; i++) components.shift();
      return components.join(".");
    }
    return site;
  }

  static async adEventCallback(data) {
    data.time = Math.round(new Date().getTime() / 1000);
    data.app_version = chrome.runtime.getManifest().version;
    data.browser = this.browserInfo.browserName;
    var chromeVersion = this.browserInfo.chromeVersion;
    data.browser_version = chromeVersion;
    data.os = this.browserInfo.os;

    if (!data.os) data.os = "unknown";

    try {
      const storage = await chrome.storage.local.get([
        "lastViewEvent",
        "last_skipped",
        "ad_type",
        "is_skipped",
        "addClicked",
        "lastDetectedClick"
      ]);

      const clearstoarge = await chrome.storage.local.remove("addClicked");

      await BackgroundService.updateUserObj();
      if (!data.user) data.user = this.userOBJ;
      if (!data.user || !data.user.id || !data.user.serial_num) {
        console.log("Could not find user information. aborting");
        return;
      }

      if (data.event_type === "_DetectedClick" && !storage.addClicked) {
        console.log("DetectedClick event without Clicked flag. Skipping.");
        return;
      }

      const lastClickDtected = storage.lastDetectedClick
        ? JSON.parse(storage.lastDetectedClick)
        : null;

      if (data.event_type === "_DetectedClick") {
        var prevClickData = lastClickDtected?.click_url;
        var currentClickData = {
          click_url: data?.click_url || ""
        };
        if (prevClickData && prevClickData === currentClickData?.click_url) {
          console.log("Duplicate click detected aborting");
          return;
        }
        await chrome.storage.local.set({
          lastDetectedClick: JSON.stringify(data)
        });
      }

      if (!data.event_type) data.event_type = "view";

      const lastViewEvent = storage.lastViewEvent
        ? JSON.parse(storage.lastViewEvent)
        : null;

      if (!["install", "active"].includes(data.event_type)) {
        if (lastViewEvent) {
          if (
            data.event_type === "view" &&
            data.content_url === lastViewEvent.content_url
          ) {
            const diff = data.time - lastViewEvent.time;
            if (diff <= 3 || data.ad_url === lastViewEvent.ad_url) {
              console.log(
                `Duplicate event detected on ${data.content_url} (${diff}).`
              );
              return;
            }
          }

          if (!data.content_url) data.content_url = lastViewEvent.content_url;
          if (!data.ad_url) data.ad_url = lastViewEvent.ad_url;

          if (
            ["skipped", "click", "_DetectedClick"].includes(data.event_type) &&
            data.ad_url !== lastViewEvent.ad_url
          ) {
            console.log("Returning function for skipped,click,_DetectedClick");
            return;
          }
        } else if (data.event_type !== "view") {
          console.log(
            `Dropping orphan ${data.event_type} event on ${data.content_url}`
          );
          return;
        }

        // Handle skip deduplication
        if (data.event_type === "skipped") {
          if (storage.last_skipped === data.ad_url) return;
          await chrome.storage.local.set({
            last_skipped: data.ad_url
          });
        }

        // Determine ad type
        if (!data.ad_type) {
          data.ad_type = storage.ad_type;
          if (!data.ad_type) {
            if (!lastViewEvent) {
              data.ad_type = "preroll";
            } else if (data.event_type !== "view") {
              data.ad_type = lastViewEvent.ad_type;
            } else if (
              lastViewEvent.content_url === data.content_url &&
              data.time - lastViewEvent.time >= 10
            ) {
              data.ad_type = "midroll/postroll";
            } else {
              data.ad_type = "preroll";
            }
          }
        }

        const contentLocation = this.getLocation(data.content_url);
        if (contentLocation)
          data.site = this.AllowedHost(contentLocation.hostname);

        if (data.event_type === "view") {
          await chrome.storage.local.set({
            lastViewEvent: JSON.stringify(data)
          });
        }
      }

      if (storage.is_skipped && storage.is_skipped === "true") {
        data.event_type = "skipped";
        await chrome.storage.local.set({
          is_skipped: "false"
        });
      }
      clearstoarge;
      await this.sendAdEvent(data);
    } catch (err) {
      console.log("Error in adEventCallback:", err);
    }
  }

  static setupAdDetection() {
    chrome.storage.local.get(["adLogs"], (result) => {
      if (!result.adLogs) {
        chrome.storage.local.set({ adLogs: [] });
      }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tab.active) {
        BackgroundService.Gpage_url = tab.url;
      }
    });

    chrome.tabs.onActivated.addListener((activeInfo) => {
      chrome.tabs.get(activeInfo?.tabId, (tab) => {
        if (tab?.url) {
          BackgroundService.Gpage_url = tab.url;
        }
      });
    });

    chrome.webNavigation.onCommitted.addListener((details) => {
      if (details.frameId === 0) {
        chrome.tabs.get(details?.tabId, (tab) => {
          if (tab?.url) {
            BackgroundService.Gpage_url = tab.url;
          }
        });
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
        function isVideoFile(location) {
          if (location.pathname.indexOf(".smil") !== -1) return false;
          return (
            location.pathname.search(/\.mp4/i) !== -1 ||
            location.pathname.search(/\.webm/i) !== -1 ||
            location.pathname.search(/\.flv/i) !== -1 ||
            location.pathname.search(/\.f4v/i) !== -1 ||
            location.pathname.search(/videoplayback/i) !== -1
          );
        }

        var page_url = "";
        var u = request.url;
        if (!u) return;
        var Sitelocation = this.getLocation(u);
        var t = page_url;
        if (!t) {
          t = BackgroundService.Gpage_url;
        }

        function clickActionHandler(url, l) {
          if (!url) return false;
          if (l?.hostname) {
            const isDoubleClick =
              l?.hostname.includes("doubleclick.net") ||
              l?.hostname.includes("googleadservices.com");

            if (isDoubleClick) {
              const aclkPos = l?.pathname.indexOf("aclk");
              return aclkPos >= 0 && aclkPos <= 10;
            }
          }
          console.log("urls", url);

          return false;
        }

        if (clickActionHandler(u, Sitelocation)) {
          const ts = Math.floor(Date.now() / 1000);
          chrome.storage.local.set({
            lastClickTs: ts,
            lastClickUrl: u
          });

          BackgroundService.adEventCallback({
            event_type: "_DetectedClick",
            click_url: u,
            timestamp: ts
          });
          return;
        }

        function adEvent(content_url, ad_url, ad_type, event_type) {
          var adEventObj = {
            event_type: event_type,
            ad_url: ad_url,
            content_url: content_url,
            ad_type: ad_type
          };
          BackgroundService.adEventCallback(adEventObj);
        }

        function adSkipped(content_url, ad_url) {
          adEvent(content_url, ad_url, null, "skipped");
        }

        if (
          Sitelocation.hostname?.indexOf("youtube.com") !== -1 ||
          t?.indexOf("youtube.com") !== -1
        ) {
          if (
            Sitelocation.hostname.indexOf("youtube.com") !== -1 &&
            Sitelocation.pathname.indexOf("ptracking") !== -1 &&
            Sitelocation.search.indexOf("adhost") !== -1
          ) {
            var ad_url = this.ytURL(this.getURLParameter(u, "video_id"));
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
            adEvent(content_url, ad_url);
          } else if (
            // Sitelocation.pathname.indexOf("pagead/interaction") !== -1 &&
            Sitelocation.search.indexOf("label=videoskipped") !== -1
          ) {
            adSkipped(null, null);
          }
        } else if (Sitelocation.hostname.endsWith("vsc.walla.co.il")) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (Sitelocation.hostname.indexOf("1host.co.il") !== -1) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (Sitelocation.hostname.indexOf(".gvt1.com") !== -1) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (Sitelocation.hostname.indexOf(".dxmcdn.com") !== -1) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (Sitelocation.hostname.indexOf("b.wrtm.walla.co.il") !== -1) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (Sitelocation.hostname.indexOf("b.waab.walla.co.il") !== -1) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (Sitelocation.hostname.indexOf("xwbe.wcdn.co.il") !== -1) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (
          Sitelocation.hostname.indexOf("banners.advsnx.net") !== -1 ||
          Sitelocation.hostname.indexOf("banners1.advsnx.net") !== -1
        ) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (Sitelocation.hostname.indexOf("x.walla.co.il") !== -1) {
          if (isVideoFile(Sitelocation)) adEvent(t, u);
        } else if (
          this.testRegex(
            Sitelocation.hostname,
            "r[0-9]---sn-[A-Za-z0-9_]*.c.2mdn.net"
          )
        ) {
          if (isVideoFile(Sitelocation)) {
            adEvent(t, u);
          }
        } else if (
          this.testRegex(
            Sitelocation.hostname,
            "r[0-9]---sn-[A-Za-z0-9_-]*.googlevideo.com"
          )
        ) {
          if (isVideoFile(Sitelocation)) {
            adEvent(t, u);
          }
        } else if (Sitelocation.search.includes("evt=skip") || Sitelocation.pathname.includes("evt=skip") )  {
          debugger;
          adSkipped(null, null);
        }
      },
      { urls: ["<all_urls>"] }
    );

    chrome.webNavigation.onBeforeNavigate.addListener(
      async (details) => {
        if (
          details.url.includes("https://pubads.g.doubleclick.net/pcs/click?") ||
          details.url.includes("https://googleads.g.doubleclick.net/aclk?") ||
          details.url.includes("https://www.googleadservices.com/pagead/aclk")
        ) {
          const ts = Math.floor(Date.now() / 1000);
          chrome.storage.local.set({
            addClicked: ts
          });
          if(this.Gpage_url.includes("walla.co.il"))
          BackgroundService.adEventCallback({
            event_type: "_DetectedClick",
            click_url: details.url,
            timestamp: ts
          });
        }

        if (
          details.url.startsWith("https://www.googleadservices.com/pagead/aclk")
        ) {
          const ts = Math.floor(Date.now() / 1000);
          chrome.storage.local.set({
            addClicked: ts
          });
        }

        const regPageUrl = `${CONFIG.BASE_URL}${CONFIG.REGISTRATION_PATH}`;

        if (details.url === regPageUrl) return;

        try {
          const now = Math.floor(Date.now() / 1000);
          const localData = await chrome.storage.local.get([
            "lastSanityCheck",
            "ifatFormData"
          ]);
          const lastSanityCheck = localData.lastSanityCheck;
          const userOBJ = localData.ifatFormData;

          if (!lastSanityCheck || now - lastSanityCheck > 86400) {
            await chrome.storage.local.set({ lastSanityCheck: now });

            if (!userOBJ || !userOBJ.id || !userOBJ.serial_num) {
              console.log("No valid user found, redirecting to registration");
              chrome.tabs.update(details.tabId, { url: regPageUrl });
              return;
            }
            if (
              details.url.startsWith("https://www.youtube.com/") &&
              details.url.includes("walla.co.il/")
            ) {
              await BackgroundService.adEventCallback({
                event_type: "active"
              });
            }
          }
        } catch (err) {
          console.error("Error in navigation handler:", err);
        }
      },
      {
        urls: ["http://*/*", "https://*/*"]
      }
    );

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detectedAds.delete(tabId);
    });
  }

  static detectNetworkAd(request) {
    if (request.tabId === -1) return;
    const isAd = this.AD_PATTERNS.some((pattern) => pattern.test(request.url));
    if (isAd && !request.initiator?.includes("youtube.com")) {
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

  static testRegex(str, regex) {
    var re = new RegExp(regex);
    return re.test(str);
  }

  static setupMessageListener() {
    chrome.runtime.onMessage.addListener(
      async (message, sender, sendResponse) => {
        if (message.type === "YTD_SPONCERED_DATA") {
          this.handleAdData(message.data);
          // .then(() => sendResponse({ success: true }))
          // .catch((error) => sendResponse({ success: false, error }));
          return true;
        } else if (message.event_type === "install") {
          this.adEventCallback(message);
          return true;
        } else if (message.event_type === "active") {
          this.adEventCallback(message);
          return true;
        }
      }
    );
  }

  static async handleAdData(adData) {
    const { advertiser, videoData, userFormData, timestamp, initiator } =
      adData;
    const unixTimestamp = Math.floor(new Date(timestamp).getTime() / 1000);

    const adEventData = this.createAdEventPayload(
      adData.type || "network_ad",
      advertiser,
      videoData,
      userFormData,
      unixTimestamp,
      {
        url: adData.url
      },
      {
        url: initiator || "unknown"
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
    let site = "unknown";
    let ad_urll = advertiser.url;
    let content_urll = videoData.url;
    try {
      if ((videoData.url && videoData.url !== "unknown") || videoData) {
        let rawUrl = videoData.url || videoData;
        const url = new URL(rawUrl);
        const hostname = url.hostname;
        if (hostname.includes("youtube.com")) {
          site = hostname;
        } else {
          site = hostname.replace(/^www\./, "");
        }
      }
    } catch (e) {
      console.warn("Couldn't parse site URL:", videoData?.url || videoData);
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

    return {
      event_type: type,
      ad_url: ad_urll,
      content_url: content_urll,
      ad_type: type,
      timestamp,
      app_version: this.manifest.version,
      browser: this.browserInfo.browserName,
      browser_version: this.browserInfo.chromeVersion,
      os: this.browserInfo.os,
      user: {
        birth_date: userFormData.birth_date,
        code: userFormData.code,
        gender: userFormData.gender,
        id: userFormData?.id,
        lang: userFormData.lang,
        location: userFormData.location,
        panel_id: userFormData.panel_id,
        serial_num: userFormData.serial_num,
        serial_num1: userFormData.serial_num1
      },
      site: site // Now dynamic based on initiator
    };
  }

  static async sendAdEvent(payload) {
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
      console.log("Failed to send ad event:", error);
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
