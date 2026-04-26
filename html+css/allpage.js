// Pages that don't need a login token — everyone else gets sent to the login page
const API_URL = "http://localhost:5001";
const PUBLIC_PAGES = ["login.html", "register.html", "forgotpwd.html", "Login.html"];
const currentPage = window.location.pathname.split("/").pop();

if (!PUBLIC_PAGES.includes(currentPage)) {
  const token = localStorage.getItem("cws_token");
  if (!token) {
    window.location.href = "login.html";
  }
}

document.addEventListener("DOMContentLoaded", initApp);

// Kicks everything off once the page is ready
async function initApp() {
  initTheme();
  initFontScale();
  await initProfileView();
  await initProgressView();
  initProfileForm();
  initPasswordForm();
  initOptionalButtons();
  initUserNameDisplay();
  initChatbot();
  initNewsFeed();
  initImageAnalysis();
}

// Shorthand for document.querySelector — just saves some typing
function $(selector) {
  return document.querySelector(selector);
}

// Escapes any characters that could break HTML if we're inserting user content
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}

// Turns a date string into a readable format like "12 Apr 2026"
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// All the localStorage keys in one place so they're easy to find and change
const STORAGE_KEYS = {
  theme: "cws_theme",
  fontScale: "cws_fontScale",
  userProfile: "userProfile",
  userProgress: "userProgress",
  userPassword: "userPassword",
  userName: "cws_user_name"
};

// Adds a chat bubble to the chat window — works for both user and bot messages
function addMessage(text, sender) {
  const chatBody = document.getElementById("chatBody");
  if (!chatBody) return;

  const msg = document.createElement("div");

  if (sender === "user") {
    msg.className = "message user-message";
  } else if (sender === "assistant" || sender === "bot") {
    msg.className = "message bot-message";
  } else {
    msg.className = "message";
  }

  msg.textContent = text;
  chatBody.appendChild(msg);

  setTimeout(() => {
    chatBody.scrollTop = chatBody.scrollHeight;
  }, 0);
}

// Applies the saved theme on load and wires up the toggle button
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
  const themeToggle = document.getElementById("toggleTheme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  }

  updateThemeButtonText(themeToggle);

  if (!themeToggle) return;

  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem(STORAGE_KEYS.theme, isDark ? "dark" : "light");
    updateThemeButtonText(themeToggle);
  });
}

// Keeps the button label in sync with whichever mode is currently active
function updateThemeButtonText(button) {
  if (!button) return;
  const isDark = document.body.classList.contains("dark");
  button.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
  button.setAttribute("aria-pressed", isDark ? "true" : "false")
}

// Clamps the scale to a sensible range and applies it to the whole page
function setScale(scale) {
  const clamped = Math.max(0.9, Math.min(1.25, scale));
  document.documentElement.style.setProperty("--fontScale", clamped);
  document.documentElement.style.fontSize = (clamped * 100) + "%";
  localStorage.setItem(STORAGE_KEYS.fontScale, String(clamped));
}

// Restores the saved font size on load and hooks up the A+ / A- buttons
function initFontScale() {
  const savedScale = parseFloat(localStorage.getItem(STORAGE_KEYS.fontScale) || "1");
  setScale(savedScale);

  const increaseBtn = document.getElementById("increaseText");
  const decreaseBtn = document.getElementById("decreaseText");

  if (increaseBtn) {
    increaseBtn.addEventListener("click", () => bumpScale(0.05));
  }

  if (decreaseBtn) {
    decreaseBtn.addEventListener("click", () => bumpScale(-0.05));
  }
}

// Reads the current scale from the CSS variable and nudges it up or down
function bumpScale(delta) {
  const current =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fontScale")) || 1;
  setScale(current + delta);
}

// Returns a safe default profile in case nothing is saved yet
function getDefaultProfile() {
  return {
    name: "Guest User",
    email: "cyberwise@example.com",
    joined: "April 2026"
  };
}

// Reads the profile from localStorage, falling back to the default if anything goes wrong
function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.userProfile)) || getDefaultProfile();
  } catch (error) {
    return getDefaultProfile();
  }
}

// Saves the profile locally and also keeps the display name in sync
function saveProfileLocal(profile) {
  localStorage.setItem(STORAGE_KEYS.userProfile, JSON.stringify(profile));
  localStorage.setItem(STORAGE_KEYS.userName, profile.name || "Guest User");
}

// Returns zeroed-out progress so there's always something to work with
function getDefaultProgress() {
  return {
    phoneScams: false,
    doorstepScams: false,
    relationshipScams: false,
    shoppingScams: false,
    quizCompleted: false
  };
}

