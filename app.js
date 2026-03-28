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

function sanitizeProjectState(state) {
    if (!state || typeof state !== 'object') return state;
    if (!Object.prototype.hasOwnProperty.call(state, 'naming')) return state;
    const cleaned = { ...state };
    delete cleaned.naming;
    return cleaned;
}

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

    const newProjectBtn = document.getElementById('new-project-btn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', newProject);
    }

    const exportPdfBtn = document.getElementById('export-pdf-btn');
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', exportProjectPdf);
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
            const parsed = JSON.parse(savedState);
            const cleaned = sanitizeProjectState(parsed);
            projectState = cleaned;
            if (cleaned !== parsed) saveToLocalStorage();
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
        const parsed = JSON.parse(savedState);
        const cleaned = sanitizeProjectState(parsed);
        projectState = cleaned;
        if (cleaned !== parsed) saveToLocalStorage();
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
        copywriting: {},
        prezzo: {},
        adv: {},
        risk_analysis: {}
    };
    
    completedTools.clear();
    if (document.getElementById('briefInput')) document.getElementById('briefInput').value = '';
    if (document.getElementById('chatMessages')) document.getElementById('chatMessages').innerHTML = '';
    if (document.getElementById('managerMessages')) document.getElementById('managerMessages').innerHTML = '';

    // Reset Manager shared memory
    if (typeof managerState !== 'undefined') {
        managerState.conversationHistory = [];
        managerState.lastGapAnalysis = null;
        managerState.isThinking = false;
    }
    
    document.querySelectorAll('.tool-card').forEach(card => {
        card.classList.remove('completed');
    });

    document.querySelectorAll('.tool-play[data-tool]').forEach(btn => {
        btn.classList.remove('loading', 'done', 'disabled');
        btn.textContent = '▶';
    });
    setToolsDisabled(false);
    
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

