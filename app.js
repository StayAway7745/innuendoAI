// ========================================
// STATE MANAGEMENT
// ========================================

let projectState = {
    project: { brief_originale: '', project_id: '' },
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
    budget_totale: '5000',
    tavilyApiKey: ''
};

let managerState = {
    conversationHistory: [],
    lastGapAnalysis: null,
    isThinking: false
};

const PROJECT_LIMIT = 5;
const PROJECT_COUNT_KEY = 'innuendoai_project_count';
const LLM_DAILY_LIMIT = 50;
const TAVILY_DAILY_LIMIT = 20;
const TAVILY_MAX_RESULTS = 5;
const INITIAL_ANALYSIS_TIMEOUT_MS = 40000;
const INITIAL_ANALYSIS_SOFT_TIMEOUT_MS = 15000;
const ALLOW_REDO_INITIAL_ANALYSIS = true;

function getProjectCount() {
    const raw = localStorage.getItem(PROJECT_COUNT_KEY);
    const num = parseInt(raw || '0', 10);
    return Number.isFinite(num) ? num : 0;
}

function setProjectCount(value) {
    localStorage.setItem(PROJECT_COUNT_KEY, String(value));
}

function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
}

function simpleHash(input) {
    let hash = 0;
    const str = String(input || '');
    for (let i = 0; i < str.length; i += 1) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function getQuotaStorageKey(type, apiKey) {
    const keyHash = simpleHash(apiKey);
    return `innuendoai_quota_${type}_${keyHash}_${getTodayKey()}`;
}

function consumeQuota(type, apiKey, limit) {
    if (!apiKey) return true;
    const storageKey = getQuotaStorageKey(type, apiKey);
    const raw = localStorage.getItem(storageKey);
    const count = parseInt(raw || '0', 10);
    if (count >= limit) return false;
    localStorage.setItem(storageKey, String(count + 1));
    return true;
}

let completedTools = new Set();
let analysisCurrentQuestionIndex = 0;
let analysisInFlight = false;
let analysisAbortController = null;
let analysisSoftTimeoutId = null;
let analysisElapsedIntervalId = null;

function sanitizeProjectState(state) {
    if (!state || typeof state !== 'object') return state;
    if (!Object.prototype.hasOwnProperty.call(state, 'naming')) return state;
    const cleaned = { ...state };
    delete cleaned.naming;
    return cleaned;
}

async function ensureProjectSlot() {
    if (projectState.project?.project_id) return true;
    const currentCount = getProjectCount();
    if (currentCount >= PROJECT_LIMIT) {
        addMessage('system', `Limite progetti raggiunto (${PROJECT_LIMIT}).`);
        return false;
    }
    const nextCount = currentCount + 1;
    setProjectCount(nextCount);
    projectState.project.project_id = `local_${nextCount}_${Date.now()}`;
    saveToLocalStorage();
    return true;
}

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
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

    const tavilyTestBtn = document.getElementById('tavily-test');
    if (tavilyTestBtn) {
        tavilyTestBtn.addEventListener('click', testTavilyConnection);
    }

    document.querySelectorAll('.tool-play[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => runTool(btn.getAttribute('data-tool')));
    });

    const startAnalysisBtn = document.getElementById('start-analysis-btn');
    if (startAnalysisBtn) {
        startAnalysisBtn.addEventListener('click', async () => {
            const brief = (document.getElementById('briefInput')?.value || '').trim();
            if (!brief) {
                addMessage('system', 'Inserisci prima un brief per avviare l\'analisi iniziale.');
                return;
            }
            if (!projectState.project.brief_originale) {
                projectState.project.brief_originale = brief;
                saveToLocalStorage();
            }
            // Apri overlay subito per feedback utente
            openAnalysisOverlay();
            await runBriefAnalysis();
        });
    }

    const analysisClose = document.getElementById('analysis-close');
    if (analysisClose) {
        analysisClose.addEventListener('click', () => cancelAnalysisRequest({ closeOverlay: true }));
    }
    const analysisCancel = document.getElementById('analysis-cancel');
    if (analysisCancel) {
        analysisCancel.addEventListener('click', () => cancelAnalysisRequest({ closeOverlay: true }));
    }
    const analysisPrev = document.getElementById('analysis-prev');
    if (analysisPrev) {
        analysisPrev.addEventListener('click', () => navigateAnalysisQuestion(-1));
    }

    const analysisAction = document.getElementById('analysis-action');
    if (analysisAction) {
        analysisAction.addEventListener('click', handleAnalysisAction);
    }
});

