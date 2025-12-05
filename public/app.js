/**
 * WABA Sandbox UI - React version
 *
 * This file converts the original DOM-driven UI into a small React SPA
 * mounted into #root, while keeping all backend APIs and payloads the same.
 */

// React globals come from the UMD bundles loaded in index.html
const { useState, useEffect, useMemo } = React;

// --- Shared utils (DOM-based toast kept for simplicity) ---
function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function getDefaultMedia(type) {
  if (type === "image") return "/media/sample-image.png";
  if (type === "document") return "/media/sample-document.pdf";
  if (type === "audio") return "/media/sample-audio.ogg";
  return "";
}

// --- API helpers ---
async function request(method, path, body, token) {
  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (token && token.trim()) {
      headers.Authorization = `Bearer ${token.trim()}`;
    }
    const opts = { method, headers };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: String(err) };
  }
}

function createApi(token) {
  return {
    get: (path) => request("GET", path, undefined, token),
    post: (path, body) => request("POST", path, body, token),
    put: (path, body) => request("PUT", path, body, token),
  };
}

// --- React components ---

function Sidebar({ activeTab, onTabChange }) {
  const tabs = [
    { id: "simulate", label: "Simulate" },
    { id: "templates", label: "Templates" },
    { id: "media", label: "Media" },
    { id: "numbers", label: "Phones" },
    { id: "config", label: "Settings" },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        WABA Sandbox
      </div>
      <nav className="sidebar-nav">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`nav-item ${activeTab === t.id ? "active" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function SimulateTab({
  api,
  phones,
  mediaFiles,
  authTokenPresent,
  config,
}) {
  const [simType, setSimType] = useState("text");
  const [from, setFrom] = useState(
    () => localStorage.getItem("sb:from") || ""
  );
  const [selectedPhoneId, setSelectedPhoneId] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [filename, setFilename] = useState("");
  const [voice, setVoice] = useState(false);
  const [statusMessageId, setStatusMessageId] = useState("");
  const [statusRecipientId, setStatusRecipientId] = useState("");
  const [statusStatus, setStatusStatus] = useState("sent");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    localStorage.setItem("sb:from", from || "");
  }, [from]);

  const handleSimTypeChange = (nextType) => {
    setSimType(nextType);
  };

  const handleQuickPhoneChange = (e) => {
    const id = e.target.value;
    setSelectedPhoneId(id);
    const match = phones.find((p) => p.id === id);
    if (match) {
      setFrom(match.displayPhoneNumber || "");
    }
  };

  const handleQuickPickMedia = (file) => {
    setMediaUrl(`/media/${file}`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Only require client token if auth mode is JWT
    if (config?.auth?.mode === "jwt" && !authTokenPresent) {
      showToast("Set a client token in Settings first", "error");
      return;
    }
    setSubmitting(true);
    try {
      const endpoint =
        simType === "text"
          ? "/simulate/message"
          : `/simulate/${simType}`;
      let payload;

      // Status updates – match /simulate/status payload
      if (simType === "status") {
        payload = {
          messageId: statusMessageId,
          recipientId: statusRecipientId,
          status: statusStatus,
        };
      } else {
        // Message types – match /simulate/<type> payloads
        // find phone id from selection or by matching display phone number
        let phoneId = selectedPhoneId || null;
        let displayPhoneNumber = from;

        // Try to resolve a registered phone for metadata
        let selectedPhone = null;
        if (!phoneId && from) {
          const match = phones.find(
            (p) => p.displayPhoneNumber === from
          );
          if (match) {
            phoneId = match.id;
            selectedPhone = match;
          }
        }
        if (!selectedPhone && phoneId) {
          selectedPhone = phones.find((p) => p.id === phoneId) || null;
        }
        if (selectedPhone && selectedPhone.displayPhoneNumber) {
          displayPhoneNumber = selectedPhone.displayPhoneNumber;
        }

        payload = {
          from,
          phoneNumberId: phoneId || undefined,
          displayPhoneNumber,
        };

        if (simType === "text") {
          payload.body = body;
        } else if (["image", "document", "audio"].includes(simType)) {
          payload.mediaUrl = mediaUrl || getDefaultMedia(simType);
          if (simType !== "audio") payload.caption = caption;
          if (simType === "document") payload.filename = filename;
          if (simType === "audio") payload.voice = voice;
        }
      }

      const res = await api.post(endpoint, payload);
      if (res.ok) {
        const fwdStatus = res.data && res.data.forwardStatus;
        if (fwdStatus && (fwdStatus < 200 || fwdStatus >= 300)) {
          showToast(
            `Simulated OK, but webhook failed (Status ${fwdStatus})`,
            "error"
          );
        } else {
          const label =
            simType.charAt(0).toUpperCase() + simType.slice(1);
          showToast(
            simType === "status"
              ? "Status sent!"
              : `${label} message sent!`,
            "success"
          );
        }
      } else {
        const msg =
          res.data && res.data.error
            ? res.data.error
            : "Unknown error";
        showToast(`Failed: ${msg}`, "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isMediaType = ["image", "document", "audio"].includes(simType);
  const showCommonFields = simType !== "status";

  return (
    <div className="tab-content active">
      <h2>Simulate Messages</h2>
      <div className="card">
        <div className="sim-type-selector" id="simTypeSelector">
          {["text", "image", "document", "audio", "status"].map((t) => (
            <div
              key={t}
              className={`sim-type-opt ${
                simType === t ? "active" : ""
              }`}
              onClick={() => handleSimTypeChange(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>

        <form id="unified-sim-form" onSubmit={handleSubmit}>
          {showCommonFields && (
            <div className="field-group active" id="common-fields">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                }}
              >
                <div>
                  <label htmlFor="simFrom">From (Phone)</label>
                  <input
                    id="simFrom"
                    name="from"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="5511999999999"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="simPhoneSelect">Quick Fill</label>
                  <select
                    id="simPhoneSelect"
                    value={selectedPhoneId}
                    onChange={handleQuickPhoneChange}
                  >
                    <option value="">Select registered...</option>
                    {phones.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayPhoneNumber} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {simType === "text" && (
            <div className="field-group active" data-for="text">
              <label htmlFor="simBody">Body</label>
              <textarea
                id="simBody"
                name="body"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hello there!"
              />
            </div>
          )}

          {isMediaType && (
            <>
              <div
                className="field-group active"
                data-for="image document audio"
              >
                <label htmlFor="simMediaUrl">Media URL</label>
                <input
                  id="simMediaUrl"
                  name="mediaUrl"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="http://..."
                />
                <div
                  id="media-quick-pick"
                  style={{
                    marginBottom: "1rem",
                    display: "flex",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  {mediaFiles.map((f) => (
                    <span
                      key={f}
                      style={{
                        background: "var(--bg-sidebar)",
                        border: "1px solid var(--border-color)",
                        padding: "2px 6px",
                        fontSize: "0.7rem",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                      onClick={() => handleQuickPickMedia(f)}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>

              {(simType === "image" || simType === "document") && (
                <div
                  className="field-group active"
                  data-for="image document"
                >
                  <label htmlFor="simCaption">Caption (Optional)</label>
                  <input
                    id="simCaption"
                    name="caption"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Check this out"
                  />
                </div>
              )}

              {simType === "document" && (
                <div
                  className="field-group active"
                  data-for="document"
                >
                  <label htmlFor="simFilename">Filename</label>
                  <input
                    id="simFilename"
                    name="filename"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                    placeholder="file.pdf"
                  />
                </div>
              )}

              {simType === "audio" && (
                <div className="field-group active" data-for="audio">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      id="simVoice"
                      name="voice"
                      style={{ width: "auto", margin: 0 }}
                      checked={voice}
                      onChange={(e) => setVoice(e.target.checked)}
                    />
                    Send as Voice Note (PTT)
                  </label>
                </div>
              )}
            </>
          )}

          {simType === "status" && (
            <div className="field-group active" data-for="status">
              <label htmlFor="statusMsgId">Message ID</label>
              <input
                id="statusMsgId"
                name="messageId"
                value={statusMessageId}
                onChange={(e) => setStatusMessageId(e.target.value)}
                placeholder="wamid.HB..."
              />

              <label htmlFor="statusRecipient">Recipient ID</label>
              <input
                id="statusRecipient"
                name="recipientId"
                value={statusRecipientId}
                onChange={(e) => setStatusRecipientId(e.target.value)}
                placeholder="5511999999999"
              />

              <label htmlFor="statusVal">Status</label>
              <select
                id="statusVal"
                name="status"
                value={statusStatus}
                onChange={(e) => setStatusStatus(e.target.value)}
              >
                <option value="sent">sent</option>
                <option value="delivered">delivered</option>
                <option value="read">read</option>
                <option value="failed">failed</option>
              </select>
            </div>
          )}

          <button
            type="submit"
            id="simSubmitBtn"
            disabled={submitting}
          >
            {simType === "status"
              ? submitting
                ? "Sending..."
                : "Send Status Update"
              : submitting
              ? "Sending..."
              : `Send ${
                  simType.charAt(0).toUpperCase() + simType.slice(1)
                } Message`}
          </button>
        </form>
      </div>
    </div>
  );
}

function TemplatesTab({ api, templates, onTemplatesReload, active }) {
  const [name, setName] = useState("");
  const [languageCode, setLanguageCode] = useState("en_US");
  const [category, setCategory] = useState("UTILITY");
  const [bodyText, setBodyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { name, languageCode, category, bodyText };
      const res = await api.post("/api/templates", payload);
      if (res.ok) {
        showToast("Template Created", "success");
        setName("");
        setLanguageCode("en_US");
        setCategory("UTILITY");
        setBodyText("");
        onTemplatesReload();
      } else {
        showToast("Error creating template", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!active) return null;

  return (
    <div className="tab-content active" id="tab-templates">
      <h2>Templates</h2>
      <div className="card">
        <h3>Create New</h3>
        <form id="template-form" onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <label htmlFor="tplName">Name</label>
              <input
                id="tplName"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="order_update"
                required
              />
            </div>
            <div>
              <label htmlFor="tplLang">Language</label>
              <input
                id="tplLang"
                name="languageCode"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                placeholder="en_US"
                required
              />
            </div>
          </div>
          <label htmlFor="tplCat">Category</label>
          <select
            id="tplCat"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="UTILITY">UTILITY</option>
            <option value="MARKETING">MARKETING</option>
            <option value="AUTHENTICATION">AUTHENTICATION</option>
          </select>
          <label htmlFor="tplBody">Body</label>
          <textarea
            id="tplBody"
            name="bodyText"
            rows={3}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Template"}
          </button>
        </form>
      </div>
      <div id="templates-list">
        {templates.map((t) => (
          <div key={t.name} className="card" style={{ padding: "1rem" }}>
            <div
              style={{
                fontWeight: "bold",
                color: "var(--accent-color)",
              }}
            >
              {t.name}
            </div>
            <div className="chat-meta">
              {t.languageCode} • {t.category}
            </div>
            <div
              style={{
                fontSize: "0.85rem",
                marginTop: "0.5rem",
              }}
            >
              {t.bodyText}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaTab({ api, mediaFiles, onMediaReload, active }) {
  const [mediaUrl, setMediaUrlInput] = useState("");
  const [mediaFilename, setMediaFilename] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post("/api/media/fetch", {
        url: mediaUrl,
        filename: mediaFilename || undefined,
      });
      if (res.ok) {
        showToast("Media Hosted", "success");
        setMediaUrlInput("");
        setMediaFilename("");
        onMediaReload();
      } else {
        showToast("Fetch Failed", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!active) return null;

  return (
    <div className="tab-content active" id="tab-media">
      <h2>Media Assets</h2>
      <div className="card">
        <h3>Fetch Remote File</h3>
        <form id="media-fetch-form" onSubmit={handleSubmit}>
          <label>URL</label>
          <input
            name="mediaUrl"
            value={mediaUrl}
            onChange={(e) => setMediaUrlInput(e.target.value)}
            placeholder="https://..."
            required
          />
          <label>Save as Filename (optional)</label>
          <input
            name="mediaFilename"
            value={mediaFilename}
            onChange={(e) => setMediaFilename(e.target.value)}
            placeholder="my-file.pdf"
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Fetching..." : "Fetch & Host"}
          </button>
        </form>
      </div>
      <h3>Local Library</h3>
      <div id="media-library-list">
        {mediaFiles.map((f) => {
          const url = `/media/${f}`;
          return (
            <div
              key={f}
              className="card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem 1rem",
              }}
            >
              <span>{f}</span>
              <button
                type="button"
                className="small secondary"
                onClick={() => {
                  navigator.clipboard
                    .writeText(window.location.origin + url)
                    .then(() => showToast("URL Copied"));
                }}
              >
                Copy URL
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NumbersTab({ api, phones, onPhonesReload, active }) {
  const [phoneId, setPhoneId] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post("/api/phone-numbers", {
        id: phoneId,
        displayPhoneNumber: phoneDisplay,
      });
      if (res.ok) {
        showToast("Phone Registered", "success");
        setPhoneId("");
        setPhoneDisplay("");
        onPhonesReload();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!active) return null;

  return (
    <div className="tab-content active" id="tab-numbers">
      <h2>Phone Numbers</h2>
      <div className="card">
        <h3>Register Phone</h3>
        <form id="phone-form" onSubmit={handleSubmit}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <label>Phone ID</label>
              <input
                name="phoneId"
                value={phoneId}
                onChange={(e) => setPhoneId(e.target.value)}
                required
                placeholder="100..."
              />
            </div>
            <div>
              <label>Display Name</label>
              <input
                name="phoneDisplay"
                value={phoneDisplay}
                onChange={(e) => setPhoneDisplay(e.target.value)}
                required
                placeholder="+1 555..."
              />
            </div>
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Registering..." : "Register"}
          </button>
        </form>
      </div>
      <div id="phones-list">
        {phones.map((p) => (
          <div
            key={p.id}
            className="card"
            style={{ padding: "0.75rem" }}
          >
            <div style={{ fontWeight: "bold" }}>
              {p.displayPhoneNumber}
            </div>
            <div className="chat-meta">ID: {p.id}</div>
            {p.wabaId && (
              <div className="chat-meta">WABA: {p.wabaId}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfigTab({
  api,
  config,
  setConfig,
  authToken,
  setAuthToken,
  active,
}) {
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  if (!active) return null;

  const handleChange = (field, value) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            [field]: value,
          }
        : prev
    );
  };

  const handleAuthChange = (field, value) => {
    setConfig((prev) =>
      prev
        ? {
            ...prev,
            auth: {
              ...prev.auth,
              [field]: value,
            },
          }
        : prev
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      const payload = {
        targetWebhookUrl: config.targetWebhookUrl || null,
        verifyToken: config.verifyToken,
        webhookAppSecret: config.webhookAppSecret || null,
        auth: {
          mode: config.auth.mode,
          jwtIssuer: config.auth.jwtIssuer,
          jwtAudience: config.auth.jwtAudience,
          jwtSecret: config.auth.jwtSecret,
        },
      };
      const res = await api.put("/api/config", payload);
      if (res.ok) {
        showToast("Settings Saved", "success");
      } else {
        showToast("Save Failed", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateToken = async () => {
    setGenerating(true);
    try {
      const res = await api.post("/api/auth/token", {});
      if (res.ok && res.data && res.data.token) {
        setAuthToken(res.data.token);
        localStorage.setItem("sb:token", res.data.token);
        showToast("Token Generated", "success");
      } else {
        showToast("Failed to generate token", "error");
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="tab-content active" id="tab-config">
      <h2>Settings</h2>
      <div className="card">
        <form id="config-form" onSubmit={handleSubmit}>
          <label>Target Webhook URL</label>
          <input
            name="targetWebhookUrl"
            value={config?.targetWebhookUrl || ""}
            onChange={(e) =>
              handleChange("targetWebhookUrl", e.target.value)
            }
            placeholder="http://localhost:4000/webhook"
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <div>
              <label>Verify Token</label>
              <input
                name="verifyToken"
                value={config?.verifyToken || ""}
                onChange={(e) =>
                  handleChange("verifyToken", e.target.value)
                }
                placeholder="token"
              />
            </div>
            <div>
              <label>App Secret (HMAC)</label>
              <input
                name="webhookAppSecret"
                type="password"
                value={config?.webhookAppSecret || ""}
                onChange={(e) =>
                  handleChange("webhookAppSecret", e.target.value)
                }
                placeholder="secret"
              />
            </div>
          </div>

          <h3>Authentication (JWT)</h3>
          <label>Mode</label>
          <select
            name="authMode"
            value={config?.auth.mode || "none"}
            onChange={(e) => handleAuthChange("mode", e.target.value)}
          >
            <option value="none">None</option>
            <option value="jwt">JWT Bearer</option>
          </select>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: "1rem",
            }}
          >
            <input
              name="jwtIssuer"
              value={config?.auth.jwtIssuer || ""}
              onChange={(e) =>
                handleAuthChange("jwtIssuer", e.target.value)
              }
              placeholder="Issuer"
            />
            <input
              name="jwtAudience"
              value={config?.auth.jwtAudience || ""}
              onChange={(e) =>
                handleAuthChange("jwtAudience", e.target.value)
              }
              placeholder="Audience"
            />
            <input
              name="jwtSecret"
              type="password"
              value={config?.auth.jwtSecret || ""}
              onChange={(e) =>
                handleAuthChange("jwtSecret", e.target.value)
              }
              placeholder="Secret"
            />
          </div>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>Client Token</h3>
        <input
          id="clientAuthToken"
          placeholder="Bearer Token"
          value={authToken}
          onChange={(e) => {
            const v = e.target.value;
            setAuthToken(v);
            localStorage.setItem("sb:token", v.trim());
          }}
        />
        <button
          type="button"
          id="generateTokenButton"
          className="secondary"
          disabled={generating}
          onClick={handleGenerateToken}
        >
          {generating ? "Generating..." : "Generate New Token"}
        </button>
      </div>
    </div>
  );
}

function TrafficSidebar({ events, statusText, showJson, setShowJson }) {
  return (
    <aside className="traffic-sidebar">
      <div className="traffic-header">
        <span>Live Traffic</span>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            fontWeight: 400,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            id="json-toggle"
            style={{ width: "auto", margin: 0 }}
            checked={showJson}
            onChange={(e) => setShowJson(e.target.checked)}
          />
          JSON
        </label>
      </div>
      <div
        id="events-status"
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.75rem",
          color:
            statusText === "• Connected"
              ? "#22c55e"
              : statusText === "• Disconnected"
              ? "#ef4444"
              : "var(--text-secondary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        {statusText}
      </div>
      <div id="events-list" className="events-list">
        {events.map((evt) => {
          const time = new Date(evt.timestamp).toLocaleTimeString();
          const payload = evt.payload || {};
          let type = evt.type;
          let summary = "";
          if (payload.entry) {
            const msg =
              payload.entry[0]?.changes[0]?.value?.messages?.[0];
            if (msg) {
              type = msg.type;
              summary = msg.text?.body || `[${msg.type}]`;
            }
          } else if (evt.type === "graph.message") {
            const sender = payload.sender || "client";
            const to = payload.to ? ` → ${payload.to}` : "";
            summary = `Graph /messages from ${sender}${to}`;
            type = payload.type || type;
          }
          const directionClass = evt.direction || "system";
          return (
            <div key={evt.id} className="">
              <div className={`chat-bubble ${directionClass}`}>
                <div className="chat-meta">
                  <span>{(evt.direction || "sys").toUpperCase()}</span>
                  <span>{time}</span>
                </div>
                <div style={{ wordBreak: "break-word" }}>
                  {summary || type}
                </div>
                <div
                  className={`event-json ${
                    showJson ? "" : "json-hidden"
                  }`}
                >
                  {JSON.stringify(evt.payload, null, 2)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("simulate");
  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem("sb:token") || ""
  );
  const api = useMemo(() => createApi(authToken), [authToken]);

  const [config, setConfig] = useState(null);
  const [phones, setPhones] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [mediaFiles, setMediaFiles] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventsStatusText, setEventsStatusText] = useState("Connecting...");
  const [showJson, setShowJson] = useState(false);

  // Load config and data when we have a token
  useEffect(() => {
    if (!authToken) return;

    (async () => {
      const cfg = await api.get("/api/config");
      if (cfg.ok && cfg.data) {
        setConfig(cfg.data);
      }

      const ph = await api.get("/api/phone-numbers");
      if (ph.ok && ph.data && ph.data.phone_numbers) {
        setPhones(ph.data.phone_numbers);
      }

      const t = await api.get("/api/templates");
      if (t.ok && t.data && t.data.templates) {
        setTemplates(t.data.templates);
      }

      const m = await api.get("/api/media/list");
      if (m.ok && m.data && m.data.files) {
        setMediaFiles(m.data.files);
      }
    })();
  }, [authToken, api]);

  const reloadPhones = async () => {
    const ph = await api.get("/api/phone-numbers");
    if (ph.ok && ph.data && ph.data.phone_numbers) {
      setPhones(ph.data.phone_numbers);
    }
  };

  const reloadTemplates = async () => {
    const t = await api.get("/api/templates");
    if (t.ok && t.data && t.data.templates) {
      setTemplates(t.data.templates);
    }
  };

  const reloadMedia = async () => {
    const m = await api.get("/api/media/list");
    if (m.ok && m.data && m.data.files) {
      setMediaFiles(m.data.files);
    }
  };

  // Events stream (SSE)
  useEffect(() => {
    const es = new EventSource("/api/events/stream");
    es.onopen = () => {
      setEventsStatusText("• Connected");
    };
    es.onerror = () => {
      setEventsStatusText("• Disconnected");
    };
    es.addEventListener("event", (e) => {
      try {
        const parsed = JSON.parse(e.data);
        setEvents((prev) => {
          const next = [{ ...parsed, id: parsed.id || `${Date.now()}-${Math.random()}` }, ...prev];
          return next.slice(0, 50);
        });
      } catch {
        // ignore malformed
      }
    });
    return () => es.close();
  }, []);

  const authTokenPresent = !!authToken && authToken.trim().length > 0;

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="main-content">
        {activeTab === "simulate" && (
          <SimulateTab
            api={api}
            phones={phones}
            mediaFiles={mediaFiles}
            authTokenPresent={authTokenPresent}
            config={config}
          />
        )}
        <TemplatesTab
          api={api}
          templates={templates}
          onTemplatesReload={reloadTemplates}
          active={activeTab === "templates"}
        />
        <MediaTab
          api={api}
          mediaFiles={mediaFiles}
          onMediaReload={reloadMedia}
          active={activeTab === "media"}
        />
        <NumbersTab
          api={api}
          phones={phones}
          onPhonesReload={reloadPhones}
          active={activeTab === "numbers"}
        />
        <ConfigTab
          api={api}
          config={config}
          setConfig={setConfig}
          authToken={authToken}
          setAuthToken={setAuthToken}
          active={activeTab === "config"}
        />
      </main>

      <TrafficSidebar
        events={events}
        statusText={eventsStatusText}
        showJson={showJson}
        setShowJson={setShowJson}
      />
    </div>
  );
}

// Mount React app
const rootEl = document.getElementById("root");
if (rootEl) {
  const root = ReactDOM.createRoot
    ? ReactDOM.createRoot(rootEl)
    : null;
  if (root) {
    root.render(<App />);
  } else {
    // Fallback for older ReactDOM versions
    ReactDOM.render(<App />, rootEl);
  }
}
