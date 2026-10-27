// ============================================================
// KhetGPT Floating Chat Widget
// Injected into every page. Talks to the /chat orchestrator
// endpoint so farmers can ask anything from any page, including
// uploading a leaf photo for diagnosis directly in the chat.
// ============================================================

(function () {
  const API_BASE = "http://127.0.0.1:8000";

  const fab = document.createElement("button");
  fab.className = "chat-fab";
  fab.id = "chatFab";
  fab.setAttribute("aria-label", "Open chat");
  fab.textContent = "💬";
  document.body.appendChild(fab);

  const panel = document.createElement("div");
  panel.className = "chat-panel";
  panel.id = "chatPanel";
  panel.innerHTML = `
    <div class="chat-panel-header">
      <span>🌾 Ask KhetGPT</span>
      <button class="chat-panel-close" id="chatPanelClose" aria-label="Close chat">✕</button>
    </div>
    <div class="chat-panel-messages" id="chatPanelMessages">
      <div class="chat-msg system">Ask about weather, mandi prices, schemes, or send a leaf photo — in Hindi, English, or Hinglish.</div>
    </div>
    <div class="chat-panel-input">
      <input type="file" id="chatFileInput" accept="image/*" style="display:none">
      <button id="chatUploadBtn" title="Send a photo" aria-label="Send a photo">📷</button>
      <button id="chatMicBtn" title="Speak" aria-label="Speak">🎤</button>
      <input type="text" id="chatPanelInput" placeholder="Type your question...">
      <button id="chatSendBtn" title="Send" aria-label="Send">➤</button>
    </div>
  `;
  document.body.appendChild(panel);

  const messagesEl = document.getElementById("chatPanelMessages");
  const inputEl = document.getElementById("chatPanelInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const micBtn = document.getElementById("chatMicBtn");
  const closeBtn = document.getElementById("chatPanelClose");
  const uploadBtn = document.getElementById("chatUploadBtn");
  const fileInput = document.getElementById("chatFileInput");
  let conversationHistory = [];

  fab.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("open");
    fab.classList.toggle("open", isOpen);
    fab.textContent = isOpen ? "✕" : "💬";
    if (isOpen) inputEl.focus();
  });
  closeBtn.addEventListener("click", () => {
    panel.classList.remove("open");
    fab.classList.remove("open");
    fab.textContent = "💬";
  });

  function addMsg(text, cls) {
    const div = document.createElement("div");
    div.className = "chat-msg " + cls;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function addImageMsg(imageUrl) {
    const div = document.createElement("div");
    div.className = "chat-msg user";
    div.innerHTML = `<img src="${imageUrl}" alt="Uploaded leaf" style="max-width:160px; border-radius:4px; display:block;">`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addTyping() {
    const div = document.createElement("div");
    div.className = "chat-typing";
    div.id = "chatTyping";
    div.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  function removeTyping() {
    const el = document.getElementById("chatTyping");
    if (el) el.remove();
  }

  function pushHistory(userText, botText) {
    conversationHistory.push({ role: "user", content: userText });
    conversationHistory.push({ role: "assistant", content: botText });
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
  }

  async function sendMessage(prefill) {
    const message = (prefill !== undefined ? prefill : inputEl.value).trim();
    if (!message) return;
    addMsg(message, "user");
    inputEl.value = "";
    addTyping();

    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: conversationHistory })
      });
      const data = await res.json();
      removeTyping();
      const reply = data.response || "(no response)";
      addMsg(reply, "bot");
      pushHistory(message, reply);
    } catch {
      removeTyping();
      addMsg("Connection error — is the backend running on port 8000?", "system");
    }
  }

  async function sendImage(file) {
    const imageUrl = URL.createObjectURL(file);
    addImageMsg(imageUrl);
    addTyping();

    const formData = new FormData();
    formData.append("file", file);

    try {
      const diagRes = await fetch(API_BASE + "/diagnose", { method: "POST", body: formData });
      const diagData = await diagRes.json();
      const top = diagData.predictions[0];
      const pct = Math.round(top.confidence * 100);
      const label = top.class.replace(/_/g, " ");

      let medText = "";
      try {
        const medRes = await fetch(`${API_BASE}/medicine/${top.class}`);
        const med = await medRes.json();
        if (!med.needs_treatment) {
          medText = `\n\n✅ ${med.message}`;
        } else if (med.purchase_link) {
          medText = `\n\n💊 Suggested treatment: ${med.treatment}\n🛒 ${med.purchase_link}`;
        } else if (med.treatment) {
          medText = `\n\n💊 Suggested treatment: ${med.treatment}`;
        }
      } catch { /* skip medicine if it fails */ }

      removeTyping();
      const replyText = `Diagnosis: ${label} (${pct}% confidence)${medText}`;
      addMsg(replyText, "bot");

      // Add to conversation history as plain text so follow-up questions
      // ("iske liye aur dawa?") have the diagnosed disease as context.
      pushHistory(
        `[User uploaded a crop leaf photo]`,
        `Diagnosis result: ${label} (${pct}% confidence).${medText.replace(/\n\n/g, " ")}`
      );
    } catch {
      removeTyping();
      addMsg("Could not analyze the photo — is the backend running on port 8000?", "system");
    }
  }

  sendBtn.addEventListener("click", () => sendMessage());
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });

  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      sendImage(e.target.files[0]);
      fileInput.value = "";
    }
  });

  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognitionAPI) {
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "hi-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    let listening = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map(r => r[0].transcript).join("");
      inputEl.value = transcript;
      if (event.results[event.results.length - 1].isFinal) {
        micBtn.classList.remove("mic-active");
        listening = false;
        sendMessage();
      }
    };
    recognition.onerror = () => { micBtn.classList.remove("mic-active"); listening = false; };
    recognition.onend = () => { micBtn.classList.remove("mic-active"); listening = false; };

    micBtn.addEventListener("click", () => {
      if (listening) { recognition.stop(); return; }
      inputEl.value = "";
      try { recognition.start(); micBtn.classList.add("mic-active"); listening = true; } catch (e) {}
    });
  } else {
    micBtn.disabled = true;
    micBtn.title = "Voice input not supported in this browser";
  }
})();