// Reads progress from localStorage, falling back to the default if it's missing or broken
function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.userProgress)) || getDefaultProgress();
  } catch (error) {
    return getDefaultProgress();
  }
}

// Merges new progress into what's already saved, then syncs it up to the server
async function saveProgress(updates) {
  const current = getProgress();
  const merged = { ...current, ...updates };
  localStorage.setItem(STORAGE_KEYS.userProgress, JSON.stringify(merged));

  const token = localStorage.getItem("cws_token");
  if (!token) return;

  try {
    await fetch(`${API_URL}/api/progress`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
  } catch (err) {
    console.error("Could not save progress to server:", err);
  }
}

// Loads the profile from the server if logged in, otherwise falls back to localStorage
async function initProfileView() {
  const profileName = document.getElementById("profileName");
  const profileEmail = document.getElementById("profileEmail");
  const joinedDate = document.getElementById("joinedDate");
  const fullNameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("emailAddress");
  const joinedInput = document.getElementById("joinedInput");

  let profile = getProfile();

  const token = localStorage.getItem("cws_token");
  if (token) {
    try {
      const res = await fetch("http://localhost:5001/api/profile", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        profile = data;
        saveProfileLocal(profile);
      }
    } catch (err) {
      console.error("Could not load profile from server:", err);
    }
  }

  if (profileName) profileName.textContent = profile.name;
  if (profileEmail) profileEmail.textContent = profile.email;
  if (joinedDate) joinedDate.textContent = profile.joined;
  if (fullNameInput) fullNameInput.value = profile.name;
  if (emailInput) emailInput.value = profile.email;
  if (joinedInput) joinedInput.value = profile.joined;
}

// Shows the logged-in user's name wherever it appears in the header or sidebar
function initUserNameDisplay() {
  const storedUser = localStorage.getItem("cws_user");
  let name = "User";

  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      name = user.name || "User";
    } catch {}
  }

  const userNameTop = document.getElementById("userNameTop");
  const userNameSide = document.getElementById("userNameSide");

  if (userNameTop) userNameTop.textContent = name;
  if (userNameSide) userNameSide.textContent = name;
}

// Builds the progress page — fetches from the server if available, otherwise uses localStorage
async function initProgressView() {
  const completedCount = document.getElementById("completedCount");
  const badgeCount = document.getElementById("badgeCount");
  const overallProgressBar = document.getElementById("overallProgressBar");
  const overallProgressText = document.getElementById("overallProgressText");
  const moduleList = document.getElementById("moduleList");
  const badgesContainer = document.getElementById("badgesContainer");

  if (!completedCount || !badgeCount || !overallProgressBar || !overallProgressText || !moduleList || !badgesContainer) return;

  let progress = getProgress();

  const token = localStorage.getItem("cws_token");
  if (token) {
    try {
      const res = await fetch(`${API_URL}/api/progress`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        progress = await res.json();
        localStorage.setItem(STORAGE_KEYS.userProgress, JSON.stringify(progress));
      }
    } catch (err) {
      console.error("Could not load progress from server:", err);
    }
  }

  const modules = [
    { key: "phone_module", label: "📱 Phone Scams" },
    { key: "doorstep_module", label: "🚪 Doorstep Scams" },
    { key: "relationship_module", label: "💔 Relationship Scams" },
    { key: "mail_module", label: "📬 Mail Scams" },
    { key: "identity_module", label: "🪪 Identity Theft" },
    { key: "investment_module", label: "💰 Investment & Pension" },
    { key: "business_module", label: "📧 Business Email" },
    { key: "textmsg_module", label: "💬 Text Message Scams" },
    { key: "buying_module", label: "🛍️ Buying & Selling" },
  ];

  const quizzes = [
    { key: "phone_quiz", label: "📱 Phone Scams Quiz" },
    { key: "doorstep_quiz", label: "🚪 Doorstep Scams Quiz" },
    { key: "relationship_quiz", label: "💔 Relationship Scams Quiz" },
    { key: "mail_quiz", label: "📬 Mail Scams Quiz" },
    { key: "identity_quiz", label: "🪪 Identity Theft Quiz" },
    { key: "business_quiz", label: "📧 Business Email Quiz" },
    { key: "textmsg_quiz", label: "💬 Text Message Quiz" },
    { key: "buying_quiz", label: "🛍️ Buying & Selling Quiz" },
  ];

  const modulesCompleted = modules.filter((m) => progress[m.key]).length;
  const quizzesCompleted = quizzes.filter((q) => progress[q.key]).length;
  const total = modules.length + quizzes.length;
  const totalCompleted = modulesCompleted + quizzesCompleted;
  const percent = Math.round((totalCompleted / total) * 100);

  completedCount.textContent = `${modulesCompleted}/${modules.length} Modules · ${quizzesCompleted}/${quizzes.length} Quizzes`;
  overallProgressBar.style.width = `${percent}%`;
  overallProgressText.textContent = `${percent}% completed`;

  // Work out how many badges the user has earned based on their progress
  let badges = 0;
  if (modulesCompleted >= 1) badges++;
  if (modulesCompleted >= 5) badges++;
  if (quizzesCompleted >= 4) badges++;
  if (totalCompleted === total) badges++;

  badgeCount.textContent = `${badges} Earned`;

  moduleList.innerHTML = `
    <h4 style="margin-bottom: 10px;">Modules</h4>
    ${modules.map((m) => `
      <div class="module-item">
        <span>${m.label}</span>
        <div class="status ${progress[m.key] ? "done" : "pending"}">
          ${progress[m.key] ? "✅ Completed" : "⏳ Not started"}
        </div>
      </div>
    `).join("")}

    <h4 style="margin: 20px 0 10px;">Quizzes</h4>
    ${quizzes.map((q) => `
      <div class="module-item">
        <span>${q.label}</span>
        <div class="status ${progress[q.key] ? "done" : "pending"}">
          ${progress[q.key] ? "✅ Completed" : "⏳ Not started"}
        </div>
      </div>
    `).join("")}
  `;

  badgesContainer.innerHTML = `
    <div class="badge-pill ${modulesCompleted >= 1 ? "earned" : "locked"}">🚀 Getting Started</div>
    <div class="badge-pill ${modulesCompleted >= 5 ? "earned" : "locked"}">📚 Module Master</div>
    <div class="badge-pill ${quizzesCompleted >= 4 ? "earned" : "locked"}">🛡️ Scam Spotter</div>
    <div class="badge-pill ${totalCompleted === total ? "earned" : "locked"}">🏆 CyberWise Champion</div>
  `;
}