function loadFromLocalStorage() {
    // Load config
    const savedApiKey = localStorage.getItem('innuendoai_api_key');
    const savedModel = localStorage.getItem('innuendoai_model');
    const savedTavilyKey = localStorage.getItem('innuendoai_tavily_key');

    if (savedApiKey) config.apiKey = savedApiKey;
    if (savedModel) config.model = savedModel;
    if (savedTavilyKey) config.tavilyApiKey = savedTavilyKey;
    
    // Load project state
    const savedState = localStorage.getItem('innuendoai_project_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            const cleaned = sanitizeProjectState(parsed);
            projectState = cleaned;
            if (cleaned !== parsed) saveToLocalStorage();
            updateCompletedTools();
            updateAnalysisButtonState();
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
        updateAnalysisButtonState();
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

function updateAnalysisButtonState() {
    const btn = document.getElementById('start-analysis-btn');
    if (!btn) return;
    const completed = !!projectState.project_context?.initial_analysis?.completed;
    const shouldDisable = completed && !ALLOW_REDO_INITIAL_ANALYSIS;
    btn.disabled = shouldDisable;
    btn.classList.toggle('disabled', shouldDisable);
    btn.style.opacity = shouldDisable ? '0.5' : '1';
    btn.style.pointerEvents = shouldDisable ? 'none' : 'auto';
    btn.textContent = completed ? 'Analisi iniziale ✓' : 'Analisi Iniziale';
    btn.title = completed ? 'Analisi iniziale già completata' : 'Analisi iniziale';
}

function setInitialAnalysisCompleted(value) {
    projectState.project_context = projectState.project_context || {};
    projectState.project_context.initial_analysis = projectState.project_context.initial_analysis || {};
    projectState.project_context.initial_analysis.completed = !!value;
    saveToLocalStorage();
    updateAnalysisButtonState();
}

function setToolButtonState(toolName, state) {
    const btn = document.querySelector(`.tool-play[data-tool="${toolName}"]`);
    if (!btn) return;

    btn.classList.remove('idle', 'loading', 'done', 'disabled');
    if (state) btn.classList.add(state);

    switch (state) {
        case 'loading':
            btn.textContent = '⏳';
            break;
        case 'done':
            btn.textContent = '🔄';
            break;
        case 'disabled':
            btn.textContent = '⏸';
            break;
        default:
            btn.textContent = '►';
            break;
    }
}

function setToolsDisabled(disabled, exceptTool = null) {
    document.querySelectorAll('.tool-play[data-tool]').forEach((btn) => {
        const toolName = btn.getAttribute('data-tool');
        const disable = disabled && toolName !== exceptTool;
        btn.disabled = disable;
        btn.classList.toggle('disabled', disable);
    });
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
    const savedTavilyKey = localStorage.getItem('innuendoai_tavily_key');
    if (savedApiKey) config.apiKey = savedApiKey;
    if (savedModel) config.model = savedModel;
    if (savedTavilyKey) config.tavilyApiKey = savedTavilyKey;
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
    const tavilyInput = document.getElementById('tavily-key');
    if (apiKeyInput) apiKeyInput.value = config.apiKey || '';
    if (modelInput) modelInput.value = config.model || '';
    if (tavilyInput) tavilyInput.value = config.tavilyApiKey || '';
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
    const tavilyKey = document.getElementById('tavily-key')?.value || '';
    
    if (!apiKey) {
        addMessage('system', 'Inserisci una API Key valida');
        return;
    }
    
    config.apiKey = apiKey;
    config.model = model;
    config.tavilyApiKey = tavilyKey;
    
    localStorage.setItem('innuendoai_api_key', apiKey);
    localStorage.setItem('innuendoai_model', model);
    localStorage.setItem('innuendoai_tavily_key', tavilyKey);
    
    addMessage('system', 'Impostazioni salvate con successo.');
    closeSettings();
}

async function testTavilyConnection() {
    const resultEl = document.getElementById('tavily-test-result');
    const inlineKey = document.getElementById('tavily-key')?.value || '';
    const key = inlineKey.trim();
    if (!key) {
        if (resultEl) resultEl.textContent = 'Inserisci una Tavily API Key valida.';
        return;
    }

    if (resultEl) resultEl.textContent = 'Test in corso...';
    const data = await callTavilySearch('test query', 'basic', key);
    if (!data) {
        if (resultEl) resultEl.textContent = 'Test fallito: nessuna risposta da Tavily.';
        return;
    }
    const count = Array.isArray(data.results) ? data.results.length : 0;
    if (resultEl) resultEl.textContent = `OK: Tavily risponde (${count} risultati).`;
}

async function saveBrief() {
    const brief = document.getElementById('briefInput').value.trim();
    
    if (!brief) {
        addMessage('system', 'Inserisci un brief del progetto');
        return;
    }

    const ok = await ensureProjectSlot();
    if (!ok) return;
    
    projectState.project.brief_originale = brief;
    saveToLocalStorage();
    
    addMessage('system', 'Brief salvato. Puoi ora avviare i tool dalla sidebar.');
}

function getInitialAnalysisContext() {
    const analysis = projectState.project_context?.initial_analysis;
    if (!analysis) return '';

    const lines = [];
    lines.push(`Brief: ${projectState.project.brief_originale || 'Nessuno'}`);
    if (analysis.questions && Array.isArray(analysis.questions)) {
        lines.push('Domande generate:');
        analysis.questions.forEach((q, idx) => {
            lines.push(`${idx + 1}. ${q.question || q.q || 'N/A'}`);
        });
    }
    if (analysis.resource_requirements) {
        lines.push(`Risorse: ${JSON.stringify(analysis.resource_requirements)}`);
    }
    if (analysis.user_feedback) lines.push(`Risposta utente: ${analysis.user_feedback}`);
    return lines.join('\n');
}

function openAnalysisOverlay() {
    const overlay = document.getElementById('analysis-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    const analysisStatus = document.getElementById('analysis-status');
    if (analysisStatus) {
        analysisStatus.textContent = 'Stato: in corso analisi iniziale...';
    }

    const prev = document.getElementById('analysis-prev');
    const action = document.getElementById('analysis-action');
    if (prev) {
        prev.disabled = true;
        prev.classList.add('disabled');
    }
    if (action) {
        action.disabled = true;
        action.classList.add('disabled');
        action.textContent = 'Avanti';
    }

    const cancel = document.getElementById('analysis-cancel');
    if (cancel) {
        cancel.disabled = false;
        cancel.classList.remove('disabled');
        cancel.textContent = 'Annulla';
    }
}

function closeAnalysisOverlay() {
    const overlay = document.getElementById('analysis-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
}

function cancelAnalysisRequest({ closeOverlay = true } = {}) {
    if (analysisInFlight && analysisAbortController) {
        analysisAbortController.abort();
    }
    analysisInFlight = false;
    analysisAbortController = null;
    if (analysisSoftTimeoutId) {
        clearTimeout(analysisSoftTimeoutId);
        analysisSoftTimeoutId = null;
    }
    if (analysisElapsedIntervalId) {
        clearInterval(analysisElapsedIntervalId);
        analysisElapsedIntervalId = null;
    }
    const analysisStatus = document.getElementById('analysis-status');
    if (analysisStatus) {
        analysisStatus.textContent = '⏹️ Analisi annullata. Puoi riprovare quando vuoi.';
    }
    if (closeOverlay) {
        closeAnalysisOverlay();
    }
}

async function runBriefAnalysis() {
    const brief = (document.getElementById('briefInput')?.value || '').trim();
    if (!brief) {
        addMessage('system', 'Inserisci un brief prima di avviare l\'analisi.');
        return;
    }

    if (!config.apiKey) {
        addMessage('system', 'Configura la API Key nelle impostazioni per usare il servizio AI.');
        showSettings();
        return;
    }

    const analysisStatus = document.getElementById('analysis-status');
    if (analysisStatus) analysisStatus.textContent = 'Stato: 🎯 Generazione in corso... Attendere prego.';

    analysisInFlight = true;
    analysisAbortController = new AbortController();
    if (analysisSoftTimeoutId) clearTimeout(analysisSoftTimeoutId);
    analysisSoftTimeoutId = setTimeout(() => {
        if (!analysisInFlight) return;
        const status = document.getElementById('analysis-status');
        if (status) {
            status.textContent = 'Stato: ⏳ Sta impiegando più del previsto. Puoi annullare e riprovare.';
        }
    }, INITIAL_ANALYSIS_SOFT_TIMEOUT_MS);
    const analysisStart = performance.now();
    if (analysisElapsedIntervalId) clearInterval(analysisElapsedIntervalId);
    analysisElapsedIntervalId = setInterval(() => {
        if (!analysisInFlight) return;
        const status = document.getElementById('analysis-status');
        if (!status) return;
        const elapsedSec = Math.round((performance.now() - analysisStart) / 1000);
        status.textContent = `Stato: 🎯 Generazione in corso... (${elapsedSec}s)`;
    }, 1000);

    const toolList = ['development', 'target', 'competitors', 'swot', 'copywriting', 'pricing', 'adv', 'risk'];
    const prompt = `
[ROLE] Agente Analitico Senior

[CONTEXT]
Brief progetto: ${brief}
Tool disponibili per sviluppo: ${toolList.join(', ')}

[OBIETTIVO]
1. Fornisci una sintesi dei punti critici e un obiettivo progetto chiaro ma non dettagliato in KPI tecnici (stadio iniziale): "sprint MVP, validazione prodotto, riduzione rischio".
2. Formula domande specifiche a risposta multipla (4 opzioni: A/B/C/Altro) su:
- ambito del risultato di business (scopo generale, es. "migliorare conversioni web", "far crescere l\'engagement")
- risorse interne e skill (es. "Hai competenze di sviluppo software, data, UX, DevOps?", "Esiste il profilo professionale sviluppatore/backend/architetto/PM?")
- disponibilità team e ruoli (1-3, 5-20, 50+ persone)
- budget disponibile
- timeline e vincoli.
- gap tecnici e opzioni low-code/no-code (se mancano skill coding).
3. Assicurati di includere almeno una domanda esplicita su competenze/profili e un suggerimento contestualizzato se il team non può gestire sviluppo custom.
4. Niente metriche avanzate irreali come "Fatturato +200%" in questa fase.
5. Includi checklist risorse (personale, competenze, budget, tempo).

[OUTPUT JSON]
{
  "summary": "...",
  "questions": [
    {"question": "...", "a": "...", "b": "...", "c": "...", "altro": "..."}
  ],
  "resource_requirements": {
    "team": "...",
    "competence": "...",
    "budget_min": "...",
    "time_estimate": "..."
  }
}
  

Rispondi solo JSON valido in italiano.
`;

    let output;
    let metaInfo = null;
    try {
        output = await callLLM(prompt, 'analitico', {
            timeoutMs: INITIAL_ANALYSIS_TIMEOUT_MS,
            signal: analysisAbortController.signal,
            onMeta: (meta) => {
                metaInfo = meta;
                const status = document.getElementById('analysis-status');
                if (!status) return;
                const parts = [];
                if (Number.isFinite(meta.queueMs)) parts.push(`coda: ${Math.round(meta.queueMs / 1000)}s`);
                if (Number.isFinite(meta.processingMs)) parts.push(`modello: ${Math.round(meta.processingMs / 1000)}s`);
                if (Number.isFinite(meta.totalMs)) parts.push(`totale: ${Math.round(meta.totalMs / 1000)}s`);
                if (parts.length) {
                    status.textContent = `Stato: ✅ Risposta ricevuta (${parts.join(', ')}). Elaborazione...`;
                }
            }
        });
    } catch (err) {
        if (analysisStatus) analysisStatus.textContent = '❌ Errore durante l\'analisi: ' + err.message;
        addMessage('system', `Errore analisi brief: ${err.message}`);
        analysisInFlight = false;
        analysisAbortController = null;
        if (analysisSoftTimeoutId) {
            clearTimeout(analysisSoftTimeoutId);
            analysisSoftTimeoutId = null;
        }
        if (analysisElapsedIntervalId) {
            clearInterval(analysisElapsedIntervalId);
            analysisElapsedIntervalId = null;
        }
        return;
    }
    analysisInFlight = false;
    analysisAbortController = null;
    if (analysisSoftTimeoutId) {
        clearTimeout(analysisSoftTimeoutId);
        analysisSoftTimeoutId = null;
    }
    if (analysisElapsedIntervalId) {
        clearInterval(analysisElapsedIntervalId);
        analysisElapsedIntervalId = null;
    }
    if (metaInfo) {
        const parts = [];
        if (Number.isFinite(metaInfo.queueMs)) parts.push(`coda: ${Math.round(metaInfo.queueMs / 1000)}s`);
        if (Number.isFinite(metaInfo.processingMs)) parts.push(`modello: ${Math.round(metaInfo.processingMs / 1000)}s`);
        if (Number.isFinite(metaInfo.totalMs)) parts.push(`totale: ${Math.round(metaInfo.totalMs / 1000)}s`);
        if (parts.length) {
            addMessage('system', `Debug: Breakdown tempi analisi iniziale -> ${parts.join(', ')}`);
        }
    }

    let parsed;
    try {
        parsed = parseJsonResponse(output);
    } catch (err) {
        parsed = {
            summary: 'Impossibile parsare JSON, testo fornito: ' + output,
            questions: [],
            resource_requirements: {}
        };
    }

    projectState.project_context = projectState.project_context || {};
    projectState.project_context.initial_analysis = {
        ...parsed,
        note: output,
        completed: true,
        timestamp: new Date().toISOString(),
        user_feedback: projectState.project_context?.initial_analysis?.user_feedback || ''
    };
    saveToLocalStorage();

    if (analysisStatus) {
        analysisStatus.textContent = '✅ Analisi iniziale completata. Rispondi alle domande o salva per procedere.';
    }

    projectState.project_context.initial_analysis.questions = parsed.questions || [];
    projectState.project_context.initial_analysis.answers = [];
    projectState.project_context.initial_analysis.completed = false;
    saveToLocalStorage();

    analysisCurrentQuestionIndex = 0;
    renderAnalysisQuestionnaire(parsed.questions || []);

    addMessage('system', 'Analisi iniziale completata. Rispondi alle domande una ad una e poi salva.');
}

function getSavedAnswersForQuestion(index) {
    const answers = projectState.project_context?.initial_analysis?.answers || [];
    return answers[index] || [];
}

function saveAnswersForQuestion(index, selectedValues) {
    projectState.project_context = projectState.project_context || {};
    projectState.project_context.initial_analysis = projectState.project_context.initial_analysis || {};
    const answers = projectState.project_context.initial_analysis.answers || [];
    answers[index] = selectedValues;
    projectState.project_context.initial_analysis.answers = answers;
    saveToLocalStorage();
}

function updateAnalysisNavigationButtons(questions = []) {
    const prev = document.getElementById('analysis-prev');
    const action = document.getElementById('analysis-action');

    const hasQuestions = questions.length > 0;
    const isLast = analysisCurrentQuestionIndex >= questions.length - 1;

    if (prev) {
        prev.disabled = !hasQuestions || analysisCurrentQuestionIndex <= 0;
        prev.classList.toggle('disabled', prev.disabled);
    }

    if (action) {
        if (!hasQuestions) {
            action.disabled = true;
            action.classList.add('disabled');
            action.textContent = 'Avanti';
            return;
        }

        action.disabled = false;
        action.classList.remove('disabled');
        action.textContent = isLast ? 'Salva risposte' : 'Avanti';
    }
}

function renderAnalysisQuestionnaire(questions = []) {
    const container = document.getElementById('analysis-questions');
    if (!container) return;

    container.innerHTML = '';
    if (!questions.length) {
        container.innerHTML = '<p>Nessuna domanda strutturata generata. Ripeti l\'analisi iniziale.</p>';
        return;
    }

    if (analysisCurrentQuestionIndex < 0) analysisCurrentQuestionIndex = 0;
    if (analysisCurrentQuestionIndex >= questions.length) analysisCurrentQuestionIndex = questions.length - 1;

    const q = questions[analysisCurrentQuestionIndex];
    const questionText = q.question || q.q || `Domanda ${analysisCurrentQuestionIndex + 1}`;
    const optionA = q.a || q.opzioneA || 'A';
    const optionB = q.b || q.opzioneB || 'B';
    const optionC = q.c || q.opzioneC || 'C';
    const optionAltro = q.altro || q.other || 'Altro';

    const header = document.createElement('div');
    header.style.marginBottom = '12px';
    header.style.fontSize = '13px';
    header.style.fontWeight = '700';
    header.textContent = `Domanda ${analysisCurrentQuestionIndex + 1} di ${questions.length}`;
    container.appendChild(header);

    const fieldset = document.createElement('fieldset');
    fieldset.style.marginTop = '16px';
    fieldset.style.padding = '12px';
    fieldset.style.background = 'var(--surface)';
    fieldset.style.border = '1px solid var(--border)';
    fieldset.style.borderRadius = '10px';

    const legend = document.createElement('legend');
    legend.style.marginBottom = '8px';
    legend.textContent = questionText;
    fieldset.appendChild(legend);

    const savedValues = getSavedAnswersForQuestion(analysisCurrentQuestionIndex);
    [optionA, optionB, optionC, optionAltro].forEach((opt, optIdx) => {
        const id = `analysis-q-${analysisCurrentQuestionIndex}-${optIdx}`;
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.marginBottom = '4px';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'analysis-question-option';
        input.id = id;
        input.value = opt;
        input.style.marginRight = '6px';
        if (savedValues.includes(opt)) input.checked = true;

        label.appendChild(input);
        label.appendChild(document.createTextNode(opt));

        fieldset.appendChild(label);
    });

    container.appendChild(fieldset);
    updateAnalysisNavigationButtons(questions);
}


function collectAnalysisAnswers() {
    return projectState.project_context?.initial_analysis?.answers || [];
}

function getCurrentQuestionSelectedOptions() {
    return [...document.querySelectorAll('input[name="analysis-question-option"]:checked')]
        .map((el) => el.value);
}

function navigateAnalysisQuestion(step) {
    const questions = projectState.project_context?.initial_analysis?.questions || [];
    if (questions.length === 0) return;

    const selected = getCurrentQuestionSelectedOptions();
    if (selected.length === 0) {
        addMessage('system', 'Seleziona almeno un\'opzione prima di proseguire.');
        return;
    }

    saveAnswersForQuestion(analysisCurrentQuestionIndex, selected);

    const lastIndex = questions.length - 1;
    if (analysisCurrentQuestionIndex === lastIndex) {
        projectState.project_context.initial_analysis.completed = true;
        projectState.project_context.initial_analysis.answers = collectAnalysisAnswers();
        projectState.project_context.initial_analysis.timestamp = new Date().toISOString();
        saveToLocalStorage();

        const status = document.getElementById('analysis-status');
        if (status) {
            status.textContent = '✅ Tutte le domande completate. Premi Salva risposte per chiudere.';
        }

        return;
    }

    analysisCurrentQuestionIndex = Math.min(lastIndex, analysisCurrentQuestionIndex + step);
    renderAnalysisQuestionnaire(questions);
}

function handleAnalysisAction() {
    const questions = projectState.project_context?.initial_analysis?.questions || [];
    if (questions.length === 0) return;

    const lastIndex = questions.length - 1;
    if (analysisCurrentQuestionIndex >= lastIndex) {
        saveAnalysisResponse();
    } else {
        navigateAnalysisQuestion(1);
    }
}


function saveAnalysisResponse() {
    const questions = projectState.project_context?.initial_analysis?.questions || [];
    if (questions.length === 0) {
        addMessage('system', 'Nessuna domanda da salvare. Esegui prima l\'analisi iniziale.');
        return;
    }

    const selected = getCurrentQuestionSelectedOptions();
    if (selected.length === 0) {
        addMessage('system', 'Seleziona almeno un\'opzione prima di salvare.');
        return;
    }

    saveAnswersForQuestion(analysisCurrentQuestionIndex, selected);

    projectState.project_context.initial_analysis.completed = true;
    projectState.project_context.initial_analysis.answers = collectAnalysisAnswers();
    projectState.project_context.initial_analysis.timestamp = new Date().toISOString();
    projectState.project_context.initial_analysis_summary = getInitialAnalysisContext();
    saveToLocalStorage();

    const analysisStatus = document.getElementById('analysis-status');
    if (analysisStatus) {
        analysisStatus.textContent = '✅ Risposte salvate. Chiudi overlay e procedi con i tool.';
    }

    addMessage('system', 'Risposte di analisi salvate. Ora puoi eseguire i tool.');
    updateAnalysisButtonState();
    closeAnalysisOverlay();
}

async function generateInitialAnalysisFromBrief() {
    const brief = projectState.project.brief_originale || '';
    if (!brief) {
        return false;
    }

    addMessage('system', 'Analisi iniziale mancante. Generazione automatica in corso...');

    const prompt = `
[ROLE] Agente Analitico

[TASK]
Leggi questo brief e crea 3 domande a risposta multipla con 4 opzioni (quarta: Altro), con possibilità di selezione multipla, usando i termini degli elementi indicati.

Brief:
"${brief}"

[NOTA]
Non includere il target nel set di domande iniziali (verrà analizzato dopo dai tool). Concentrati su:
- obiettivi business di alto livello (senza metriche troppo specifiche)
- risorse interne già disponibili (team esistente, skill presenti, competenze attuali)
- competenze chiave richieste (coding, architettura, UX, data, operations)
- se in azienda è presente il profilo professionale necessario (sviluppatore, architetto, data engineer, PM)
- budget disponibile
- timeline e impegno tempo
- vincoli e limiti aziendali reali

Includi una domanda precisa tipo:
"Hai competenze di [coding/backend/devops/UX], oppure in azienda è disponibile il profilo professionale [sviluppatore, architetto, analista, PM]?"
Se manca il profilo, fai emergere la necessità di soluzioni low-code/no-code.

[OUTPUT]
{
  "questions": [
    {
      "question": "...",
      "a": "...",
      "b": "...",
      "c": "...",
      "altro": "...",
      "multiple": true
    }
  ]
}
`;

    let generated = '';
    try {
        generated = await callLLM(prompt, 'analitico');
    } catch (e) {
        addMessage('system', 'Impossibile generare l\'analisi automatica: ' + e.message);
        return false;
    }

    projectState.project_context = projectState.project_context || {};
    projectState.project_context.initial_analysis = {
        tipologia: 'Auto generata',
        obiettivo: 'Da definire (vedi domande automatiche)',
        target: 'Da definire',
        altro: '',
        note: generated,
        generated_questions: generated,
        completed: true,
        timestamp: new Date().toISOString()
    };

    saveToLocalStorage();
    addMessage('system', 'Analisi iniziale generata automaticamente e salvata nella memoria condivisa. Puoi modificare ulteriormente le risposte.');
    addManagerMessage('manager', `Analisi iniziale automatica:\n${generated}`);

    return true;
}

async function ensureInitialAnalysisCompleted() {
    if (projectState.project_context?.initial_analysis?.completed) {
        return true;
    }

    const proceed = confirm('Analisi iniziale non presente. Vuoi procedere comunque? I risultati potrebbero essere meno accurati o pi\u00F9 incompleti.');
    if (proceed) {
        addMessage('system', 'Attenzione: analisi iniziale assente. Risultati potenzialmente meno accurati.');
        return true;
    }
    addMessage('system', 'Esecuzione annullata. Se vuoi, puoi avviare l\'analisi iniziale con il pulsante accanto al brief (Analisi Iniziale).');
    return false;
}

async function newProject() {
    if (!confirm('Vuoi creare un nuovo progetto? Il progetto corrente verrà perso se non l\'hai scaricato.')) {
        return;
    }

    projectState = {
        project: { brief_originale: '', project_id: '' },
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

    const ok = await ensureProjectSlot();
    if (!ok) return;

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
    updateAnalysisButtonState();
    addMessage('system', 'Nuovo progetto creato.');
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
    const isInitialAnalysisPath = path.includes('initial_analysis') || path.includes('initial_analysis_summary');

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
            if (normalizeKey(key) === 'projectid') return;
            if (isInitialAnalysisPath && (normalizeKey(key) === 'questions' || normalizeKey(key) === 'answers')) return;
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

function buildManagerPrompt(userMessage) {
    const lastGapReport = managerState.lastGapAnalysis?.report_html || '';
    const recentHistory = managerState.conversationHistory.slice(-6);

    return `
[ROLE] AI Manager Strategico
[CONTEXT]
Stato progetto attuale:
${JSON.stringify(projectState, null, 2)}

Configurazione tool attuale:
${JSON.stringify(config, null, 2)}

Messaggio utente: "${userMessage}"

Ultimo report lacune disponibile:
${lastGapReport || 'Nessun report recente disponibile'}

Cronologia sintetica conversazione:
${JSON.stringify(recentHistory, null, 2)}

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
        addManagerMessage('manager', `⚠️ Errore Manager: ${err.message}`);
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
        addMessage('system', 'Configura prima la API Key nelle impostazioni');
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
        addMessage('system', 'Inserisci prima il brief del progetto');
        return;
    }

    const analysisOk = await ensureInitialAnalysisCompleted();
    if (!analysisOk) {
        addMessage('system', 'L\'analisi iniziale è richiesta; prova a salvarla o attendi la generazione automatica.');
        return;
    }

    const slotOk = await ensureProjectSlot();
    if (!slotOk) return;

    // Aggiorna contesto analisi iniziale nell'oggetto progetto
    projectState.project_context = projectState.project_context || {};
    projectState.project_context.initial_analysis_summary = getInitialAnalysisContext();
    saveToLocalStorage();

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
        
        addMessage('ai', `🔄 ${toolName.toUpperCase()} completato!`, result);
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

async function callLLM(prompt, agentType = 'analitico', options = {}) {
    const temperature = agentType === 'creativo' ? 0.5 : 0.1;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 60000;
    const onMeta = typeof options.onMeta === 'function' ? options.onMeta : null;

    const allowed = consumeQuota('llm', config.apiKey, LLM_DAILY_LIMIT);
    if (!allowed) {
        throw new Error(`Limite giornaliero LLM (${LLM_DAILY_LIMIT}) raggiunto per questa API Key.`);
    }

    const controller = new AbortController();
    if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    const startMs = performance.now();
    try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            }),
            signal: controller.signal
        });
    } catch (err) {
        if (err && err.name === 'AbortError') {
            throw new Error(`Timeout richiesta API (${Math.round(timeoutMs / 1000)}s). Riprova o usa un modello più veloce.`);
        }
        throw new Error(`Errore di rete: ${err.message || 'Impossibile contattare il server.'}`);
    } finally {
        clearTimeout(timeoutId);
    }
    
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
    if (onMeta) {
        const queueMs = Number.parseInt(response.headers.get('x-openrouter-queue-ms') || '', 10);
        const processingMs = Number.parseInt(response.headers.get('x-openrouter-processing-ms') || '', 10);
        const totalMs = performance.now() - startMs;
        onMeta({
            queueMs: Number.isFinite(queueMs) ? queueMs : null,
            processingMs: Number.isFinite(processingMs) ? processingMs : null,
            totalMs
        });
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('Risposta vuota dal modello. Riprova.');
    }
    return content;
}

function truncateText(text, maxLen = 280) {
    if (!text) return '';
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen - 1) + '...';
}

async function callTavilySearch(query, searchDepth = 'basic', apiKey = config.tavilyApiKey) {
    if (!apiKey) return null;
    const allowed = consumeQuota('tavily', apiKey, TAVILY_DAILY_LIMIT);
    if (!allowed) {
        addMessage('system', `Limite giornaliero Tavily (${TAVILY_DAILY_LIMIT}) raggiunto per questa API Key.`);
        return null;
    }
    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                query,
                search_depth: searchDepth
            })
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (err) {
        console.warn('Tavily search failed', err);
        return null;
    }
}

async function getTavilyData(query, searchDepth = 'basic') {
    const inlineKey = document.getElementById('tavily-key')?.value || '';
    const resolvedKey = (config.tavilyApiKey || inlineKey).trim();
    if (!resolvedKey) {
        const proceed = confirm('Tavily API Key non presente. Vuoi procedere senza ricerca web? I risultati potrebbero essere meno accurati.');
        if (!proceed) return { cancelled: true, data: null };
        addMessage('system', 'Attenzione: Tavily non configurato. Risultati potenzialmente meno accurati.');
        return { cancelled: false, data: null };
    }
    if (!config.tavilyApiKey && resolvedKey) {
        config.tavilyApiKey = resolvedKey;
    }
    addMessage('system', 'Debug: Tavily in esecuzione...');
    const data = await callTavilySearch(query, searchDepth, resolvedKey);
    if (!data) {
        addMessage('system', 'Debug: Tavily non ha restituito risultati.');
    } else {
        const count = Array.isArray(data.results) ? data.results.length : 0;
        addMessage('system', `Debug: Tavily completato (${count} risultati).`);
    }
    return { cancelled: false, data };
}

function formatTavilySourcesForPrompt(tavilyData, maxResults = TAVILY_MAX_RESULTS) {
    if (!tavilyData || !Array.isArray(tavilyData.results)) return '';
    const items = tavilyData.results.slice(0, maxResults).map((item, idx) => {
        const title = item.title || 'Titolo non disponibile';
        const url = item.url || '';
        const snippet = truncateText(item.content || item.snippet || item.text || '', 260);
        return `${idx + 1}. ${title} | ${url} | ${snippet}`.trim();
    });
    return items.join('\n');
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
    const initialAnalysis = getInitialAnalysisContext();
    
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
        },
        "Start-up/Fai-da-te": {
            budget: "0-50k €",
            team: "1-3 persone",
            tech: "No-code: Bubble, Webflow, Airtable, Zapier",
            time: "1-3 mesi MVP",
            no: "NO sviluppo custom, NO React/Vue, NO backend custom"
        }
    };
    
    const constraints = scaleData[scale] || scaleData["PMI"];
    
    const prompt = `
[ROLE] Agente Creativo Strategico

[CONTEXT - SCALA PROGETTO]
Scala: ${scale}
Budget: ${constraints.budget}
Team: ${constraints.team}
Tech: ${constraints.tech}
Time: ${constraints.time}
VIETATO: ${constraints.no}

[CONTEXT - ANALISI INIZIALE]
${initialAnalysis || 'Nessuna analisi iniziale disponibile'}

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
    const initialAnalysis = getInitialAnalysisContext();

    const tavilyResult = await getTavilyData(`Target e buyer personas per: ${brief}`, 'advanced');
    if (tavilyResult.cancelled) {
        throw new Error('Operazione annullata dall\'utente.');
    }
    const tavilySources = formatTavilySourcesForPrompt(tavilyResult.data, config.num_personas);
    
    const prompt = `
[ROLE] Marketing & Target Analysis Expert

[CONTEXT]
Analisi iniziale:
${initialAnalysis || 'Nessuna analisi iniziale disponibile.'}

Prodotto: ${brief}
Fonti web (Tavily, aggiornate):
${tavilySources || 'Nessuna fonte disponibile.'}
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
    const initialAnalysis = getInitialAnalysisContext();
    const tavilyResult = await getTavilyData(`Competitor aziende per: ${brief}`, 'advanced');
    if (tavilyResult.cancelled) {
        throw new Error('Operazione annullata dall\'utente.');
    }
    const tavilySources = formatTavilySourcesForPrompt(tavilyResult.data, config.num_competitor);
    
    const prompt = `
[ROLE] Competitive Analysis Expert

[CONTEXT]
Analisi iniziale:
${initialAnalysis || 'Nessuna analisi iniziale disponibile.'}

Prodotto: ${brief}
Fonti web (Tavily, aggiornate):
${tavilySources || 'Nessuna fonte disponibile.'}

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
    const initialAnalysis = getInitialAnalysisContext();
    const tavilyResult = await getTavilyData(`Trend e fattori PESTEL per: ${brief}`, 'advanced');
    if (tavilyResult.cancelled) {
        throw new Error('Operazione annullata dall\'utente.');
    }
    const tavilySources = formatTavilySourcesForPrompt(tavilyResult.data, TAVILY_MAX_RESULTS);

    const prompt = `
[ROLE] Strategic Analyst

[CONTEXT]
Analisi iniziale:
${initialAnalysis || 'Nessuna analisi iniziale disponibile.'}

Prodotto: ${brief}
Target: ${target}
Fonti web (Tavily, aggiornate):
${tavilySources || 'Nessuna fonte disponibile.'}

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
    const initialAnalysis = getInitialAnalysisContext();
    
    const prompt = `
[ROLE] Copywriter Neuromarketing

[CONTEXT]
Analisi iniziale:
${initialAnalysis || 'Nessuna analisi iniziale disponibile.'}

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
    const brief = projectState.project.brief_originale;
    const product = projectState.product || {};
    const target = projectState.target?.analisi_area || 'Mercato generale';
    const initialAnalysis = getInitialAnalysisContext();
    const tavilyResult = await getTavilyData(`Prezzi, range di mercato e competitor per: ${brief}`, 'advanced');
    if (tavilyResult.cancelled) {
        throw new Error('Operazione annullata dall\'utente.');
    }
    const tavilySources = formatTavilySourcesForPrompt(tavilyResult.data, TAVILY_MAX_RESULTS);
    
    const prompt = `
[ROLE] Pricing Strategist

[CONTEXT]
Analisi iniziale:
${initialAnalysis || 'Nessuna analisi iniziale disponibile.'}

Brand: ${brand}
Problema: ${product.problema || 'N/A'}
Target: ${target}
Fonti web (Tavily, aggiornate):
${tavilySources || 'Nessuna fonte disponibile.'}

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
    const initialAnalysis = getInitialAnalysisContext();
    
    const prompt = `
[ROLE] Marketing & ADV Strategist

[CONTEXT]
Analisi iniziale:
${initialAnalysis || 'Nessuna analisi iniziale disponibile.'}

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
    const initialAnalysis = getInitialAnalysisContext();
    
    const prompt = `
[ROLE] Risk Management Expert

[CONTEXT]
Analisi iniziale:
${initialAnalysis || 'Nessuna analisi iniziale disponibile.'}

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

















































