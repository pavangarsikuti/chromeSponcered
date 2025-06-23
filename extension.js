console.log("extension.js is loaded");

const CONFIG = {
  BASE_URL: "http://172.20.20.72:9008"
};

const storage = {
  get: async (key) => {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },
  set: async (key, value) => {
    await chrome.storage.local.set({ [key]: value });
  }
};

async function onFocus() {
  await storage.set("currentUrl", window.location.href);
}

function formatBirthDate({ dob_year, dob_month, dob_day }) {
  return `${dob_year}-${dob_month.padStart(2, "0")}-${dob_day.padStart(
    2,
    "0"
  )}`;
}

document.addEventListener("DOMContentLoaded", async function () {
  document
    .getElementById("ifat-xtn-submit")
    ?.addEventListener("click", async function () {
      const gender = document.querySelector(
        "input[name='gender']:checked"
      )?.value;
      const dob_year = document.getElementById("dob_year")?.value;
      const dob_month = document.getElementById("dob_month")?.value;
      const dob_day = document.getElementById("dob_day")?.value;
      const location = document.querySelector(
        "input[name='location']:checked"
      )?.value;
      const code = "198901";
      const serial_num =
        document.getElementById("serial_num")?.value || "UNKNOWN";
      const serial_num1 =
        document.getElementById("serial_num1")?.value || "UNKNOWN";
      let panel_id = document.getElementById("panel_id")?.value;
      const lang = document.getElementById("lang")?.value;

      const birth_date = formatBirthDate({
        dob_year,
        dob_month,
        dob_day
      });

      const formData = {
        gender,
        birth_date,
        location,
        code,
        serial_num,
        serial_num1,
        panel_id,
        lang,
        id: guid(),
      };

      if (!gender || !location || !dob_year || !dob_month || !dob_day) {
        alert("Please fill all required fields");
        return;
      } else {
        chrome.storage.local.set({ ifatFormData: formData }, function () {
          alert("Registered Succesfully");
          // window.close();
        });
      }
      try {
        // const response = await fetch(
        //   `${CONFIG.BASE_URL}/PanelAds/GetOriginalPanel?s0=${serial_num}&s1=${serial_num1}`
        // );
        // const data = await response.text();

        // console.log("data after register",response)

        // if (data && !isNaN(data)) {
        //   panel_id = data;
        // }

        const user = {
          id: guid(),
          birth_date: `${dob_year}-${dob_month}-${dob_day}`,
          gender: gender,
          location: location,
          code: code,
          serial_num: serial_num,
          serial_num1: serial_num1,
          // panel_id: panel_id,
          lang: lang
        };

        chrome.storage.local.set({ user: user });
        chrome.runtime.sendMessage({
          event_type: "install",
          user: user,
          os: "CHROME"
        });

        let panelLink = `https://www.panelviewsurveys.com/se.ashx?s=${serial_num}&s1=${serial_num1}&t=2&aoid=${serial_num}`;
        if (panel_id == 7) {
          panelLink = `http://www.panel4all.co.il/survey_runtime/external_survey_status.php?surveyID=${serial_num}&userID=${serial_num1}&status=finish`;
        } else if (panel_id != 7 && panel_id != 1 && panel_id != "") {
          panelLink = `http://www.bakaratpirsum.co.il/Panel/ThankYou?s=${serial_num}&s1=${serial_num1}`;
        }

        window.open(panelLink, "_blank");
      } catch (error) {
        console.error("Failed to register:", error);
        alert("Failed to register");
      }
    });
});

function guid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

function sendAdEvent(eventData) {
  chrome.runtime.sendMessage({
    type: "adEvent",
    data: eventData
  });
}
