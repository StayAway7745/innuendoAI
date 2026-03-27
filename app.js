// ========================================
// STATE MANAGEMENT
// ========================================

let projectState = {
    project: { brief_originale: '' },
    project_context: {},
    product: {},
    target: {},
    competitors: {},
    swot: {},
    naming: {},
    copywriting: {},
    prezzo: {},
    adv: {},
    risk_analysis: {}
};

let config = {
    apiKey: '',
    model: 'arcee-ai/trinity-large-preview:free',
    num_hypotheses: 3,
    project_scale: 'PMI',
    num_personas: 2,
    num_competitor: 3,
    num_copy_variants: 3,
    num_adv_solutions: 2,
    budget_totale: '5000'
};

let completedTools = new Set();

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    updateToolCards();
    
    // Load brief if exists
    if (projectState.project.brief_originale) {
        document.getElementById('briefInput').value = projectState.project.brief_originale;
    }
});

function loadFromLocalStorage() {
    // Load config
    const savedApiKey = localStorage.getItem('innuendoai_api_key');
    const savedModel = localStorage.getItem('innuendoai_model');
    
    if (savedApiKey) config.apiKey = savedApiKey;
    if (savedModel) config.model = savedModel;
    
    // Load project state
    const savedState = localStorage.getItem('innuendoai_project_state');
    if (savedState) {
        try {
            projectState = JSON.parse(savedState);
            updateCompletedTools();
        } catch (e) {
            console.error('Error loading state:', e);
        }
    }
}

function refreshProjectStateFromStorage() {
    const savedState = localStorage.getItem('innuendoai_project_state');
    if (!savedState) return;
    try {
        projectState = JSON.parse(savedState);
        updateCompletedTools();
    } catch (e) {
        console.error('Error refreshing state:', e);
    }
}

function saveToLocalStorage() {
    localStorage.setItem('innuendoai_project_state', JSON.stringify(projectState));
}

function updateCompletedTools() {
    completedTools.clear();
    
    if (projectState.product?.problema) completedTools.add('development');
    if (projectState.target?.analisi_area) completedTools.add('target');
    if (projectState.competitors?.analisi_segmento) completedTools.add('competitors');
    if (projectState.swot?.pestel) completedTools.add('swot');
    if (projectState.naming?.scelta_finale?.nome_scelto) completedTools.add('naming');
    if (projectState.copywriting?.copy_variants?.length) completedTools.add('copywriting');
    if (projectState.prezzo?.fasce?.length) completedTools.add('pricing');
    if (projectState.adv?.campagne?.length) completedTools.add('adv');
    if (projectState.risk_analysis?.scenario_fallimento) completedTools.add('risk');
    
    updateToolCards();
}

function updateToolCards() {
    document.querySelectorAll('.tool-card[data-tool]').forEach(card => {
        const toolName = card.getAttribute('data-tool');
        if (completedTools.has(toolName)) {
            card.classList.add('completed');
            setToolButtonState(toolName, 'done');
        } else {
            card.classList.remove('completed');
            setToolButtonState(toolName, 'idle');
        }
    });
}

function refreshConfigFromStorage() {
    const savedApiKey = localStorage.getItem('innuendoai_api_key');
    const savedModel = localStorage.getItem('innuendoai_model');
    if (savedApiKey) config.apiKey = savedApiKey;
    if (savedModel) config.model = savedModel;
}

// ========================================
// UI FUNCTIONS
// ========================================

function adjustSpin(tool, delta) {
    const spinElement = document.getElementById(`spin-${tool}`);
    let current = parseInt(spinElement.textContent);
    current = Math.max(1, Math.min(10, current + delta));
    spinElement.textContent = current;
    
    // Update config
    if (tool === 'development') config.num_hypotheses = current;
    if (tool === 'target') config.num_personas = current;
    if (tool === 'competitors') config.num_competitor = current;
    if (tool === 'copywriting') config.num_copy_variants = current;
    if (tool === 'adv') config.num_adv_solutions = current;
}