function exportProjectPdf() {
    refreshProjectStateFromStorage();

    if (!window.jspdf || !window.jspdf.jsPDF) {
        addMessage('system', '⚠️ Libreria PDF non caricata. Ricarica la pagina e riprova.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 46;
    const marginY = 50;
    const lineHeight = 14;
    const sectionGap = 14;
    const indentStep = 14;

    const now = new Date();
    const projectName = 'Report progetto';
    const meta = `Generato il ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    let cursorY = marginY;

    const ensureSpace = (needed) => {
        if (cursorY + needed > pageHeight - marginY) {
            doc.addPage();
            cursorY = marginY;
        }
    };

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(projectName, marginX, cursorY);
    cursorY += 20;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90, 102, 117);
    doc.text(meta, marginX, cursorY);
    cursorY += 18;

    doc.setTextColor(26, 29, 34);

    const sections = [
        { key: 'project', label: 'Panoramica Progetto' },
        { key: 'project_context', label: 'Contesto Progetto' },
        { key: 'product', label: 'Sviluppo Prodotto' },
        { key: 'target', label: 'Analisi Target' },
        { key: 'competitors', label: 'Concorrenza' },
        { key: 'swot', label: 'SWOT' },
        { key: 'copywriting', label: 'Scrittura' },
        { key: 'prezzo', label: 'Prezzo' },
        { key: 'adv', label: 'Campagna Pubblicitaria' },
        { key: 'risk_analysis', label: 'Analisi Pre-Mortem' }
    ];

    let renderedAny = false;
    sections.forEach(({ key, label }) => {
        const value = projectState ? projectState[key] : null;
        if (!nodeHasVisibleContent(value)) return;

        renderedAny = true;
        ensureSpace(24);
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(0, 62, 150);
        doc.text(label, marginX, cursorY);
        cursorY += 16;

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(26, 29, 34);

        const lines = buildPdfLines(value, 0, [key]);
        lines.forEach((line) => {
            const x = marginX + line.depth * indentStep;
            const maxWidth = pageWidth - marginX - x;
            const wrapped = doc.splitTextToSize(line.text, maxWidth);
            wrapped.forEach((row) => {
                ensureSpace(lineHeight);
                doc.setFont('Helvetica', line.bold ? 'bold' : 'normal');
                doc.text(row, x, cursorY);
                cursorY += lineHeight;
            });
        });

        cursorY += sectionGap;
    });

    if (!renderedAny) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('Nessun contenuto disponibile da esportare.', marginX, cursorY);
    }

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const pdfWindow = window.open(pdfUrl, '_blank');
    if (!pdfWindow) {
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = `${projectName.replace(/\s+/g, '_')}.pdf`;
        a.click();
        addMessage('system', '📄 PDF generato e scaricato.');
    } else {
        addMessage('system', '📄 PDF generato. Puoi scaricare o stampare dal viewer.');
    }
}

function nodeHasVisibleContent(node) {
    if (node === null || node === undefined) return false;
    if (typeof node === 'string') return node.trim() !== '';
    if (typeof node === 'number' || typeof node === 'boolean') return true;
    if (Array.isArray(node)) return node.some(item => nodeHasVisibleContent(item));
    if (typeof node === 'object') {
        return Object.values(node).some(value => nodeHasVisibleContent(value));
    }
    return false;
}

function buildPdfLines(node, depth = 0, path = [], boldFirstLine = false) {
    const lines = [];
    const maxDepth = 4;

    const pushLine = (text, level, bold = false) => {
        const clean = String(text).replace(/\s+/g, ' ').trim();
        if (!clean) return;
        lines.push({ text: clean, depth: Math.min(level, maxDepth), bold });
    };

    const normalizeKey = (key) => String(key).toLowerCase().replace(/[\s_\-]+/g, '');
    const isCopywritingPath = path.includes('copywriting') || path.includes('copy_variants');

    if (node === null || node === undefined) return lines;

    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
        pushLine(node, depth);
        return lines;
    }

    if (Array.isArray(node)) {
        if (node.length === 0) return lines;
        const isKpiPath = path.some(p => normalizeKey(p) === 'kpi' || normalizeKey(p) === 'kpis');
        if (isKpiPath && node.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
            node.forEach((item) => {
                const metric = item.metrica ?? item.kpi ?? item.nome;
                const target = item.target ?? item.obiettivo ?? item.valore;
                const unit = item.unita ?? item.unità ?? item.unit;
                if (!metric && !target) return;
                const targetText = target !== undefined && target !== null && String(target).trim() !== ''
                    ? ` ${target}${unit ? ` ${unit}` : ''}`
                    : '';
                pushLine(`${metric}:${targetText}`, depth);
            });
            return lines;
        }
        const allSimple = node.every(item => typeof item !== 'object' || item === null);
        if (allSimple) {
            node.forEach(item => pushLine(`- ${item}`, depth));
            return lines;
        }
        node.forEach((item, idx) => {
            if (item === null || item === undefined) return;
            if (typeof item === 'object') {
                lines.push(...buildPdfLines(item, depth, path.concat(String(idx + 1)), true));
            } else {
                pushLine(`- ${item}`, depth);
            }
        });
        return lines;
    }

    if (typeof node === 'object') {
        let firstEmitted = false;
        Object.entries(node).forEach(([key, value]) => {
            if (!nodeHasVisibleContent(value)) return;
            if (isCopywritingPath && normalizeKey(key) === 'id') return;
            const prettyKey = prettifyKey(key);
            if (typeof value === 'object' && value !== null) {
                const bold = boldFirstLine && !firstEmitted;
                pushLine(`${prettyKey}:`, depth, bold);
                if (bold) firstEmitted = true;
                lines.push(...buildPdfLines(value, depth + 1, path.concat(String(key))));
            } else {
                const bold = boldFirstLine && !firstEmitted;
                pushLine(`${prettyKey}: ${value}`, depth, bold);
                if (bold) firstEmitted = true;
            }
        });
    }

    return lines;
}

function addMessage(role, content, data = null) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const avatarText = role === 'system' ? '🤖' : 'AI';
    const roleName = role === 'system' ? 'Sistema' : 'InnuendoAI';

    if (role === 'system') {
        messageDiv.classList.add('system-debug');
    }
    
    messageDiv.innerHTML =
        `<div class="message-header">` +
        `<div class="message-avatar">${avatarText}</div>` +
        `<span class="message-role">${roleName}</span>` +
        `</div>` +
        `<div class="message-content"></div>`;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const contentEl = messageDiv.querySelector('.message-content');
    const shouldType = role !== 'user';
    renderMessageWithTyping(contentEl, content, data, shouldType);
}

function addManagerMessage(role, content) {
    const messagesContainer = document.getElementById('managerMessages');
    if (!messagesContainer) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    const avatarText = role === 'user' ? 'TU' : 'AI';
    const roleName = role === 'user' ? 'Tu' : 'Manager';

    messageDiv.innerHTML =
        `<div class="message-header">` +
        `<div class="message-avatar">${avatarText}</div>` +
        `<span class="message-role">${roleName}</span>` +
        `</div>` +
        `<div class="message-content"></div>`;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    const contentEl = messageDiv.querySelector('.message-content');
    const shouldType = role !== 'user';
    renderMessageWithTyping(contentEl, content || '', null, shouldType);
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

// ========================================
// TYPING EFFECT
// ========================================

const typingConfig = {
    wordDelayMs: 200,
    minTotalMs: 800,
    maxTotalMs: 12000
};

function clampValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function estimateWordDelay(wordCount) {
    if (wordCount <= 0) return typingConfig.minTotalMs;
    const total = clampValue(wordCount * typingConfig.wordDelayMs, typingConfig.minTotalMs, typingConfig.maxTotalMs);
    return Math.max(10, Math.floor(total / wordCount));
}

function renderMessageWithTyping(container, content, data, useTyping) {
    const html = formatMessageContent(content, data);
    if (!useTyping) {
        container.innerHTML = html;
        return;
    }

    // Render formatted HTML first, then reveal its text nodes word-by-word.
    container.innerHTML = html;
    container.classList.add('typing-active');
    animateFormattedWords(container, () => {
        container.classList.remove('typing-active');
    });
}

function animateFormattedWords(container, onDone) {
    const scrollPanel = container.closest('.chat-panel');
    const keepScroll = () => {
        if (!scrollPanel) return;
        scrollPanel.scrollTop = scrollPanel.scrollHeight;
    };

    const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push({
            node: walker.currentNode,
            fullText: walker.currentNode.nodeValue
        });
    }

    if (textNodes.length === 0) return;

    const wordQueues = textNodes.map((entry) => {
        const words = entry.fullText.trim().split(/\s+/);
        return { entry, words, index: 0 };
    });

    const totalWords = wordQueues.reduce((sum, q) => sum + q.words.length, 0);
    const delay = estimateWordDelay(totalWords);

    // Clear all text nodes before typing.
    wordQueues.forEach(({ entry }) => {
        entry.node.nodeValue = '';
    });

    let currentNode = 0;

    const tick = () => {
        while (currentNode < wordQueues.length && wordQueues[currentNode].index >= wordQueues[currentNode].words.length) {
            currentNode += 1;
        }
        if (currentNode >= wordQueues.length) {
            // Restore original text to preserve spacing/newlines in nodes.
            wordQueues.forEach(({ entry }) => {
                if (!entry.node.nodeValue) {
                    entry.node.nodeValue = entry.fullText;
                }
            });
            keepScroll();
            if (onDone) onDone();
            return;
        }

        const queue = wordQueues[currentNode];
        const word = queue.words[queue.index];
        queue.entry.node.nodeValue += (queue.index === 0 ? '' : ' ') + word;
        queue.index += 1;
        keepScroll();
        setTimeout(tick, delay);
    };
    tick();
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
    const promptState = sanitizeProjectState(projectState);
    return `
[ROLE] AI Manager Strategico
[CONTEXT]
Stato progetto attuale:
${JSON.stringify(promptState, null, 2)}

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
  "richiedi_documentazione": ["nome_tool"] // solo se serve spiegazione approfondita
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

function getBrandName() {
    return (
        projectState.prezzo?.brand_name ||
        projectState.project?.brief_originale ||
        'Progetto'
    );
}

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

async function runCopywriting() {
    const brand = getBrandName();
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
    const brand = getBrandName();
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
    const brand = getBrandName();
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
    const brand = getBrandName();
    
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



