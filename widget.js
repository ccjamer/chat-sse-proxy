(async function() {
  const currentScript = document.currentScript || document.querySelector('script[data-client-id]');
  const clientId = currentScript ? currentScript.getAttribute('data-client-id') : null;

  if (!clientId) {
    console.error('Unikiq Widget: Mangler data-client-id attribute.');
    return;
  }

  try {
    // 1. Hent klients konfiguration fra n8n / PostgreSQL
    let config = {};
    try {
      const configRes = await fetch('https://n8n.unikiq.dk/webhook/get-config?client_id=' + clientId);
      if (configRes.ok) {
        config = await configRes.json();
      }
    } catch (e) {
      console.warn('Unikiq Widget: Kunne ikke hente klient-config, bruger standardværdier.', e);
    }

    if (config.active === false) {
      console.warn('Unikiq Widget: Klient er inaktiv.');
      return;
    }

    const brandColor = config.brand_color || '#2563eb';
    const logoUrl = config.logo_url || '';
    const titleText = config.title || 'UnikIQ AI Assistent';
    const welcomeMsg = config.welcome_msg || 'Hej! 👋 Hvad kan vi hjælpe dig med i dag?';

    // Sikr unikt Session ID pr. klient
    let sessionId = localStorage.getItem('unikiq_session_' + clientId);
    if (!sessionId) {
      sessionId = 'session_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('unikiq_session_' + clientId, sessionId);
    }

    const style = document.createElement('style');
    style.innerHTML = `
      :root {
        --unikiq-brand: ${brandColor};
        --unikiq-bg: #FFFFFF;
        --unikiq-subtle: #F4F4F5;
        --unikiq-text: #18181B;
        --unikiq-muted: #71717A;
        --unikiq-border: #E4E4E7;
        --unikiq-radius: 20px;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; }

      #unikiq-launcher {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background-color: var(--unikiq-brand);
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        transition: transform 0.2s ease;
      }

      #unikiq-launcher:hover { transform: scale(1.05); }

      #unikiq-widget {
        position: fixed;
        bottom: 92px;
        right: 24px;
        width: 400px;
        height: 640px;
        max-width: calc(100vw - 32px);
        max-height: calc(100vh - 120px);
        background: var(--unikiq-bg);
        border-radius: var(--unikiq-radius);
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 99999;
        border: 1px solid var(--unikiq-border);
      }

      .cb-header {
        height: 64px;
        background: linear-gradient(0deg, rgba(255, 255, 255, 0) 29.14%, rgba(255, 255, 255, 0.16) 100%), var(--unikiq-brand);
        color: white;
        padding: 0 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }

      .cb-header-info { display: flex; align-items: center; gap: 12px; }

      .cb-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        object-fit: cover;
      }

      .cb-title { font-size: 14px; font-weight: 600; }
      .cb-header-actions { display: flex; align-items: center; gap: 4px; }

      .cb-icon-btn {
        background: transparent;
        border: none;
        color: white;
        opacity: 0.8;
        cursor: pointer;
        padding: 6px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .cb-icon-btn:hover { opacity: 1; }

      .cb-menu {
        position: absolute;
        top: 56px;
        right: 20px;
        background: white;
        border: 1px solid var(--unikiq-border);
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1);
        display: none;
        flex-direction: column;
        padding: 6px;
        z-index: 100;
        width: 160px;
      }

      .cb-menu button {
        background: none;
        border: none;
        padding: 8px 12px;
        text-align: left;
        font-size: 13px;
        color: var(--unikiq-text);
        cursor: pointer;
        border-radius: 6px;
      }

      .cb-menu button:hover { background: var(--unikiq-subtle); }

      .cb-messages {
        flex: 1;
        padding: 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background-color: #FAFAFA;
      }

      .cb-bubble {
        max-width: 85%;
        padding: 12px 16px;
        border-radius: var(--unikiq-radius);
        font-size: 14px;
        line-height: 1.5;
        word-break: break-word;
      }

      .cb-bubble.bot {
        background-color: var(--unikiq-subtle);
        color: var(--unikiq-text);
        align-self: flex-start;
      }

      .cb-bubble.user {
        background-color: var(--unikiq-brand);
        color: white;
        align-self: flex-end;
      }

      .cb-footer { padding: 0 16px 16px 16px; background: white; }

      .cb-brand {
        text-align: center;
        font-size: 11px;
        color: var(--unikiq-muted);
        margin-bottom: 8px;
        margin-top: 8px;
      }

      .cb-brand a { color: var(--unikiq-muted); text-decoration: none; font-weight: 500; }

      .cb-gdpr {
        background: var(--unikiq-subtle);
        border-radius: 12px 12px 0 0;
        padding: 8px 12px;
        font-size: 11px;
        color: var(--unikiq-muted);
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .cb-gdpr a { color: var(--unikiq-brand); text-decoration: underline; cursor: pointer; }
      .cb-gdpr-close { background: none; border: none; cursor: pointer; color: var(--unikiq-muted); font-size: 14px; }

      .cb-input-box {
        border: 1.5px solid var(--unikiq-border);
        border-radius: 24px;
        padding: 6px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: white;
      }

      .cb-input-box:focus-within { border-color: var(--unikiq-brand); }

      .cb-textarea {
        flex: 1;
        border: none;
        outline: none;
        resize: none;
        height: 24px;
        max-height: 100px;
        font-size: 14px;
        color: var(--unikiq-text);
      }

      .cb-action-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--unikiq-muted);
        padding: 4px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .cb-action-btn:hover { color: var(--unikiq-text); }

      .cb-send-btn {
        background: var(--unikiq-brand);
        color: white;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);

    const avatarHtml = logoUrl 
      ? `<img src="${logoUrl}" class="cb-avatar" alt="Logo" />` 
      : `<div class="cb-avatar">${titleText.charAt(0).toUpperCase()}</div>`;

    const widgetWrapper = document.createElement('div');
    widgetWrapper.id = 'unikiq-widget-wrapper';
    widgetWrapper.innerHTML = `
      <button id="unikiq-launcher">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
      </button>

      <div id="unikiq-widget">
        <div class="cb-header">
          <div class="cb-header-info">
            ${avatarHtml}
            <div class="cb-title">${titleText}</div>
          </div>
          <div class="cb-header-actions">
            <button class="cb-icon-btn" id="cb-menu-toggle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
            </button>
            <button class="cb-icon-btn" id="cb-close-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div id="cb-menu" class="cb-menu">
          <button id="cb-reset-btn">Start ny chat</button>
        </div>

        <div class="cb-messages" id="cb-messages">
          <div class="cb-bubble bot">${welcomeMsg}</div>
        </div>

        <div class="cb-footer">
          <div class="cb-gdpr" id="cb-gdpr">
            <span>Ved at chatte accepterer du vores <a id="cb-privacy-link">privatlivspolitik</a>.</span>
            <button class="cb-gdpr-close" id="cb-gdpr-close">&times;</button>
          </div>

          <div class="cb-input-box">
            <button class="cb-action-btn" id="cb-file-btn" title="Vedhæft fil">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <input type="file" id="cb-file-input" style="display:none;" />

            <textarea id="cb-input" class="cb-textarea" placeholder="Skriv din besked..." rows="1"></textarea>

            <button class="cb-action-btn" id="cb-mic-btn" title="Tale-til-tekst">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>

            <button class="cb-send-btn" id="cb-send-btn" title="Send besked">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </div>

          <div class="cb-brand">
            Powered by <a href="https://unikiq.dk" target="_blank">UnikIQ</a>
          </div>
        </div>

        <div id="cb-privacy-modal" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); backdrop-filter:blur(3px); z-index:200; align-items:center; justify-content:center; padding:16px;">
          <div style="background:white; border-radius:16px; padding:20px; max-height:90%; overflow-y:auto; font-size:12px; color:#18181B; line-height:1.5; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
            <h4 style="font-size:14px; margin-bottom:8px; color:#0f172a; font-weight:700;">AI-Information & Privatliv</h4>
            <p style="margin-bottom:8px;"><strong>1. Automatiseret AI:</strong> Du chatter med en kunstig intelligens (AI-assistent). Svar er vejledende.</p>
            <p style="margin-bottom:8px;"><strong>2. Databehandling:</strong> Din samtale logges midlertidigt for at besvare dine henvendelser og give dig den bedste support.</p>
            <p style="margin-bottom:12px;"><strong>3. Sikkerhed & GDPR:</strong> Dine oplysninger behandles fortroligt og sælges/deles aldrig. Data anvendes ikke til at træne offentlige AI-modeller.</p>
            <button id="cb-close-privacy-modal" style="width:100%; background:var(--unikiq-brand); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-weight:600;">Forstået</button>
          </div>
        </div>

      </div>
    `;
    document.body.appendChild(widgetWrapper);

    const launcher = document.getElementById('unikiq-launcher');
    const widget = document.getElementById('unikiq-widget');
    const closeBtn = document.getElementById('cb-close-btn');
    const menuToggle = document.getElementById('cb-menu-toggle');
    const menu = document.getElementById('cb-menu');
    const resetBtn = document.getElementById('cb-reset-btn');
    const gdprClose = document.getElementById('cb-gdpr-close');
    const gdprBanner = document.getElementById('cb-gdpr');
    const messagesContainer = document.getElementById('cb-messages');
    const inputArea = document.getElementById('cb-input');
    const sendBtn = document.getElementById('cb-send-btn');
    const micBtn = document.getElementById('cb-mic-btn');
    const fileBtn = document.getElementById('cb-file-btn');
    const fileInput = document.getElementById('cb-file-input');

    const privacyLink = document.getElementById('cb-privacy-link');
    const privacyModal = document.getElementById('cb-privacy-modal');
    const closePrivacyModal = document.getElementById('cb-close-privacy-modal');

    const toggleWidget = () => {
      const isOpen = widget.style.display === 'flex';
      widget.style.display = isOpen ? 'none' : 'flex';
    };

    launcher.addEventListener('click', toggleWidget);
    closeBtn.addEventListener('click', toggleWidget);

    menuToggle.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
    });

    gdprClose.addEventListener('click', () => {
      gdprBanner.style.display = 'none';
    });

    privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      privacyModal.style.display = 'flex';
    });

    closePrivacyModal.addEventListener('click', () => {
      privacyModal.style.display = 'none';
    });

    // Start ny chat: Generer nyt session ID
    resetBtn.addEventListener('click', () => {
      sessionId = 'session_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('unikiq_session_' + clientId, sessionId);
      messagesContainer.innerHTML = `<div class="cb-bubble bot">${welcomeMsg}</div>`;
      menu.style.display = 'none';
    });

    const parseMarkdown = (text) => {
      return text
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/\n/g, '<br>');
    };

    const appendMessage = (text, type) => {
      const div = document.createElement('div');
      const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
      div.id = id;
      div.className = `cb-bubble ${type}`;
      div.innerHTML = type === 'bot' ? parseMarkdown(text) : text;
      messagesContainer.appendChild(div);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return id;
    };

    const sendMessage = async () => {
      const text = inputArea.value.trim();
      if (!text) return;

      appendMessage(text, 'user');
      inputArea.value = '';

      const botMsgId = appendMessage('', 'bot');
      const botMsgEl = document.getElementById(botMsgId);

      try {
        const response = await fetch('https://www.stream.unikiq.dk/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientId,
            sessionId: sessionId, // <--- OPDATERET: SENDER DET UNIKKE SESSION ID
            message: text
          })
        });

        if (!response.ok) throw new Error('Netværksfejl');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullBotMessage = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.replace('data: ', '');
              if (data === '[DONE]') break;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  fullBotMessage += parsed.text;
                  botMsgEl.innerHTML = parseMarkdown(fullBotMessage);
                  messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        console.error('Streaming fejl:', err);
        botMsgEl.innerText = 'Fejl i forbindelse til serveren.';
      }
    };

    sendBtn.addEventListener('click', sendMessage);

    inputArea.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    micBtn.addEventListener('click', () => {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Tale-til-tekst understøttes ikke i denne browser.');
        return;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = 'da-DK';

      micBtn.style.color = '#EF4444';

      recognition.onresult = (e) => {
        inputArea.value = e.results[0][0].transcript;
        micBtn.style.color = '';
      };

      recognition.onerror = () => { micBtn.style.color = ''; };
      recognition.start();
    });

    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        appendMessage('📎 Vedhæftede fil: ' + file.name, 'user');
      }
    });

  } catch (err) {
    console.error('Unikiq Widget fejl:', err);
  }
})();
