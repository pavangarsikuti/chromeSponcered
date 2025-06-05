const CONFIG = {
  BASE_URL: "http://10.40.2.63:9008",
  REGISTRATION_PATH: "/Registration",
  API_ENDPOINT: "/Data/api/Panel/Add"
};

console.log("Background loaded");

class BackgroundService {
  static manifest = chrome.runtime.getManifest();
  static browserInfo = this.getBrowserInfo();

  static init() {
    this.setupInstallListener();
    this.isUserRegistered();
    this.setupMessageListener();
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

  // static setupMessageListener() {
  //   chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  //     if (message.type === "YTD_SPONCERED_DATA") {
  //       this.handleAdData(message.data)
  //         .then(() => sendResponse({ success: true }))
  //         .catch((error) => sendResponse({ success: false, error }));
  //       return true;
  //     }
  //   });
  // }

  // Add this at the top of background.js
  static async isUserRegistered() {
    const userData = await chrome.storage.local.get("ifatFormData");
    return !!userData.ifatFormData;
  }

  static setupMessageListener() {
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      switch (message.type) {
        case "YTD_SPONCERED_DATA":
          try {
            const registered = await this.isUserRegistered();
            if (registered) {
              await this.handleAdData(message.data);
              sendResponse({ success: true });
            } else {
              sendResponse({ success: false, error: "User not registered" });
            }
          } catch (error) {
            sendResponse({ success: false, error: error.message });
          }
          return true;

        case "CHECK_REGISTRATION":
          try {
            const registered = await this.isUserRegistered();
            sendResponse({ registered });
          } catch (error) {
            sendResponse({ registered: false });
          }
          return true;

        default:
          break;
      }
    });
  }

  static async handleAdData(adData) {
    console.log("Processing YouTube ad data:", adData);

    const { advertiser, videoData, userFormData, timestamp } = adData;
    const unixTimestamp = Math.floor(new Date(timestamp).getTime() / 1000);

    const adEventData = this.createAdEventPayload(
      adData.type,
      advertiser,
      videoData,
      userFormData,
      unixTimestamp
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

    return {
      event_type: type,
      ad_url: advertiser.url,
      content_url: videoData.url,
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
        id: "269234e4-5ee3-2ced-6a52-d901b40db585",
        lang: userFormData.lang,
        location: userFormData.location,
        panel_id: userFormData.panel_id,
        serial_num: userFormData.serial_num,
        serial_num1: userFormData.serial_num1
      },
      site: "youtube.com"
    };
  }

  static formatBirthDate({ dob_year, dob_month, dob_day }) {
    return `${dob_year}-${dob_month.padStart(2, "0")}-${dob_day.padStart(
      2,
      "0"
    )}`;
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