function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById('theme-icon');
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    body.setAttribute('data-theme', newTheme);
    icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    
    localStorage.setItem('innuendoai_theme', newTheme);
}

function showSettings() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const apiKeyInput = document.getElementById('api-key');
    const modelInput = document.getElementById('model-input');
    if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
    if (modelInput) modelInput.value = config.model || '';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
}

function saveSettings() {
    const apiKey = document.getElementById('api-key')?.value || '';
    const model = document.getElementById('model-input')?.value || '';
    
    if (!apiKey) {
        addMessage('system', '⚠️ Inserisci una API Key valida');
        return;
    }
    
    config.apiKey = apiKey;
    config.model = model;
    
    localStorage.setItem('innuendoai_api_key', apiKey);
    localStorage.setItem('innuendoai_model', model);
    
    addMessage('system', '✅ Impostazioni salvate con successo!');
    closeSettings();
}

function saveBrief() {
    const brief = document.getElementById('briefInput').value.trim();
    
    if (!brief) {
        addMessage('system', '⚠️ Inserisci un brief del progetto');
        return;
    }
    
    projectState.project.brief_originale = brief;
    saveToLocalStorage();
    
    addMessage('system', '✅ Brief salvato! Puoi ora avviare i tool dalla sidebar.');
}

function newProject() {
    if (!confirm('Vuoi creare un nuovo progetto? Il progetto corrente verrà perso se non l\'hai scaricato.')) {
        return;
    }
    
    projectState = {
        project: { brief_originale: '' },
        project_context: {},
        product: {},
        target: {},
        competitors: {},
        swot: {},
        naming: {},
        copywriting: {},
        prezzo: {},
        adv: {},
        risk_analysis: {}
    };
    
    completedTools.clear();
    document.getElementById('briefInput').value = '';
    document.getElementById('chatMessages').innerHTML = '';
    
    document.querySelectorAll('.tool-card').forEach(card => {
        card.classList.remove('completed');
    });
    
    saveToLocalStorage();
    addMessage('system', '🆕 Nuovo progetto creato!');
}