// Handles saving profile changes — updates locally and then sends them to the server
function initProfileForm() {
  const profileForm = document.getElementById("profileForm");
  if (!profileForm) return;

  profileForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const updatedProfile = {
      name: document.getElementById("fullName")?.value.trim() || "Guest User",
      email: document.getElementById("emailAddress")?.value.trim() || "cyberwise@example.com",
      joined: document.getElementById("joinedInput")?.value.trim() || "April 2026"
    };

    saveProfileLocal(updatedProfile);

    const token = localStorage.getItem("cws_token");
    if (token) {
      try {
        await fetch("http://localhost:5001/api/profile", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(updatedProfile)
        });
      } catch (err) {
        console.error("Could not save profile to server:", err);
      }
    }

    await initProfileView();
    initUserNameDisplay();
    alert("Personal details updated successfully.");
  });
}

// Handles the change password form — checks the current password first before updating
function initPasswordForm() {
  const passwordForm = document.getElementById("passwordForm");
  if (!passwordForm) return;

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById("currentPassword")?.value.trim() || "";
    const newPassword = document.getElementById("newPassword")?.value.trim() || "";
    const confirmPassword = document.getElementById("confirmPassword")?.value.trim() || "";

    if (!currentPassword) {
      alert("Please enter your current password.");
      return;
    }

    if (newPassword.length < 6) {
      alert("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    const token = localStorage.getItem("cws_token");
    if (!token) {
      alert("You are not logged in.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5001/api/auth/change-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();

      if (res.ok) {
        alert("Password updated successfully!");
        passwordForm.reset();
      } else {
        alert(data.message || "Something went wrong.");
      }
    } catch (err) {
      console.error("Change password error:", err);
      alert("Could not connect to the server.");
    }
  });
}

// Sets up the reset progress button and the logout button — both optional on any page
function initOptionalButtons() {
  const resetProgress = document.getElementById("resetProgressBtn");

  if (resetProgress) {
    resetProgress.addEventListener("click", async () => {
      localStorage.removeItem(STORAGE_KEYS.userProgress);

      const token = localStorage.getItem("cws_token");
      if (token) {
        try {
          await fetch(`${API_URL}/api/progress`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              phoneScams: false,
              doorstepScams: false,
              relationshipScams: false,
              shoppingScams: false,
              quizCompleted: false,
              quizScore: 0
            })
          });
        } catch (err) {
          console.error("Could not reset progress on server:", err);
        }
      }

      alert("Progress reset.");
      location.reload();
    });
  }

  // Logout works on every page
  const logoutBtn = document.querySelector(".logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("cws_token");
      localStorage.removeItem("cws_user");
      window.location.href = "login.html";
    });
  }
}

