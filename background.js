// chrome.runtime.onInstalled.addListener(function (object) {
//   chrome.tabs.create(
//     { url: "http://10.40.2.63:9008/Registration" },
//     function (tab) {
//       console.log("New tab launched with http://10.40.2.63:9008/Registration");
//     }
//   );
// });

// var deets = chrome.runtime.getManifest();

// function getChromeVersion() {
//   const ua = navigator.userAgent;
//   const uaData = navigator.userAgentData || null;

//   // Browser detection
//   let browserName = "Unknown";
//   let chromeVersion = "Not Chrome";

//   if (/Chrome/.test(ua) && !/Edge/.test(ua) && !/OPR/.test(ua)) {
//     browserName = "Google Chrome";
//     const chromeMatch = ua.match(/Chrome\/([\d.]+)/);
//     chromeVersion = chromeMatch ? chromeMatch[1] : "Unknown";
//   }

//   // OS detection
//   let os = "Unknown";
//   if (uaData) {
//     const brands = uaData.brands
//       .map((b) => `${b.brand} ${b.version}`)
//       .join(", ");
//     os = uaData.platform || "Unknown";
//     return {
//       browserName,
//       chromeVersion,
//       os,
//       brands,
//       fullUserAgent: ua
//     };
//   } else {
//     // Fallback to userAgent parsing
//     if (/Win/.test(ua)) os = "Windows";
//     else if (/Mac/.test(ua)) os = "MacOS";
//     else if (/Linux/.test(ua)) os = "Linux";
//     else if (/Android/.test(ua)) os = "Android";
//     else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
//   }

//   return {
//     browserName,
//     chromeVersion,
//     os,
//     fullUserAgent: ua
//   };
// }

// chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
//   if (message.type === "YTD_SPONCERED_DATA") {
//     console.log("youtube add hit 1", message.data);
//     var msgYtd = message.data.advertiser;
//     var msgYtdContent = message.data.videoData;
//     var userData = message.data.userFormData;
//     console.log("cek1", msgYtd, "chk2", msgYtdContent);
//     console.log("yrl", msgYtd.url, "url", msgYtdContent.url);
//     const unixTimestamp = Math.floor(
//       new Date(message.data?.timestamp).getTime() / 1000
//     );
//     var birthDate = `${userData.dob_year}-${userData.dob_month.padStart(
//       2,
//       "0"
//     )}-${userData.dob_day.padStart(2, "0")}`;
//     const adEventData = {
//       event_type: message.data.type,
//       ad_url: msgYtd.url,
//       content_url: msgYtdContent.url,
//       ad_type: "preroll",
//       timestamp: unixTimestamp,
//       app_version: deets.version,
//       browser: getChromeVersion().browserName,
//       browser_version: getChromeVersion().chromeVersion,
//       os: getChromeVersion().os,
//       user: {
//         birth_date: birthDate,
//         code: userData.code,
//         gender: userData.gender,
//         id: "269234e4-5ee3-2ced-6a52-d901b40db585",
//         lang: userData.lang,
//         location: userData.location,
//         panel_id: userData.panel_id,
//         serial_num: userData.serial_num,
//         serial_num1: userData.serial_num1
//       },
//       site: "youtube.com"
//     };
//     fetch("http://10.40.2.63:9008/Data/api/Panel/Add", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json"
//       },
//       body: JSON.stringify(adEventData)
//     }).catch((error) => {
//       console.error("Failed to send ad event:", error);
//       sendResponse({ success: false, error: error.toString() });
//     });
//   }
// });

// console.log(
//   "[background] App Version: " +
//     deets.version +
//     " Browser: " +
//     "CHROME" +
//     " Chrome Version: " +
//     getChromeVersion()
// );

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

  static setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === "YTD_SPONCERED_DATA") {
        this.handleAdData(message.data)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error }));
        return true; // Required for async sendResponse
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