function downloadProject() {
    const dataStr = JSON.stringify(projectState, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `innuendoai_project_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    addMessage('system', '📥 Progetto scaricato!');
}

function addMessage(role, content, data = null) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const avatarText = role === 'system' ? '🤖' : 'AI';
    const roleName = role === 'system' ? 'Sistema' : 'InnuendoAI';
    
    const contentHTML = formatMessageContent(content, data);
    
    messageDiv.innerHTML =
        `<div class="message-header">` +
        `<div class="message-avatar">${avatarText}</div>` +
        `<span class="message-role">${roleName}</span>` +
        `</div>` +
        `<div class="message-content">${contentHTML}</div>`;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addManagerMessage(role, content) {
    const messagesContainer = document.getElementById('managerMessages');
    if (!messagesContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    const avatarText = role === 'user' ? 'TU' : 'AI';
    const roleName = role === 'user' ? 'Tu' : 'AI Manager';

    const contentHTML = formatMessageContent(content || '');
    messageDiv.innerHTML =
        `<div class="message-header">` +
        `<div class="message-avatar">${avatarText}</div>` +
        `<span class="message-role">${roleName}</span>` +
        `</div>` +
        `<div class="message-content">${contentHTML}</div>`;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatMarkdown(text) {
    let safe = escapeHtml(text);

    // Code blocks ```...```
    safe = safe.replace(/```([\s\S]*?)```/g, (_m, code) => {
        return `<pre class="code-block">${escapeHtml(code.trim())}</pre>`;
    });

    // Inline code `...`
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold **...**
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic *...*
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Newlines to <br>
    safe = safe.replace(/\r\n/g, '\n').replace(/\n/g, '<br>');
    return safe;
}

function formatJsonBlock(data) {
    const json = JSON.stringify(data, null, 2);
    return `<pre class="json-block">${escapeHtml(json)}</pre>`;
}

function prettifyKey(key) {
    return String(key)
        .replace(/[_\-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return `<span class="result-value">${formatMarkdown(String(value))}</span>`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '';
        const items = value
            .map((item) => `<li>${renderValue(item)}</li>`)
            .join('');
        return `<ul class="result-list">${items}</ul>`;
    }
    if (typeof value === 'object') {
        return renderObject(value);
    }
    return '';
}

function renderObject(obj) {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '';
    return entries
        .map(([key, val]) => {
            const rendered = renderValue(val);
            if (!rendered) return '';
            return (
                `<div class="result-row">` +
                `<div class="result-key">${prettifyKey(key)}</div>` +
                `<div class="result-body">${rendered}</div>` +
                `</div>`
            );
        })
        .join('');
}

function renderHumanReadable(data) {
    if (!data || typeof data !== 'object') return '';
    return `<div class="result-block">${renderObject(data)}</div>`;
}

function formatMessageContent(content, data) {
    let html = `<p>${formatMarkdown(content || '')}</p>`;
    if (data) {
        html += renderHumanReadable(data);
    }
    return html;
}

function generateManagerResponse(userText) {
    const lower = userText.toLowerCase();
    const missing = [];
    const toolOrder = ['development', 'target', 'competitors', 'swot', 'pricing', 'adv', 'copywriting', 'risk'];
    toolOrder.forEach(t => {
        if (!completedTools.has(t)) missing.push(t);
    });

    if (!projectState.project.brief_originale) {
        return "Per iniziare, inserisci il brief del progetto nel campo in basso. Poi esegui **Sviluppo**.";
    }

    if (lower.includes('manca') || lower.includes('cosa')) {
        if (missing.length === 0) return "Hai completato tutti i tool. Vuoi un riepilogo o una revisione finale?";
        return `Tool non ancora completati: **${missing.join(', ')}**. Vuoi che ne suggerisca l'ordine?`;
    }

    if (lower.includes('parametri') || lower.includes('config')) {
        return `Parametri attuali:\n- ipotesi: ${config.num_hypotheses}\n- personas: ${config.num_personas}\n- competitor: ${config.num_competitor}\n- copy: ${config.num_copy_variants}\n- adv: ${config.num_adv_solutions}\n- scala: ${config.project_scale}`;
    }

    if (lower.includes('ordine') || lower.includes('prossimo')) {
        if (missing.length === 0) return "Non ci sono tool mancanti. Vuoi perfezionare un'area specifica?";
        return `Prossimo suggerito: **${missing[0]}**. Vuoi che lo avvii?`;
    }

    return "Ok! Dimmi su quale area vuoi che mi concentri (target, pricing, copywriting, adv, rischi).";
}

// ========================================
// TOOL EXECUTION
// ========================================

function getToolButton(toolName) {
    return document.querySelector(`.tool-play[data-tool="${toolName}"]`);
}

function setToolButtonState(toolName, state) {
    const btn = getToolButton(toolName);
    if (!btn) return;
    btn.classList.remove('loading', 'done');
    if (state === 'loading') {
        btn.classList.add('loading');
        btn.textContent = '⏳';
    } else if (state === 'done') {
        btn.classList.add('done');
        btn.textContent = '↻';
    } else {
        btn.textContent = '▶';
    }
}

function setToolsDisabled(disabled, activeToolName = null) {
    document.querySelectorAll('.tool-play[data-tool]').forEach(btn => {
        const toolName = btn.getAttribute('data-tool');
        const shouldDisable = disabled && toolName !== activeToolName;
        if (shouldDisable) {
            btn.classList.add('disabled');
        } else {
            btn.classList.remove('disabled');
        }
    });

    document.querySelectorAll('.spinbox-buttons button').forEach(btn => {
        if (disabled) {
            btn.classList.add('disabled');
        } else {
            btn.classList.remove('disabled');
        }
    });
}

// Add click handlers to play buttons
document.querySelectorAll('.tool-play[data-tool]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const toolName = btn.getAttribute('data-tool');
        runTool(toolName);
    });
});