// Wires up the chat form and quick-prompt chips to send messages to the server
function initChatbot() {
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const promptChips = document.querySelectorAll(".prompt-chip");
  const chatBody = document.getElementById("chatBody");

  if (!chatForm || !chatInput || !chatBody) return;

  async function sendMessage(userMessage) {
    if (!userMessage || !userMessage.trim()) return;

    addMessage(userMessage, "user");

    const token = localStorage.getItem("cws_token");

    try {
      const res = await fetch("http://localhost:5001/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({ message: userMessage })
      });

      const data = await res.json();

      if (res.ok && data.reply) {
        addMessage(data.reply, "assistant");
      } else {
        addMessage(data.reply || "Sorry, I could not get a response.", "assistant");
      }
    } catch (error) {
      console.error("Chatbot error:", error);
      addMessage("Sorry, the server is not responding.", "assistant");
    }
  }

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const userText = chatInput.value.trim();
    if (!userText) return;
    chatInput.value = "";
    await sendMessage(userText);
  });

  promptChips.forEach((chip) => {
    chip.addEventListener("click", async () => {
      const text = chip.textContent.trim();
      if (!text) return;
      await sendMessage(text);
    });
  });
}

// Lets the user upload an image and sends it off to be analysed for scam signs
function initImageAnalysis() {
  const imageInput = document.getElementById("imageInput");
  const uploadBtn = document.getElementById("uploadBtn");
  const chatBody = document.getElementById("chatBody");

  if (!imageInput || !uploadBtn || !chatBody) return;

  uploadBtn.addEventListener("click", async () => {
    const file = imageInput.files[0];

    if (!file) {
      addMessage("Please choose an image first.", "assistant");
      return;
    }

    addMessage("You uploaded an image.", "user");
    addMessage("Analysing your image...", "assistant");

    const formData = new FormData();
    formData.append("image", file);

    const token = localStorage.getItem("cws_token");

    try {
      const res = await fetch("http://localhost:5001/api/analyze-image", {
        method: "POST",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: formData
      });

      const data = await res.json();
      addMessage(data.reply || "No reply received.", "assistant");
    } catch (err) {
      console.error("Upload error:", err);
      addMessage("Sorry, the server is not responding.", "assistant");
    }
  });
}

// Maps each topic to the search terms we want to use for the Google News RSS feed
const topicQueries = {
  scam: ['"scam alert"', '"online scam"'],
  phishing: ["phishing"],
  fraud: ['"online fraud"'],
  identity: ['"identity theft"']
};

// Builds the RSS URL for whichever topic the user has selected
function buildGoogleNewsRssUrl(topicKey) {
  const terms = (topicQueries[topicKey] || topicQueries.scam).join(" OR ");
  return `https://news.google.com/rss/search?q=${encodeURIComponent(terms)}&hl=en-GB&gl=GB&ceid=GB:en`;
}

// Converts the RSS feed into JSON using the rss2json API
async function fetchRssAsJson(rssUrl) {
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
  const res = await fetch(api);
  return await res.json();
}

// Takes the list of news items and renders them into the news list on the page
function renderNews(items = []) {
  const newsList = $("#newsList");
  if (!newsList) return;

  newsList.innerHTML = items
    .slice(0, 10)
    .map((it) => `
      <article class="news-item">
        <a href="${it.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title)}</a>
        <div class="news-meta muted small">${formatDate(it.pubDate)}</div>
      </article>
    `)
    .join("");
}

// Fetches and renders the news feed, showing a fallback message if something goes wrong
async function loadNews(topicKey) {
  try {
    const rssUrl = buildGoogleNewsRssUrl(topicKey);
    const data = await fetchRssAsJson(rssUrl);
    renderNews(data.items || []);
  } catch (error) {
    console.error("News load error:", error);
    const newsList = $("#newsList");
    if (newsList) {
      newsList.innerHTML = "<p>Unable to load news right now.</p>";
    }
  }
}

// Sets up the news feed dropdown and loads the default topic straight away
function initNewsFeed() {
  const feedSelect = $("#feedSelect");
  if (!feedSelect) return;

  loadNews(feedSelect.value || "scam");
  feedSelect.addEventListener("change", () => loadNews(feedSelect.value));
}