console.log("YouTube Ad Observer initialized");

class YouTubeAdTracker {
  constructor() {
    this.sponsoredAds = [];
    this.lastAdData = null;
    this.initAdObserver();
  }

  initAdObserver() {
    if (!document.body) {
      setTimeout(() => this.initAdObserver(), 10000);
      return;
    }

    this.observer = new MutationObserver((mutations) =>
      this.handleMutations(mutations)
    );

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }

  handleMutations(mutations) {
    mutations.forEach((mutation) => {
      if (this.isAdMutation(mutation)) {
        // this.processAd();
      }
    });
  }

  isAdMutation(mutation) {
    return (
      mutation.target.querySelector?.(".ytp-ad-player-overlay-layout") ||
      [...mutation.addedNodes].some((node) =>
        node.querySelector?.(".ytp-ad-player-overlay-layout")
      )
    );
  }

  async processAd() {
    try {
      const userFormData = await this.getUserFormData();
      const currentAdData = {
        type: "sponsored",
        timestamp: new Date().toISOString(),
        advertiser: this.getAdvertiserInfo(),
        videoData: this.getCurrentVideoInfo(),
        userFormData,
        isSkippable: this.isAdSkippable()
      };

      if (!this.isSameAdData(this.lastAdData, currentAdData)) {
        console.log("New YouTube Ad Detected:", currentAdData);
        this.lastAdData = currentAdData;
        this.sponsoredAds.push(currentAdData);
        this.sendAdData(currentAdData);
      }
    } catch (error) {
      console.error("Ad processing error:", error);
    }
  }

  async getUserFormData() {
    return new Promise((resolve) => {
      chrome.storage.local.get("ifatFormData", (result) => {
        resolve(result.ifatFormData || {});
      });
    });
  }

  getAdvertiserInfo() {
    const getElementData = (selector, prop = "textContent") => {
      const el = document.querySelector(selector);
      return el ? el[prop]?.trim() : null;
    };

    return {
      avatar: getElementData(
        ".ytp-ad-avatar.ytp-ad-avatar--size-m.ytp-ad-avatar--circular",
        "src"
      ),
      name: getElementData(
        ".ad-simple-attributed-string.ytp-ad-avatar-lockup-card__headline"
      ),
      description: getElementData(
        ".ad-simple-attributed-string.ytp-ad-avatar-lockup-card__description"
      ),
      url: getElementData(".ytp-visit-advertiser-link__text")
    };
  }

  getCurrentVideoInfo() {
    const videoId = new URLSearchParams(window.location.search).get("v");
    const getTextContent = (selector) => {
      const el = document.querySelector(selector);
      return el?.textContent.trim();
    };

    return {
      videoId,
      title: getTextContent("h1.ytd-watch-metadata > yt-formatted-string"),
      channel: getTextContent("#text > a.yt-simple-endpoint"),
      url: window.location.href
    };
  }

  isAdSkippable() {
    return document.querySelector(".ytp-skip-ad-button") !== null;
  }

  isSameAdData(prev, current) {
    if (!prev) return false;
    return (
      prev.advertiser?.name === current.advertiser?.name &&
      prev.advertiser?.url === current.advertiser?.url &&
      prev.videoData?.videoId === current.videoData?.videoId
    );
  }

  sendAdData(adData) {
    if (!this.isExtensionValid()) {
      console.warn("Extension runtime is not available");
      return;
    }
    console.log("ytdCon", adData);

    chrome.runtime.sendMessage(
      { type: "YTD_SPONCERED_DATA", data: adData },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "Extension context invalidated:",
            chrome.runtime.lastError
          );
        }
      }
    );
  }

  isExtensionValid() {
    return (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.sendMessage
    );
  }

  captureAdContent() {
    const adElement = document.querySelector(".video-ads.ytp-ad-module");
    return {
      html: adElement?.outerHTML
    };
  }
}

new YouTubeAdTracker();