// Manager chat input + AI logic (OpenRouter)
const managerState = {
    conversationHistory: [],
    lastGapAnalysis: null,
    isThinking: false
};

function buildManagerPrompt(userMessage) {
    const lastGap = managerState.lastGapAnalysis?.report_html || "Nessun report recente disponibile";
    const history = managerState.conversationHistory.slice(-6);
    return `
[ROLE] AI Manager Strategico
[CONTEXT]
Stato progetto attuale:
${JSON.stringify(projectState, null, 2)}

Configurazione tool attuale:
${JSON.stringify(config, null, 2)}

Messaggio utente: "${userMessage}"

Ultimo report lacune disponibile:
${lastGap}

Cronologia sintetica conversazione:
${JSON.stringify(history, null, 2)}

[TASK]
Analizza il messaggio e determina quale delle seguenti azioni è più appropriata:
1. COMPILAZIONE_PARAMETRI - L'utente ha dato un brief iniziale e devi compilare i parametri per i tool non ancora attivati
2. MODIFICA_PARAMETRI - L'utente vuole modificare/migliorare un tool già eseguito o i suoi parametri
3. SPIEGAZIONE_TOOL - L'utente chiede come funziona un tool o vuole suggerimenti
4. CONVERSAZIONE - L'utente vuole discutere/rifinire l'idea senza azioni tecniche
5. RIMOZIONE_SEZIONE - L'utente vuole rimuovere/resettare un tool completato
6. RISOLVI_LACUNE - L'utente vuole applicare/modificare per risolvere le lacune emerse dall'ultimo report

[OUTPUT]
Rispondi SOLO in JSON con questa struttura:
{
  "azione": "TIPO_AZIONE",
  "tool_coinvolti": ["nome_tool1", "nome_tool2"],
  "parametri_suggeriti": {
    "num_personas": 3,
    "budget_totale": "5000"
  },
  "risposta_utente": "Messaggio chiaro e conciso da mostrare all'utente (max 150 parole)",
  "richiedi_documentazione": ["nome_tool"]
}

REGOLE:
- Sii pragmatico e diretto
- Se l'utente è vago, proponi valori sensati basati sul contesto
- Non chiedere conferme inutili, agisci in modo proattivo
- Rispondi sempre in italiano
`;
}

async function runManagerAI(userMessage) {
    if (!config.apiKey) {
        addManagerMessage('manager', "Configura la API Key nelle impostazioni per usare il Manager.");
        return;
    }

    managerState.isThinking = true;
    if (managerSend) managerSend.disabled = true;
    try {
        const prompt = buildManagerPrompt(userMessage);
        const response = await callLLM(prompt, 'analitico');
        const result = parseJsonResponse(response);
        managerState.conversationHistory.push({
            user: userMessage,
            response: result?.risposta_utente || ''
        });

        if (result?.parametri_suggeriti) {
            applyManagerParams(result.parametri_suggeriti);
        }

        const reply = result?.risposta_utente || "Ok, ho aggiornato le indicazioni in base allo stato progetto.";
        addManagerMessage('manager', reply);
    } catch (err) {
        addManagerMessage('manager', `❌ Errore Manager: ${err.message}`);
    } finally {
        managerState.isThinking = false;
        if (managerSend) managerSend.disabled = false;
    }
}

function applyManagerParams(params) {
    const map = {
        num_hypotheses: { key: 'num_hypotheses', spin: 'development' },
        num_personas: { key: 'num_personas', spin: 'target' },
        num_competitor: { key: 'num_competitor', spin: 'competitors' },
        num_copy_variants: { key: 'num_copy_variants', spin: 'copywriting' },
        num_adv_solutions: { key: 'num_adv_solutions', spin: 'adv' },
        budget_totale: { key: 'budget_totale', spin: null }
    };

    Object.keys(params).forEach((p) => {
        const entry = map[p];
        if (!entry) return;
        config[entry.key] = params[p];
        if (entry.spin) {
            const input = document.querySelector(`input[data-spin="${entry.spin}"]`);
            if (input) {
                input.value = params[p];
            }
        }
    });
}

const managerInput = document.getElementById('managerInput');
const managerSend = document.getElementById('managerSend');
if (managerSend && managerInput) {
    managerSend.addEventListener('click', () => {
        if (managerState.isThinking) return;
        const text = managerInput.value.trim();
        if (!text) return;
        addManagerMessage('user', text);
        managerInput.value = '';
        runManagerAI(text);
    });

    managerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            managerSend.click();
        }
    });
}

async function runTool(toolName) {
    refreshConfigFromStorage();
    refreshProjectStateFromStorage();
    // Validate
    if (!config.apiKey) {
        addMessage('system', '⚠️ Configura prima la API Key nelle impostazioni');
        showSettings();
        return;
    }
    
    const briefInput = document.getElementById('briefInput');
    const briefText = briefInput ? briefInput.value.trim() : '';
    if (briefText && !projectState.project.brief_originale) {
        projectState.project.brief_originale = briefText;
        saveToLocalStorage();
    }

    if (!projectState.project.brief_originale) {
        addMessage('system', '⚠️ Inserisci prima il brief del progetto');
        return;
    }
    
    // Update config from UI
    config.project_scale = document.getElementById('scale-development')?.value || 'PMI';
    config.budget_totale = document.getElementById('budget-adv')?.value || '5000';
    
    // Execute tool
    const toolFunctions = {
        'development': runDevelopment,
        'target': runTarget,
        'competitors': runCompetitors,
        'swot': runSWOT,
        'naming': runNaming,
        'copywriting': runCopywriting,
        'pricing': runPricing,
        'adv': runADV,
        'risk': runRisk
    };
    
    const toolFunction = toolFunctions[toolName];
    if (!toolFunction) {
        addMessage('system', `⚠️ Tool ${toolName} non implementato`);
        return;
    }
    
    setToolButtonState(toolName, 'loading');
    setToolsDisabled(true, toolName);
    addMessage('system', `⏳ ${toolName.toUpperCase()} in esecuzione...`);
    
    try {
        const result = await toolFunction();
        
        // Save result
        const stateKeys = {
            'development': 'product',
            'target': 'target',
            'competitors': 'competitors',
            'swot': 'swot',
            'naming': 'naming',
            'copywriting': 'copywriting',
            'pricing': 'prezzo',
            'adv': 'adv',
            'risk': 'risk_analysis'
        };
        
        projectState[stateKeys[toolName]] = result;
        completedTools.add(toolName);
        
        // Update UI
        document.querySelector(`.tool-card[data-tool="${toolName}"]`)?.classList.add('completed');
        setToolButtonState(toolName, 'done');
        setToolsDisabled(false);
        saveToLocalStorage();
        
        addMessage('ai', `✅ ${toolName.toUpperCase()} completato!`, result);
        runManagerAI(`Aggiornamento automatico dopo tool ${toolName}. Analizza lo stato e suggerisci eventuali miglioramenti.`);
        
    } catch (error) {
        setToolButtonState(toolName, completedTools.has(toolName) ? 'done' : 'idle');
        setToolsDisabled(false);
        addMessage('system', `❌ Errore: ${error.message}`);
    }
}

// ========================================
// API CALL
// ========================================

async function callLLM(prompt, agentType = 'analitico') {
    const temperature = agentType === 'creativo' ? 0.5 : 0.1;
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'InnuendoAI'
        },
        body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: prompt }],
            temperature
        })
    });
    
    if (!response.ok) {
        let errorText = '';
        try {
            errorText = await response.text();
        } catch (e) {
            errorText = '';
        }
        if (response.status === 401) {
            throw new Error('API Key non valida o utente non trovato. Controlla le impostazioni.');
        }
        if (response.status === 403) {
            throw new Error('Accesso negato. Verifica permessi e API Key.');
        }
        if (response.status === 429) {
            throw new Error('Troppe richieste. Riprova tra poco.');
        }
        throw new Error(`API Error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
}

// ========================================
// TOOL IMPLEMENTATIONS
// ========================================

async function runDevelopment() {
    const brief = projectState.project.brief_originale;
    const scale = config.project_scale;
    const numIpotesi = config.num_hypotheses;
    
    const scaleData = {
        "Grande azienda": {
            budget: "Milioni €",
            team: "Team grandi (50+ persone)",
            tech: "Enterprise: Kubernetes, microservizi, blockchain, ML custom",
            time: "18-36 mesi",
            no: "NO WordPress, Bubble, no-code"
        },
        "PMI": {
            budget: "50k-500k €",
            team: "Team piccoli (5-20 persone)",
            tech: "SaaS: Firebase, React, Vue, Flutter, Stripe API",
            time: "6-12 mesi MVP",
            no: "NO Kubernetes, blockchain. NO Webflow"
        },
        "Startup/Fai-da-te": {
            budget: "0-50k €",
            team: "1-3 persone",
            tech: "No-code: Bubble, Webflow, Airtable, Zapier",
            time: "1-3 mesi MVP",
            no: "NO sviluppo custom, NO React/Vue, NO backend custom"
        }
    };
    
    const constraints = scaleData[scale];
    
    const prompt = `
[ROLE] Agente Creativo Strategico

[CONTEXT - SCALA PROGETTO]
Scala: ${scale}
Budget: ${constraints.budget}
Team: ${constraints.team}
Tech: ${constraints.tech}
Time: ${constraints.time}
VIETATO: ${constraints.no}

[TASK]
Genera ${numIpotesi} ipotesi REALISTICHE per: "${brief}"

[REGOLE]
- Focus ESCLUSIVO sul "COME": architettura, tecnologia, processo
- OGNI ipotesi DEVE rispettare i vincoli di scala
- USA SOLO tecnologie in "Tech"
- EVITA tecnologie in "VIETATO"

[OUTPUT JSON]
{
  "problema": "Problema risolto",
  "meccanismo_tecnico": "Come funziona tecnicamente",
  "benefici_utente": "Vantaggi concreti",
  "differenziazione": "Cosa lo rende diverso"
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'analitico');
    return parseJsonResponse(response);
}

async function runTarget() {
    const brief = projectState.project.brief_originale;
    const product = projectState.product || {};
    const numPersonas = config.num_personas;
    
    const prompt = `
[ROLE] Marketing & Target Analysis Expert

[CONTEXT]
Prodotto: ${brief}
Problema: ${product.problema || 'N/A'}
Benefici: ${product.benefici_utente || 'N/A'}

[TASK]
Analizza il target ideale. Genera ${numPersonas} buyer personas diverse.

[OUTPUT JSON]
{
  "analisi_area": "Descrizione macro-area target Eurisko",
  "buyer_personas": [
    {
      "nome": "Nome fittizio",
      "età": "Range",
      "occupazione": "Lavoro",
      "descrizione": "Profilo",
      "motivazione_acquisto": "Perché compra",
      "canali_preferiti": ["social", "email", ...]
    }
  ]
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'analitico');
    return parseJsonResponse(response);
}

async function runCompetitors() {
    const brief = projectState.project.brief_originale;
    const numComp = config.num_competitor;
    
    const prompt = `
[ROLE] Competitive Analysis Expert

[CONTEXT]
Prodotto: ${brief}

[TASK]
Trova ${numComp} competitor REALI attualmente operativi.

[OUTPUT JSON]
{
  "analisi_segmento": "Panorama competitivo",
  "competitors_reali": [
    {
      "nome_competitor": "Nome azienda reale",
      "descrizione_breve": "Cosa fanno (1 frase)"
    }
  ]
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'analitico');
    return parseJsonResponse(response);
}

async function runSWOT() {
    const brief = projectState.project.brief_originale;
    const target = projectState.target?.analisi_area || 'Mercato generale';
    
    const prompt = `
[ROLE] Strategic Analyst

[CONTEXT]
Prodotto: ${brief}
Target: ${target}

[TASK]
Genera analisi PESTEL + SWOT.

[OUTPUT JSON]
{
  "pestel": {
    "politico": "Fattori politici",
    "economico": "Fattori economici",
    "sociale": "Fattori sociali",
    "tecnologico": "Fattori tecnologici",
    "ecologico": "Fattori ecologici",
    "legale": "Fattori legali"
  },
  "swot": {
    "strengths": ["punto forza 1", "punto forza 2"],
    "weaknesses": ["debolezza 1", "debolezza 2"],
    "opportunities": ["opportunità 1", "opportunità 2"],
    "threats": ["minaccia 1", "minaccia 2"]
  }
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'analitico');
    return parseJsonResponse(response);
}

async function runNaming() {
    const brief = projectState.project.brief_originale;
    const target = projectState.target?.analisi_area || 'Generale';
    const product = projectState.product || {};
    
    const prompt = `
[ROLE] Brand Strategist

[CONTEXT]
Prodotto: ${brief}
Target: ${target}
Posizionamento: ${product.differenziazione || 'Innovativo'}

[TASK]
Proponi 12 nomi (3 per categoria: Natura, Tech, Emozioni, Miti).
NO nomi esistenti. Seleziona il migliore.

[OUTPUT JSON]
{
  "elenco_nomi_proposti": "Lista nomi con categorie",
  "scelta_finale": {
    "nome_scelto": "Nome selezionato",
    "motivazione_analitica": "Perché questo nome"
  }
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'creativo');
    return parseJsonResponse(response);
}

async function runCopywriting() {
    const brand = projectState.naming?.scelta_finale?.nome_scelto || projectState.project.brief_originale;
    const product = projectState.product || {};
    const numVarianti = config.num_copy_variants;
    
    const prompt = `
[ROLE] Copywriter Neuromarketing

[CONTEXT]
Brand: ${brand}
Problema: ${product.problema || 'N/A'}
Benefici: ${product.benefici_utente || 'N/A'}

[TASK]
Genera ${numVarianti} varianti copy con neuromarketing.

Usa:
- Ormoni: dopamina/ossitocina/endorfine
- Ganci emotivi: contrasto assurdo, fatto scioccante, etc.

[OUTPUT JSON]
{
  "brand_name": "${brand}",
  "copy_variants": [
    {
      "id": 1,
      "headline": "Titolo max 12 parole",
      "subheadline": "Sottotitolo",
      "body_copy": "Testo 3-5 righe",
      "call_to_action": "CTA con urgenza",
      "neuro_tecnica": {
        "combinazione_emotiva": "Es: Incredulità + Vulnerabilità",
        "gancio_usato": "Es: Fatto Scioccante",
        "meccanismo_persuasivo": "Es: Leva scarsità"
      }
    }
  ]
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'creativo');
    return parseJsonResponse(response);
}

async function runPricing() {
    const brand = projectState.naming?.scelta_finale?.nome_scelto || projectState.project.brief_originale;
    const product = projectState.product || {};
    const target = projectState.target?.analisi_area || 'Mercato generale';
    
    const prompt = `
[ROLE] Pricing Strategist

[CONTEXT]
Brand: ${brand}
Problema: ${product.problema || 'N/A'}
Target: ${target}

[PRINCIPIO]
Prezzo = VALORE PERCEPITO, NON costi + margine.

[TASK]
Genera 3 fasce prezzo (alto/medio/basso).

Per CIASCUNA:
- Prezzo unitario
- Scenario clienti (pessimistico/realistico/ottimistico)
- Come aumentare profitti
- Pro/contro

Considera CTR medio 0.5-2%. Posizionamento basso richiede milioni impression.

[OUTPUT JSON]
{
  "brand_name": "${brand}",
  "fasce": [
    {
      "posizionamento": "alto",
      "prezzo_unitario": "Es: 5000€/anno",
      "scenario_clienti": {
        "pessimistico": {"clienti": 10, "ricavo_annuo_eur": 50000},
        "realistico": {"clienti": 50, "ricavo_annuo_eur": 250000},
        "ottimistico": {"clienti": 200, "ricavo_annuo_eur": 1000000}
      },
      "strategie_crescita_profitti": ["strategia 1", "strategia 2"],
      "pro": ["pro 1", "pro 2"],
      "contro": ["contro 1", "contro 2"]
    }
  ],
  "posizionamento_consigliato": "alto|medio|basso",
  "motivazione_consiglio": "Spiegazione dettagliata"
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'analitico');
    return parseJsonResponse(response);
}

async function runADV() {
    const brand = projectState.naming?.scelta_finale?.nome_scelto || projectState.project.brief_originale;
    const product = projectState.product || {};
    const target = projectState.target || {};
    const budget = config.budget_totale;
    const numCampagne = config.num_adv_solutions;
    
    const prompt = `
[ROLE] Marketing & ADV Strategist

[CONTEXT]
Brand: ${brand}
Problema: ${product.problema || 'N/A'}
Target: ${target.analisi_area || 'Generale'}
Budget: €${budget}

[TASK]
Crea ${numCampagne} campagne pubblicitarie diverse.

Per CIASCUNA:
- Nome campagna
- Canali (social/search/display/video/email/influencer)
- Budget per canale (€ e %)
- Messaggio chiave
- Call-to-Action
- KPI misurabili

[OUTPUT JSON]
{
  "brand_name": "${brand}",
  "budget_totale": "${budget}",
  "campagne": [
    {
      "id_campagna": 1,
      "nome_campagna": "Nome descrittivo",
      "canali": [
        {
          "nome_canale": "social_media",
          "budget_eur": 3000,
          "budget_pct": 60,
          "strategia": "Awareness e traffico"
        }
      ],
      "messaggio_chiave": "Main message",
      "call_to_action": "CTA principale",
      "kpi": [
        {"metrica": "CTR", "target": ">= 1.5", "unita": "%"}
      ]
    }
  ]
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'analitico');
    return parseJsonResponse(response);
}

async function runRisk() {
    const brand = projectState.naming?.scelta_finale?.nome_scelto || projectState.project.brief_originale;
    
    const prompt = `
[ROLE] Risk Management Expert

[CONTEXT]
Progetto: ${brand}
Contesto completo: ${JSON.stringify(projectState, null, 2)}

[TASK]
PRE-MORTEM: Immagina che tra 3 anni il progetto sia FALLITO.

Identifica:
1. 3 cause principali fallimento
2. Scenario realistico del crollo
3. Segnali warning che avrebbero dovuto allarmare

Sii brutale e realistico. NO ottimismo.

[OUTPUT JSON]
{
  "scenario_fallimento": "Descrizione dettagliata del fallimento e sue cause"
}

Rispondi SOLO JSON in italiano.
`;
    
    const response = await callLLM(prompt, 'analitico');
    return parseJsonResponse(response);
}

// ========================================
// JSON PARSER (handles code fences)
// ========================================

function parseJsonResponse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Risposta vuota o non valida dal modello.');
    }

    let text = rawText.trim();

    // Remove ```json or ``` fences
    if (text.startsWith('```')) {
        text = text.replace(/^```[a-zA-Z]*\s*/m, '');
        text = text.replace(/```$/m, '').trim();
    }

    // Normalize common issues
    const normalizeJson = (input) => {
        let t = input;
        // Replace smart quotes with regular quotes
        t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
        // Remove trailing commas before } or ]
        t = t.replace(/,\s*([}\]])/g, '$1');
        return t;
    };

    text = normalizeJson(text);

    // Try direct parse
    try {
        return JSON.parse(text);
    } catch (e) {
        // Fallback: extract first JSON block
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const slice = normalizeJson(text.slice(firstBrace, lastBrace + 1));
            return JSON.parse(slice);
        }
        throw new Error('Risposta non in JSON valido. Prova a rigenerare il tool.');
    }
}
