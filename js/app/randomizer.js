let currentLang = localStorage.getItem('dbd_lang') || 'pt';
let currentTheme = localStorage.getItem('dbd_theme') || 'dark';
let currentRole = 'survivor'; // 'survivor' or 'killer'
let currentViewMode = 'icon'; // 'icon' or 'list'

let excludedCharacters = new Set();
let excludedPerks = new Set();

let savedBuilds = JSON.parse(localStorage.getItem('dbd_saved_builds') || '[]');
let customEntries = JSON.parse(localStorage.getItem('dbd_custom_entries') || '[]');

let currentRollResult = null;
let isSpinning = false;

// ====== Builds Destaque / Construtor ======
let builderRole = 'survivor';
let featuredBuilds = [];                                   // vindas do servidor (json/builds-destaque.json)
let featuredDrafts = JSON.parse(localStorage.getItem('dbd_featured_drafts') || '[]'); // rascunho do curador
let featuredFilter = { type: '', role: '', text: '' };

// ====== Caminhos (se a página ficar fora da raiz do projeto, ajuste BASE, ex.: '../') ======
const BASE = '';
const JSON_DIR = BASE + 'json/';
const IMG_LOCAL = BASE + 'css/img/';
// Fallback caso a imagem não exista localmente (o mesmo host que o streaming-mode.js do zip usa). '' desativa.
const IMG_REMOTE = 'https://astofernest.github.io/perkroulette/css/img/';

// Imagens dos losangos (css/img/perk_purple.png e perk_empty.png) via variáveis CSS
(function () {
    // URLs absolutas: o CSS agora está em css/, então caminhos relativos seriam resolvidos a partir dele
    const layers = f => [IMG_LOCAL + f, IMG_REMOTE ? IMG_REMOTE + f : null].filter(Boolean)
        .map(u => `url("${new URL(u, document.baseURI).href}")`).join(', ');
    document.documentElement.style.setProperty('--perk-purple', layers('perk_purple.png'));
    document.documentElement.style.setProperty('--perk-empty', layers('perk_empty.png'));
    document.documentElement.style.setProperty('--char-bg', layers('personagens/fundo_pdbd.png'));
})();

const GENERAL_NAME = 'perk ensinável geral';
let initialData = { survivors: [], killers: [], survivorPerks: [], killerPerks: [] };
let itemsData = { surv: {}, kill: {} };
const EMPTY_ITEM = { namePt: 'Nenhum', nameEn: 'None', addons: [], icon: 'fa-toolbox' };
const ITEM_TYPE_ICON = { 'Chaves': 'fa-key', 'Lanternas': 'fa-lightbulb', 'Mapas': 'fa-map', 'Kit Médico': 'fa-kit-medical', 'Caixa de Ferramenta': 'fa-toolbox', 'Frasco de Névoa': 'fa-flask' };

// Sugestões de tipos de build (o curador também pode digitar um tipo novo)
const DEFAULT_BUILD_TYPES = ['Furtivo', 'Gen rush', 'Perseguição', 'Informação', 'Cura', 'Controle de mapa', 'Meta', 'Meme / Troll'];

// ====== Formato dos nomes de arquivo (igual ao app.js / streaming-mode.js do zip) ======
// itens, addons, poderes e pasta do killer
const fmt = s => s.toString().toLowerCase().normalize('NFD').replace(/ /g, '').replace(/'/g, '').replace(/-/g, '').replace(/:/g, '').replace(/\p{Diacritic}/gu, '');
// ícones de perk: iconperks-<slug>.png
const perkSlug = s => s.toString().toLowerCase().normalize('NFD').replace(/ /g, '').replace(/'/g, '').replace(/-/g, '').replace(/&/g, 'and').replace(/!/g, '').replace(/:/g, '').replace(/\p{Diacritic}/gu, '');
// retrato do personagem: minúsculas, espaços -> hífen (mantém acentos)
const charPhotoSlug = s => s.toLowerCase().replace(/\s+/g, '-');
const cleanChar = c => c.replace(/Perk ensinável de /gi, '').trim();
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => [...arr].sort(() => 0.5 - Math.random());

// helpers novos
const $ = id => document.getElementById(id);
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
const nm = o => (currentLang === 'pt' ? o.namePt : o.nameEn);
const slugId = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'build';

// rel = caminho relativo a css/img/ ; devolve [local, remoto]
const imgPaths = rel => IMG_REMOTE ? [encodeURI(IMG_LOCAL + rel), encodeURI(IMG_REMOTE + rel)] : [encodeURI(IMG_LOCAL + rel)];
const entryImgs = e => e.image ? [e.image] : (e.rel ? imgPaths(e.rel) : []);

function buildCharacters(perks, role) {
    const names = [...new Set(perks.map(p => cleanChar(p.character)).filter(n => n.toLowerCase() !== GENERAL_NAME))]
        .sort((a, b) => a.localeCompare(b));
    return names.map(n => ({
        id: fmt(n), namePt: n, nameEn: n,
        rel: 'personagens/' + charPhotoSlug(n) + '.png',
        icon: role === 'survivor' ? 'fa-user' : 'fa-skull'
    }));
}

function buildPerks(perks, role) {
    const type = role === 'survivor' ? 'surv' : 'kill';
    const seen = new Set();
    return [...perks].sort((a, b) => a.perk_name.localeCompare(b.perk_name)).map(p => {
        const c = cleanChar(p.character);
        let id = type + '_' + perkSlug(p.perk_name);
        while (seen.has(id)) id += '_';
        seen.add(id);
        return {
            id, ownerId: c.toLowerCase() === GENERAL_NAME ? 'geral' : fmt(c),
            namePt: p.perk_name,
            nameEn: p.perk_name_en || p.perk_name,
            rel: type + '/iconperks-' + perkSlug(p.perk_name) + '.png',
            icon: role === 'survivor' ? 'fa-shield-halved' : 'fa-skull'
        };
    });
}

async function loadData() {
    const get = n => fetch(JSON_DIR + n + '.json').then(r => { if (!r.ok) throw new Error(n + ' (' + r.status + ')'); return r.json(); });
    const [sp, kp, is, ik] = await Promise.all([get('survivor-perks'), get('killer-perks'), get('itens-surv'), get('itens-kill')]);
    initialData.survivors = buildCharacters(sp.perks, 'survivor');
    initialData.killers = buildCharacters(kp.perks, 'killer');
    initialData.survivorPerks = buildPerks(sp.perks, 'survivor');
    initialData.killerPerks = buildPerks(kp.perks, 'killer');
    itemsData.surv = is;
    itemsData.kill = {};
    Object.keys(ik).forEach(k => { itemsData.kill[k.toLowerCase().trim()] = ik[k]; });
}

// Builds Destaque: arquivo opcional no servidor. Se não existir, a lista fica vazia.
async function loadFeatured() {
    try {
        const r = await fetch(JSON_DIR + 'builds-destaque.json', { cache: 'no-cache' });
        if (!r.ok) throw new Error('builds-destaque (' + r.status + ')');
        const d = await r.json();
        featuredBuilds = (Array.isArray(d) ? d : (d.builds || [])).filter(b => b && b.name && b.character && Array.isArray(b.perks));
    } catch (e) {
        console.warn('Builds destaque não carregadas:', e.message);
        featuredBuilds = [];
    }
}

// Sobrevivente: item aleatório + 2 addons. Killer: poder do personagem sorteado + 2 addons dele.
function rollItem(role, character) {
    if (role === 'survivor') {
        const tipos = Object.keys(itemsData.surv);
        if (!tipos.length) return null;
        const tipo = pick(tipos);
        const item = pick(itemsData.surv[tipo]);
        return {
            namePt: item.nome, nameEn: item.nome, rel: 'itens/surv/' + fmt(item.nome) + '.png',
            icon: ITEM_TYPE_ICON[tipo] || 'fa-toolbox',
            addons: shuffle(item.complementos).slice(0, 2).map(a => ({ namePt: a, nameEn: a, rel: 'itens/surv/complementos/' + fmt(a) + '.png' }))
        };
    }
    const entry = itemsData.kill[character.namePt.toLowerCase().trim()];
    if (!entry || !entry[0]) return null;
    const poder = entry[0];
    return {
        namePt: poder.nome, nameEn: poder.nome, rel: 'itens/kill/poderes/' + fmt(poder.nome) + '.png',
        icon: 'fa-skull',
        addons: shuffle(poder.complementos).slice(0, 2).map(a => ({ namePt: a, nameEn: a, rel: 'itens/kill/' + fmt(character.namePt) + '/' + fmt(a) + '.png' }))
    };
}

// Troca de imagem com cadeia de fallback: local -> remoto -> ícone FontAwesome
function imgTag(cands, cls, fa, faCls) {
    if (!cands.length) return `<i class="fa-solid ${fa} ${faCls}"></i>`;
    return `<img src="${cands[0]}" data-srcs="${cands.join('|')}" data-idx="0" data-fa="${fa}" data-fa-cls="${faCls}" loading="lazy" class="${cls}"><i class="fa-solid ${fa} ${faCls} hidden"></i>`;
}
function setImg(imgEl, cands, fa, faCls) {
    const icon = imgEl.parentElement.querySelector('i');
    if (!cands.length) {
        imgEl.classList.add('hidden');
        if (icon) icon.className = `fa-solid ${fa} ${faCls}`;
        return;
    }
    imgEl.dataset.srcs = cands.join('|'); imgEl.dataset.idx = '0'; imgEl.dataset.fa = fa; imgEl.dataset.faCls = faCls;
    imgEl.classList.remove('hidden');
    if (icon) icon.classList.add('hidden');
    imgEl.src = cands[0];
}
document.addEventListener('error', e => {
    const el = e.target;
    if (!(el instanceof HTMLImageElement) || !el.dataset.srcs) return;
    const list = el.dataset.srcs.split('|');
    const n = parseInt(el.dataset.idx, 10) + 1;
    if (n < list.length) { el.dataset.idx = n; el.src = list[n]; }
    else handleImageError(el, el.dataset.fa);
}, true);


const i18n = {
    pt: {
        subtitle: "Gerador Inteligente de Loadouts para Dead by Daylight",
        navRandomizer: "Modo Roleta",
        navFeatured: "Builds Destaque",
        navBuilder: "Criar Build",
        navPool: "Acervo de Conteúdo",
        navSaved: "Builds Salvas",
        navAdmin: "Cadastro / Admin",
        lblConfigTitle: "Configurações do Sorteio",
        btnResetFilters: "Resetar Filtros",
        lblRole: "Função / Lado",
        lblIncludeOptions: "Elementos da Roleta",
        optCharacter: "Randomizar Personagem",
        optPerks: "Randomizar Perks (4)",
        optItems: "Item / Poder + Addons",
        lblSoundEffect: "Efeito Sonoro de Roleta",
        lblSpinBtn: "GIRAR ROLETA",
        lblResultHeader: "Resultado do Loadout",
        btnSaveBuild: "Salvar Build",
        btnExportBuild: "Exportar",
        lblPerksHeader: "Vantagens (Perks Equipadas)",
        lblItemTitle: "Item / Poder",
        txtTip: "Acesse a aba 'Acervo de Conteúdo' para desativar itens específicos.",
        lblPoolTitle: "Acervo de Conteúdo & Filtros",
        lblPoolSub: "Clique nos retratos ou vantagens para ativar/desativar (itens cinzas com '✕' não entrarão no sorteio).",
        txtModeIcon: "Ícones / Retratos",
        txtModeList: "Lista Simplificada",
        btnSelectAll: "Todos",
        btnDeselectAll: "Nenhum",
        lblPoolCharacters: "Personagens Ativos",
        txtSavedBuildsTitle: "Builds Salvas",
        txtSavedBuildsSub: "Sua coleção de combinações favoritas armazenadas localmente.",
        btnExportJson: "Exportar JSON",
        btnImportJson: "Importar Build",
        txtAdminTitle: "Painel de Cadastros & Repositório",
        txtAdminSub: "Cadastre novos personagens, vantagens ou itens e baixe o banco JSON atualizado para commit no repositório.",
        btnExportDatabase: "Baixar JSON do Repositório",
        txtAdminFormTitle: "Cadastrar Novo Elemento",
        btnAddSubmit: "Cadastrar Elemento",
        txtCustomEntriesTitle: "Itens Cadastrados Localmente",
        lblImportTitle: "Importar Build Compartilhada",
        lblImportDesc: "Cole o código JSON da build gerada pelo aplicativo abaixo:",
        // Builds Destaque
        fTitle: "Builds Destaque",
        fSub: "Builds recomendadas e selecionadas. Filtre por tipo, veja na roleta ou salve na sua coleção.",
        fLblType: "Tipo de build",
        fLblRole: "Lado",
        fLblSearch: "Buscar",
        // Construtor
        bldTitle: "Criar Build Manual",
        bldSub: "Escolha o personagem, as 4 perks e o item/poder. Depois salve na sua coleção.",
        bldLblChar: "Personagem",
        bldLblItem: "Item",
        bldLblPower: "Poder (definido pelo personagem)",
        bldLblAddon1: "Add-on 1",
        bldLblAddon2: "Add-on 2",
        bldLblName: "Nome da build (opcional)",
        bldBtnSave: "Salvar Build",
        bldBtnShow: "Ver na Roleta",
        bldBtnClear: "Limpar",
        bldPreviewTitle: "Pré-visualização",
        // Curador
        lblCurator: "Modo curador: gerar JSON de Builds Destaque",
        lblCuratorHint: "Monte a build acima, preencha os dados abaixo e adicione ao rascunho. Quando terminar, baixe o JSON e suba para a pasta json/ do seu servidor/GitHub.",
        fLblName: "Nome da build",
        fLblTypeInput: "Tipo",
        fLblSource: "Fonte (de onde tirou)",
        fLblUrl: "Link da fonte (opcional)",
        fBtnAdd: "Adicionar ao rascunho",
        fLblIncludeServer: "Incluir builds já publicadas no arquivo",
        fBtnDownload: "Baixar builds-destaque.json",
        fBtnCopy: "Copiar JSON",
        fBtnClearDrafts: "Limpar rascunho"
    },
    en: {
        subtitle: "Dead by Daylight Streamer Loadout Generator",
        navRandomizer: "Randomization Mode",
        navFeatured: "Featured Builds",
        navBuilder: "Create Build",
        navPool: "Content Pool",
        navSaved: "Saved Builds",
        navAdmin: "Registration / Admin",
        lblConfigTitle: "Randomizer Settings",
        btnResetFilters: "Reset Filters",
        lblRole: "Role",
        lblIncludeOptions: "Roulette Elements",
        optCharacter: "Randomize Character",
        optPerks: "Randomize Perks (4)",
        optItems: "Item / Power + Addons",
        lblSoundEffect: "Roulette Sound Effect",
        lblSpinBtn: "SPIN ROULETTE",
        lblResultHeader: "Loadout Result",
        btnSaveBuild: "Save Build",
        btnExportBuild: "Export Build",
        lblPerksHeader: "Equipped Perks",
        lblItemTitle: "Item / Power",
        txtTip: "Go to 'Content Pool' tab to disable specific characters or perks.",
        lblPoolTitle: "Content Pool & Filters",
        lblPoolSub: "Click portraits or perks to enable/disable them (gray items with '✕' won't be rolled).",
        txtModeIcon: "Icons / Portraits",
        txtModeList: "Simplified List",
        btnSelectAll: "Select All",
        btnDeselectAll: "Clear All",
        lblPoolCharacters: "Active Characters",
        txtSavedBuildsTitle: "Saved Builds",
        txtSavedBuildsSub: "Your collection of favorite loadouts stored locally.",
        btnExportJson: "Export JSON",
        btnImportJson: "Import Build",
        txtAdminTitle: "Registration & Repo Manager",
        txtAdminSub: "Register new perks/items and download updated database JSON for GitHub repo.",
        btnExportDatabase: "Download Repo JSON",
        txtAdminFormTitle: "Register New Entry",
        btnAddSubmit: "Register Entry",
        txtCustomEntriesTitle: "Locally Registered Entries",
        lblImportTitle: "Import Shared Build",
        lblImportDesc: "Paste the build JSON code generated by the app below:",
        fTitle: "Featured Builds",
        fSub: "Recommended, hand-picked builds. Filter by type, view in the roulette or save to your collection.",
        fLblType: "Build type",
        fLblRole: "Role",
        fLblSearch: "Search",
        bldTitle: "Create Manual Build",
        bldSub: "Pick the character, 4 perks and item/power. Then save it to your collection.",
        bldLblChar: "Character",
        bldLblItem: "Item",
        bldLblPower: "Power (set by the character)",
        bldLblAddon1: "Add-on 1",
        bldLblAddon2: "Add-on 2",
        bldLblName: "Build name (optional)",
        bldBtnSave: "Save Build",
        bldBtnShow: "View in Roulette",
        bldBtnClear: "Clear",
        bldPreviewTitle: "Preview",
        lblCurator: "Curator mode: generate Featured Builds JSON",
        lblCuratorHint: "Build it above, fill in the data below and add it to the draft. When done, download the JSON and upload it to the json/ folder of your server/GitHub.",
        fLblName: "Build name",
        fLblTypeInput: "Type",
        fLblSource: "Source (where it came from)",
        fLblUrl: "Source link (optional)",
        fBtnAdd: "Add to draft",
        fLblIncludeServer: "Include already published builds in the file",
        fBtnDownload: "Download builds-destaque.json",
        fBtnCopy: "Copy JSON",
        fBtnClearDrafts: "Clear draft"
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    applyTheme();
    updateLanguageUI();
    renderSavedBuilds();
    bindFeaturedEvents();
    renderFeaturedDrafts();
    renderFeatured();
    try {
        await loadData();
        renderPool();
        populateBuilder();
    } catch (e) {
        console.error(e);
        document.getElementById('characterPoolContainer').innerHTML =
            '<div class="col-span-full text-xs text-red-400 p-4">Não foi possível carregar os arquivos em <code>' + JSON_DIR + '</code> (' + e.message + '). Abra o site por um servidor (http://), não clicando direto no arquivo, e confira se a pasta json/ está ao lado deste HTML.</div>';
        showToast('Falha ao carregar os JSON.', 'error');
    }
    await loadFeatured();
    renderFeatured();
});

function handleImageError(imgEl, fallbackFaIcon) {
    imgEl.classList.add('hidden');
    const parent = imgEl.parentElement;
    let iconEl = parent.querySelector('i');
    if (!iconEl) {
        iconEl = document.createElement('i');
        parent.appendChild(iconEl);
    }
    iconEl.className = `fa-solid ${fallbackFaIcon || 'fa-image'} ${imgEl.dataset.faCls || 'text-2xl text-dbd-cyan'}`;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg shadow-xl text-xs font-bold text-white flex items-center gap-2 pointer-events-auto border transform transition-all duration-300 translate-y-2 opacity-0 ${
        type === 'success' ? 'bg-emerald-900 border-emerald-500' :
        type === 'error' ? 'bg-red-950 border-dbd-red' : 'bg-neutral-900 border-neutral-700'
    }`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check text-emerald-400' : type === 'error' ? 'fa-circle-exclamation text-dbd-red' : 'fa-circle-info text-dbd-cyan'}"></i> <span>${esc(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('dbd_lang', lang);
    updateLanguageUI();
    renderPool();
    renderSavedBuilds();
    renderFeatured();
    renderFeaturedDrafts();
    populateBuilder();
    if (currentRollResult) renderResultDisplay(currentRollResult);
}

function updateLanguageUI() {
    const t = i18n[currentLang];
    for (let key in t) {
        const el = document.getElementById(key);
        if (el) el.innerText = t[key];
    }

    if (currentLang === 'pt') {
        document.getElementById('langPtBtn').className = "px-2.5 py-1 rounded bg-dbd-red text-white font-bold";
        document.getElementById('langEnBtn').className = "px-2.5 py-1 rounded text-neutral-400 hover:text-white font-bold";
    } else {
        document.getElementById('langEnBtn').className = "px-2.5 py-1 rounded bg-dbd-red text-white font-bold";
        document.getElementById('langPtBtn').className = "px-2.5 py-1 rounded text-neutral-400 hover:text-white font-bold";
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('dbd_theme', currentTheme);
    applyTheme();
}

function applyTheme() {
    const icon = document.getElementById('themeIcon');
    if (currentTheme === 'light') {
        document.documentElement.classList.remove('dark');
        icon.className = 'fa-solid fa-sun text-sm text-yellow-500';
    } else {
        document.documentElement.classList.add('dark');
        icon.className = 'fa-solid fa-moon text-sm text-yellow-400';
    }
}

const TABS = ['main', 'featured', 'builder', 'pool', 'saved'];
const TAB_BTN_OFF = "px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 text-dbd-muted hover:text-white";
const TAB_BTN_ON = "px-4 py-1.5 rounded-md text-xs font-bold transition flex items-center gap-2 bg-dbd-red text-white shadow";

function switchTab(tab) {
    const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
    TABS.forEach(t => {
        const pane = document.getElementById('tab' + cap(t));
        const btn = document.getElementById('tab' + cap(t) + 'Btn');
        if (pane) pane.classList.add('hidden');
        if (btn) btn.className = TAB_BTN_OFF;
    });

    const activeTab = document.getElementById('tab' + cap(tab));
    const activeBtn = document.getElementById('tab' + cap(tab) + 'Btn');

    if (activeTab && activeBtn) {
        activeTab.classList.remove('hidden');
        activeBtn.className = TAB_BTN_ON;
    }
}

function setRole(role) {
    currentRole = role;
    const survBtn = document.getElementById('roleSurvBtn');
    const killBtn = document.getElementById('roleKillBtn');

    if (role === 'survivor') {
        survBtn.className = "px-4 py-2 text-xs rounded-lg border-2 border-dbd-cyan bg-dbd-cyan/10 text-dbd-cyan font-bold flex items-center justify-center gap-2 transition hover:bg-dbd-cyan/20";
        killBtn.className = "px-4 py-2 text-xs rounded-lg border-2 border-neutral-800 text-neutral-400 font-bold flex items-center justify-center gap-2 transition hover:border-dbd-red hover:text-dbd-red";
    } else {
        killBtn.className = "px-4 py-2 text-xs rounded-lg border-2 border-dbd-red bg-dbd-red/10 text-dbd-red font-bold flex items-center justify-center gap-2 transition hover:bg-dbd-red/20";
        survBtn.className = "px-4 py-2 text-xs rounded-lg border-2 border-neutral-800 text-neutral-400 font-bold flex items-center justify-center gap-2 transition hover:border-dbd-cyan hover:text-dbd-cyan";
    }
    renderPool();
}

function setViewMode(mode) {
    currentViewMode = mode;
    const iconBtn = document.getElementById('viewIconBtn');
    const listBtn = document.getElementById('viewListBtn');

    if (mode === 'icon') {
        iconBtn.className = "px-3 py-1 rounded text-xs font-bold bg-dbd-panel text-white flex items-center gap-1.5 shadow";
        listBtn.className = "px-3 py-1 rounded text-xs font-bold text-dbd-muted hover:text-white flex items-center gap-1.5";
    } else {
        listBtn.className = "px-3 py-1 rounded text-xs font-bold bg-dbd-panel text-white flex items-center gap-1.5 shadow";
        iconBtn.className = "px-3 py-1 rounded text-xs font-bold text-dbd-muted hover:text-white flex items-center gap-1.5";
    }
    renderPool();
}

function getActiveCharacters() {
    const baseList = currentRole === 'survivor' ? initialData.survivors : initialData.killers;
    const customList = customEntries.filter(e => e.category === 'character' && e.role === currentRole);
    return [...baseList, ...customList];
}

function getActivePerks() {
    const baseList = currentRole === 'survivor' ? initialData.survivorPerks : initialData.killerPerks;
    const customList = customEntries.filter(e => e.category === 'perk' && e.role === currentRole);
    return [...baseList, ...customList];
}

function getGeneralPerks() {
    const ids = new Set(getActiveCharacters().map(c => c.id));
    return getActivePerks().filter(p => !p.ownerId || p.ownerId === 'geral' || !ids.has(p.ownerId));
}

function getPoolEntries() {
    const perks = getActivePerks();
    const general = new Set(getGeneralPerks().map(p => p.id));
    const list = getActiveCharacters().map(c => ({ char: c, perks: perks.filter(p => p.ownerId === c.id && !general.has(p.id)) }));
    const gen = getGeneralPerks();
    if (gen.length) list.push({ char: { id: 'geral', namePt: 'Perks Gerais', nameEn: 'General Perks', icon: 'fa-globe', general: true }, perks: gen });
    return list;
}

function renderPool() {
    const chars = getActiveCharacters();
    const perksAll = getActivePerks();
    const charContainer = document.getElementById('characterPoolContainer');
    charContainer.innerHTML = '';

    const activeCharCount = chars.filter(c => !excludedCharacters.has(c.id)).length;
    document.getElementById('charCountTag').innerText = `${activeCharCount} / ${chars.length}`;
    const activePerkCount = perksAll.filter(p => !excludedPerks.has(p.id)).length;
    const pct = perksAll.length ? Math.round(activePerkCount / perksAll.length * 100) : 0;
    document.getElementById('txtPoolStatus').innerText = currentLang === 'pt' ? `${pct}% dos Perks Ativos (${activePerkCount})` : `${pct}% of Perks Active (${activePerkCount})`;

    getPoolEntries().forEach(({ char, perks: charPerks }) => {
        const isCharExcluded = char.general ? charPerks.every(p => excludedPerks.has(p.id)) : excludedCharacters.has(char.id);
        const charName = currentLang === 'pt' ? char.namePt : char.nameEn;
        const toggleCall = char.general ? 'toggleGeneral()' : `toggleCharacterExclusion('${char.id}')`;

        const card = document.createElement('div');
        card.className = `bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 relative group transition hover:border-neutral-700 flex flex-col ${isCharExcluded ? 'grayed-out' : ''}`;
        card.dataset.search = (char.namePt + ' ' + char.nameEn + ' ' + charPerks.map(p => p.namePt + ' ' + p.nameEn).join(' ')).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

        const perksGridHtml = charPerks.map(perk => {
            const isPerkExcluded = excludedPerks.has(perk.id);
            const perkName = currentLang === 'pt' ? perk.namePt : perk.nameEn;
            return `
                <div onclick="event.stopPropagation(); togglePerkExclusion('${perk.id}')"
                     class="group/perk flex flex-col items-center w-[4.75rem] cursor-pointer" title="${perkName}">
                    <div class="perk-diamond perk-diamond-sm ${isPerkExcluded ? 'is-empty' : ''}">
                        <div class="perk-diamond-inner">
                            ${imgTag(entryImgs(perk), 'w-full h-full object-contain', perk.icon || 'fa-shield', 'text-purple-200 text-xl')}
                        </div>
                    </div>
                    <span class="text-[10px] font-bold text-neutral-300 text-center leading-tight line-clamp-2 mt-0.5">${perkName}</span>
                </div>`;
        }).join('');

        if (currentViewMode === 'icon') {
            card.innerHTML = `
                <div onclick="${toggleCall}" class="cursor-pointer flex flex-col items-center gap-2 border-b border-neutral-800 pb-4">
                    <div class="char-card w-24 flex items-center justify-center text-dbd-cyan">
                        ${imgTag(entryImgs(char), 'w-full h-full object-contain', char.icon || 'fa-user', 'text-5xl text-dbd-cyan')}
                    </div>
                    <div class="text-center">
                        <h4 class="text-xs font-black text-white uppercase tracking-wide">${charName}</h4>
                        <span class="text-[10px] text-dbd-cyan font-semibold uppercase">${char.general ? 'Perks' : currentRole}</span>
                    </div>
                </div>
                <div class="flex flex-wrap justify-center gap-x-1 gap-y-2 pt-1">
                    ${perksGridHtml || '<span class="text-[10px] text-neutral-600 italic">Nenhum perk vinculado</span>'}
                </div>`;
        } else {
            card.innerHTML = `
                <div onclick="${toggleCall}" class="cursor-pointer flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <i class="fa-solid ${char.icon || 'fa-user'} text-dbd-cyan text-xs"></i>
                        <span class="text-xs font-bold text-white">${charName}</span>
                    </div>
                    <span class="text-[10px] text-neutral-500 font-mono">${charPerks.length} Perks</span>
                </div>`;
        }
        charContainer.appendChild(card);
    });

    if (document.getElementById('inputSearch').value) filterPoolBySearch();
}

function toggleGeneral() {
    const gen = getGeneralPerks();
    const allExcluded = gen.every(p => excludedPerks.has(p.id));
    gen.forEach(p => allExcluded ? excludedPerks.delete(p.id) : excludedPerks.add(p.id));
    renderPool();
}

function toggleCharacterExclusion(id) {
    if (excludedCharacters.has(id)) {
        excludedCharacters.delete(id);
    } else {
        excludedCharacters.add(id);
    }
    renderPool();
}

function togglePerkExclusion(id) {
    if (excludedPerks.has(id)) {
        excludedPerks.delete(id);
    } else {
        excludedPerks.add(id);
    }
    renderPool();
}

function toggleAllPool(enable) {
    const chars = getActiveCharacters();
    const perks = getActivePerks();

    if (enable) {
        excludedCharacters.clear();
        excludedPerks.clear();
    } else {
        chars.forEach(c => excludedCharacters.add(c.id));
        perks.forEach(p => excludedPerks.add(p.id));
    }
    renderPool();
}

function resetFilters() {
    excludedCharacters.clear();
    excludedPerks.clear();
    document.getElementById('inputSearch').value = '';
    renderPool();
    showToast("Filtros resetados com sucesso!", "info");
}

function filterPoolBySearch() {
    const term = document.getElementById('inputSearch').value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    Array.from(document.getElementById('characterPoolContainer').children).forEach(card => {
        if (card.dataset.search === undefined) return;
        card.style.display = card.dataset.search.includes(term) ? 'block' : 'none';
    });
}

function playBeepSound(freq = 440) {
    if (!document.getElementById('chkSound').checked) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
    } catch (e) {}
}

function spinRoulette() {
    if (isSpinning) return;

    const doChar = document.getElementById('chkCharacter').checked;
    const doPerks = document.getElementById('chkPerks').checked;
    const doItems = document.getElementById('chkItems').checked;

    if (!doChar && !doPerks && !doItems) {
        showToast("Marque ao menos um elemento da roleta!", "error");
        return;
    }

    const availableChars = getActiveCharacters().filter(c => !excludedCharacters.has(c.id));
    const availablePerks = getActivePerks().filter(p => !excludedPerks.has(p.id));

    if (doChar && availableChars.length === 0) {
        showToast("Selecione ao menos 1 personagem ativo no acervo!", "error");
        return;
    }
    if (doPerks && availablePerks.length < 4) {
        showToast("Selecione ao menos 4 perks ativos no acervo!", "error");
        return;
    }

    // O que não for sorteado é mantido do resultado atual (se for do mesmo lado)
    const prev = (currentRollResult && currentRollResult.role === currentRole) ? currentRollResult : null;
    let keepChar = !doChar && prev ? prev.character : null;
    let keepPerks = !doPerks && prev ? prev.perks : null;
    let keepItem = !doItems && prev ? prev.item : null;

    // Sem resultado anterior não há o que manter: sorteia uma vez só para preencher
    const needChar = !doChar && !keepChar;
    const needPerks = !doPerks && !keepPerks;
    if (needChar && availableChars.length === 0) { showToast("Selecione ao menos 1 personagem ativo no acervo!", "error"); return; }
    if (needPerks && availablePerks.length < 4) { showToast("Selecione ao menos 4 perks ativos no acervo!", "error"); return; }
    if (needChar) keepChar = pick(availableChars);
    if (needPerks) keepPerks = shuffle(availablePerks).slice(0, 4);

    const parts = { char: doChar, perks: doPerks, items: doItems };

    isSpinning = true;
    const spinBtn = document.getElementById('btnSpin');
    spinBtn.disabled = true;
    spinBtn.classList.add('opacity-50', 'cursor-not-allowed');

    let steps = 22;
    let speed = 50;

    function step() {
        playBeepSound(300 + (22 - steps) * 15);

        const character = doChar ? pick(availableChars) : keepChar;
        const perks = doPerks ? shuffle(availablePerks).slice(0, 4) : keepPerks;
        let item;
        if (doItems) item = rollItem(currentRole, character) || EMPTY_ITEM;
        else if (keepItem) item = keepItem;
        else item = rollItem(currentRole, character) || EMPTY_ITEM;

        currentRollResult = {
            role: currentRole,
            character,
            perks,
            item,
            date: new Date().toLocaleDateString()
        };

        renderResultDisplay(currentRollResult, true, parts);

        steps--;
        if (steps > 0) {
            speed += 14;
            setTimeout(step, speed);
        } else {
            isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            renderResultDisplay(currentRollResult, false, parts);
            playBeepSound(880);
            showToast("Novo Loadout gerado!", "success");
        }
    }

    step();
}

function renderResultDisplay(result, isSpinningAnim = false, parts = { char: true, perks: true, items: true }) {
    const charName = currentLang === 'pt' ? result.character.namePt : result.character.nameEn;
    document.getElementById('displayCharName').innerText = charName;
    document.getElementById('displayCharRole').innerText = result.role.toUpperCase();

    setImg(document.getElementById('displayCharImg'), entryImgs(result.character), result.character.icon || 'fa-user-ninja', 'text-8xl text-neutral-600');
    document.getElementById('displayCharIcon').classList.toggle('hidden', entryImgs(result.character).length > 0);
    document.getElementById('displayCharFrame').classList.toggle('spinning-reel', isSpinningAnim && parts.char);

    result.perks.forEach((perk, i) => {
        document.getElementById(`perkName${i}`).innerText = currentLang === 'pt' ? perk.namePt : perk.nameEn;
        const cands = entryImgs(perk);
        setImg(document.getElementById(`perkImg${i}`), cands, perk.icon || 'fa-shield-halved', 'text-4xl text-purple-200');
        document.getElementById(`perkIcon${i}`).classList.toggle('hidden', cands.length > 0);
        document.getElementById(`perkInner${i}`).classList.toggle('spinning-reel', isSpinningAnim && parts.perks);
        document.getElementById(`perkInner${i}`).parentElement.classList.remove('is-empty');
    });

    const item = result.item || EMPTY_ITEM;
    document.getElementById('displayItemBox').classList.toggle('spinning-reel', isSpinningAnim && parts.items);
    document.getElementById('displayItemName').innerText = currentLang === 'pt' ? item.namePt : item.nameEn;
    const itemCands = entryImgs(item);
    setImg(document.getElementById('displayItemImg'), itemCands, item.icon || 'fa-toolbox', 'text-4xl text-dbd-cyan');
    document.getElementById('displayItemIcon').classList.toggle('hidden', itemCands.length > 0);

    [1, 2].forEach(n => {
        const addon = (item.addons || [])[n - 1];
        const box = document.getElementById(`displayAddon${n}`);
        const img = document.getElementById(`displayAddonImg${n}`);
        const nameEl = document.getElementById(`displayAddonName${n}`);
        if (nameEl) nameEl.innerText = addon ? (currentLang === 'pt' ? addon.namePt : addon.nameEn) : `Add-on ${n}`;
        if (addon) {
            box.title = currentLang === 'pt' ? addon.namePt : addon.nameEn;
            setImg(img, entryImgs(addon), 'fa-puzzle-piece', 'text-xl text-neutral-400');
        } else {
            box.title = `Add-on ${n}`;
            setImg(img, [], 'fa-puzzle-piece', 'text-xl text-neutral-400');
        }
    });
}

function saveCurrentBuild() {
    if (!currentRollResult) {
        showToast("Gire a roleta primeiro!", "error");
        return;
    }
    savedBuilds.unshift({
        id: Date.now(),
        ...currentRollResult
    });
    persistSavedBuilds();
    renderSavedBuilds();
    showToast("Build salva com sucesso!", "success");
}

function persistSavedBuilds() {
    localStorage.setItem('dbd_saved_builds', JSON.stringify(savedBuilds));
}

function renderSavedBuilds() {
    const container = document.getElementById('savedBuildsContainer');
    document.getElementById('savedCountBadge').innerText = savedBuilds.length;
    container.innerHTML = '';

    if (savedBuilds.length === 0) {
        container.innerHTML = `<div class="col-span-full py-12 text-center text-dbd-muted text-xs">Nenhuma build salva ainda. Gire a roleta ou crie uma build manual e clique em "Salvar Build"!</div>`;
        return;
    }

    savedBuilds.forEach(build => {
        const charName = currentLang === 'pt' ? build.character.namePt : build.character.nameEn;
        const buildItem = build.item || EMPTY_ITEM;
        const itemName = currentLang === 'pt' ? buildItem.namePt : buildItem.nameEn;

        const card = document.createElement('div');
        card.className = "bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 relative group hover:border-dbd-red transition shadow";

        let perkIconsHtml = build.perks.map(p => `
            <div class="perk-diamond perk-diamond-xs" title="${esc(currentLang === 'pt' ? p.namePt : p.nameEn)}">
                <div class="perk-diamond-inner">
                    ${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield', 'text-purple-200 text-xs')}
                </div>
            </div>
        `).join('');

        card.innerHTML = `
            <div class="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded ${build.role === 'survivor' ? 'bg-dbd-cyan/20 text-dbd-cyan' : 'bg-dbd-red/20 text-dbd-red'}">${build.role.toUpperCase()}</span>
                <span class="text-[10px] text-neutral-500 font-mono mr-6">${esc(build.date || '')}</span>
            </div>
            ${build.name ? `<h4 class="text-sm font-black text-white">${esc(build.name)}</h4>` : ''}
            <div class="flex items-center gap-3">
                <div class="char-card w-11 shrink-0 flex items-center justify-center text-dbd-cyan text-lg">
                    ${imgTag(entryImgs(build.character), 'w-full h-full object-contain', build.character.icon || 'fa-user', 'text-lg')}
                </div>
                <div>
                    <h4 class="text-xs font-bold text-white">${esc(charName)}</h4>
                    <p class="text-[10px] text-dbd-muted"><i class="fa-solid fa-box text-[10px]"></i> ${esc(itemName)}</p>
                </div>
            </div>
            <div class="flex items-center gap-2 pt-1">
                ${perkIconsHtml}
                <button onclick="loadSavedBuild(${build.id})" class="ml-auto px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold rounded border border-neutral-700 text-white flex items-center gap-1.5 transition" title="Ver na roleta">
                    <i class="fa-solid fa-eye text-dbd-cyan"></i>
                </button>
                <button onclick="shareSavedBuild(${build.id})" class="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold rounded border border-neutral-700 text-white flex items-center gap-1.5 transition" title="Copiar link da build">
                    <i class="fa-solid fa-link text-dbd-purple"></i> Compartilhar
                </button>
            </div>
            <button onclick="deleteSavedBuild(${build.id})" class="absolute top-3 right-3 text-neutral-500 hover:text-red-400 text-xs p-1">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        container.appendChild(card);
    });
}

function loadSavedBuild(id) {
    const build = savedBuilds.find(b => b.id === id);
    if (!build) return;
    showBuildInRoulette(build);
}

function deleteSavedBuild(id) {
    savedBuilds = savedBuilds.filter(b => b.id !== id);
    persistSavedBuilds();
    renderSavedBuilds();
    showToast("Build removida!", "info");
}

function copyShareableBuild() {
    if (!currentRollResult) {
        showToast("Nenhuma build para exportar!", "error");
        return;
    }
    const jsonStr = JSON.stringify(currentRollResult);
    document.addEventListener('copy', function (e) {
        e.clipboardData.setData('text/plain', jsonStr);
        e.preventDefault();
    }, { once: true });
    document.execCommand('copy');
    showToast("Código da build copiado!", "success");
}

function exportAllBuildsJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedBuilds, null, 2));
    const anchor = document.createElement('a');
    anchor.setAttribute("href", dataStr);
    anchor.setAttribute("download", `dbd_saved_builds_${Date.now()}.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

function openImportModal() {
    document.getElementById('importModal').classList.remove('hidden');
}

function closeImportModal() {
    document.getElementById('importModal').classList.add('hidden');
}

function openPerksJsonModal() {
    document.getElementById('importPerksJsonModal').classList.remove('hidden');
}

function closePerksJsonModal() {
    document.getElementById('importPerksJsonModal').classList.add('hidden');
}

function processPerksJsonImport() {
    const rawText = document.getElementById('txtPerksJsonCode').value.trim();
    const role = document.getElementById('selPerksJsonRole').value;
    if (!rawText) { showToast("Cole o conteúdo do JSON primeiro!", "error"); return; }
    try {
        const data = JSON.parse(rawText);
        const perkList = data.perks || (Array.isArray(data) ? data : []);
        if (!Array.isArray(perkList) || perkList.length === 0) {
            showToast("Formato de JSON inválido ou sem vantagens listadas.", "error");
            return;
        }
        const type = role === 'survivor' ? 'surv' : 'kill';
        let addedCount = 0;
        perkList.forEach((p, idx) => {
            const perkName = p.perk_name || p.namePt || p.name;
            if (!perkName) return;
            const c = cleanChar(p.character || '');
            const isGeneral = !c || c.toLowerCase() === GENERAL_NAME;
            customEntries.push({
                id: 'imported_' + Date.now() + '_' + idx,
                category: 'perk', role,
                rarity: p.rarity || 'veryRare',
                namePt: perkName, nameEn: p.nameEn || perkName,
                image: p.image || '',
                rel: type + '/iconperks-' + perkSlug(perkName) + '.png',
                icon: p.icon || 'fa-shield-halved',
                ownerId: isGeneral ? 'geral' : fmt(c)
            });
            addedCount++;
        });
        localStorage.setItem('dbd_custom_entries', JSON.stringify(customEntries));
        renderPool();

        closePerksJsonModal();
        showToast(`${addedCount} vantagens carregadas do JSON com sucesso!`, "success");
    } catch (e) {
        showToast("Erro ao processar o arquivo JSON. Verifique a sintaxe.", "error");
    }
}

function confirmImportBuild() {
    const code = document.getElementById('txtImportCode').value.trim();
    if (!code) return;
    try {
        const parsed = JSON.parse(code);
        if (parsed.character && parsed.perks) {
            savedBuilds.unshift({
                id: Date.now(),
                ...parsed,
                date: new Date().toLocaleDateString()
            });
            persistSavedBuilds();
            renderSavedBuilds();
            closeImportModal();
            switchTab('saved');
            showToast("Build importada com sucesso!", "success");
        } else {
            showToast("JSON de build inválido.", "error");
        }
    } catch (e) {
        showToast("Erro ao processar o JSON informado.", "error");
    }
}

function handleAddNewEntry(e) {
    e.preventDefault();
    const category = document.getElementById('admCategory').value;
    const role = document.getElementById('admRole').value;
    const rarity = document.getElementById('admRarity').value;
    const namePt = document.getElementById('admNamePt').value.trim();
    const nameEn = document.getElementById('admNameEn').value.trim();
    const image = document.getElementById('admIconPath').value.trim();
    const icon = document.getElementById('admFaIcon').value.trim() || 'fa-star';
    const ownerId = document.getElementById('admCharOwner').value.trim() || 'geral';

    const newEntry = {
        id: 'custom_' + Date.now(),
        category,
        role,
        rarity,
        namePt,
        nameEn,
        image,
        icon,
        ownerId
    };

    customEntries.unshift(newEntry);
    localStorage.setItem('dbd_custom_entries', JSON.stringify(customEntries));

    document.getElementById('formAddEntry').reset();

    renderPool();
    showToast("Item cadastrado localmente!", "success");
}


function deleteCustomEntry(id) {
    customEntries = customEntries.filter(e => e.id !== id);
    localStorage.setItem('dbd_custom_entries', JSON.stringify(customEntries));

    renderPool();
    showToast("Item removido!", "info");
}

function exportUpdatedDatabaseJSON() {
    const fullExport = {
        initialData,
        customEntries
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullExport, null, 2));
    const anchor = document.createElement('a');
    anchor.setAttribute("href", dataStr);
    anchor.setAttribute("download", `dbd_updated_database.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    showToast("JSON do repositório gerado!", "success");
}


/* ==========================================================================
   HELPERS DE BUSCA (por nome) - usados pelo construtor e pelas Builds Destaque
   ========================================================================== */
const charsByRole = r => [...(r === 'survivor' ? initialData.survivors : initialData.killers),
    ...customEntries.filter(e => e.category === 'character' && e.role === r)];
const perksByRole = r => [...(r === 'survivor' ? initialData.survivorPerks : initialData.killerPerks),
    ...customEntries.filter(e => e.category === 'perk' && e.role === r)];

// procura por nome em PT ou EN, ignorando acentos/maiúsculas
function findByName(list, name) {
    const n = norm(name);
    if (!n) return null;
    return list.find(x => norm(x.namePt) === n || norm(x.nameEn) === n) || null;
}

function findSurvItem(name) {
    const n = norm(name);
    if (!n) return null;
    for (const tipo of Object.keys(itemsData.surv)) {
        const found = itemsData.surv[tipo].find(it => norm(it.nome) === n);
        if (found) return { tipo, found };
    }
    return null;
}

function getKillerPower(character) {
    if (!character) return null;
    const entry = itemsData.kill[character.namePt.toLowerCase().trim()];
    return (entry && entry[0]) || null;
}

// Monta o objeto "item" (mesmo formato do rollItem) a partir de nomes escolhidos
function makeItemObj(role, character, itemName, addonNames) {
    const wanted = (addonNames || []).filter(Boolean);
    if (role === 'survivor') {
        const hit = itemName ? findSurvItem(itemName) : null;
        if (!hit) return { ...EMPTY_ITEM };
        const { tipo, found } = hit;
        return {
            namePt: found.nome, nameEn: found.nome, rel: 'itens/surv/' + fmt(found.nome) + '.png',
            icon: ITEM_TYPE_ICON[tipo] || 'fa-toolbox',
            addons: wanted.map(n => found.complementos.find(a => norm(a) === norm(n)) || n)
                .map(a => ({ namePt: a, nameEn: a, rel: 'itens/surv/complementos/' + fmt(a) + '.png' }))
        };
    }
    const poder = getKillerPower(character);
    if (!poder) return { ...EMPTY_ITEM };
    return {
        namePt: poder.nome, nameEn: poder.nome, rel: 'itens/kill/poderes/' + fmt(poder.nome) + '.png',
        icon: 'fa-skull',
        addons: wanted.map(n => poder.complementos.find(a => norm(a) === norm(n)) || n)
            .map(a => ({ namePt: a, nameEn: a, rel: 'itens/kill/' + fmt(character.namePt) + '/' + fmt(a) + '.png' }))
    };
}

// Mostra qualquer build (salva, destaque, criada) na aba da roleta
function showBuildInRoulette(build) {
    currentRollResult = {
        role: build.role,
        character: build.character,
        perks: build.perks,
        item: build.item || { ...EMPTY_ITEM },
        date: build.date || new Date().toLocaleDateString()
    };
    setRole(build.role);
    renderResultDisplay(currentRollResult);
    switchTab('main');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ==========================================================================
   CONSTRUTOR DE BUILD MANUAL
   ========================================================================== */
function setBuilderRole(role, keepFields) {
    builderRole = role;
    const s = $('bldRoleSurvBtn'), k = $('bldRoleKillBtn');
    s.classList.toggle('active', role === 'survivor');
    k.classList.toggle('active', role === 'killer');
    if (!keepFields) {
        $('bldChar').value = '';
        [0, 1, 2, 3].forEach(i => $('bldPerk' + i).value = '');
        $('bldItem').value = '';
        $('bldAddon1').value = '';
        $('bldAddon2').value = '';
    }
    populateBuilder();
}

function populateBuilder() {
    if (!$('bldChar')) return;
    if (!initialData.survivors.length && !initialData.killers.length) { renderBuilderPreview(); return; }

    // guarda o estado atual para restaurar (ex.: troca de idioma)
    const prevChar = $('bldChar').value;
    const prevPerks = [0, 1, 2, 3].map(i => findByName(perksByRole(builderRole), $('bldPerk' + i).value));
    const prevItem = $('bldItem').value;
    const prevAddons = [$('bldAddon1').value, $('bldAddon2').value];

    // personagens
    $('bldChar').innerHTML = `<option value="">${currentLang === 'pt' ? '— Selecione o personagem —' : '— Select character —'}</option>` +
        charsByRole(builderRole).map(c => `<option value="${esc(c.id)}">${esc(nm(c))}</option>`).join('');
    if (prevChar && charsByRole(builderRole).some(c => c.id === prevChar)) $('bldChar').value = prevChar;

    // perks (datalist com autocompletar)
    $('bldPerkList').innerHTML = perksByRole(builderRole).map(p => `<option value="${esc(nm(p))}"></option>`).join('');
    prevPerks.forEach((p, i) => { if (p) $('bldPerk' + i).value = nm(p); });

    // itens (somente survivor)
    const noneLbl = currentLang === 'pt' ? '— Nenhum —' : '— None —';
    $('bldItem').innerHTML = `<option value="">${noneLbl}</option>` + Object.keys(itemsData.surv).map(tipo =>
        `<optgroup label="${esc(tipo)}">${itemsData.surv[tipo].map(it => `<option value="${esc(it.nome)}">${esc(it.nome)}</option>`).join('')}</optgroup>`
    ).join('');
    if (prevItem && findSurvItem(prevItem)) $('bldItem').value = findSurvItem(prevItem).found.nome;

    $('bldItemRow').style.display = builderRole === 'survivor' ? '' : 'none';
    $('bldPowerRow').style.display = builderRole === 'killer' ? '' : 'none';

    refreshAddonOptions(prevAddons);
    onBuilderChange();
}

function currentAddonChoices() {
    if (builderRole === 'survivor') {
        const hit = findSurvItem($('bldItem').value);
        return { power: null, list: hit ? hit.found.complementos : [] };
    }
    const character = charsByRole('killer').find(c => c.id === $('bldChar').value);
    const poder = getKillerPower(character);
    return { power: poder, list: poder ? poder.complementos : [] };
}

function refreshAddonOptions(keep) {
    const { power, list } = currentAddonChoices();
    const noneLbl = currentLang === 'pt' ? '— Nenhum —' : '— None —';
    const keepVals = keep || [$('bldAddon1').value, $('bldAddon2').value];
    [1, 2].forEach(n => {
        const sel = $('bldAddon' + n);
        sel.innerHTML = `<option value="">${noneLbl}</option>` + list.map(a => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
        const match = list.find(a => norm(a) === norm(keepVals[n - 1]));
        sel.value = match || '';
        sel.disabled = list.length === 0;
    });
    if (builderRole === 'killer') {
        $('bldPowerName').textContent = power ? power.nome : (currentLang === 'pt' ? 'Selecione um personagem' : 'Select a character');
    }
}

function onBuilderChange() {
    refreshAddonOptions();
    // marca em vermelho perks digitados que não existem na lista
    const perks = perksByRole(builderRole);
    [0, 1, 2, 3].forEach(i => {
        const el = $('bldPerk' + i);
        el.classList.toggle('is-invalid', !!el.value.trim() && !findByName(perks, el.value));
    });
    renderBuilderPreview();
}

function readBuilder() {
    const role = builderRole;
    const character = charsByRole(role).find(c => c.id === $('bldChar').value) || null;
    const perks = [0, 1, 2, 3].map(i => findByName(perksByRole(role), $('bldPerk' + i).value));
    return {
        role, character, perks,
        itemName: role === 'survivor' ? $('bldItem').value : '',
        addons: [$('bldAddon1').value, $('bldAddon2').value]
    };
}

function renderBuilderPreview() {
    const box = $('bldPreview');
    if (!box) return;
    const s = readBuilder();

    const charHtml = s.character
        ? `<div class="bd-preview-char">
                <div class="char-card flex items-center justify-center text-dbd-cyan">${imgTag(entryImgs(s.character), 'w-full h-full object-contain', s.character.icon || 'fa-user', 'text-5xl text-dbd-cyan')}</div>
                <div class="bd-preview-name">${esc(nm(s.character))}</div>
           </div>`
        : `<div class="bd-preview-char"><div class="char-card flex items-center justify-center text-neutral-600"><i class="fa-solid fa-user-ninja text-6xl"></i></div><div class="bd-preview-name">--</div></div>`;

    const perksHtml = s.perks.map((p, i) => `
        <div class="bd-preview-perk">
            <div class="perk-diamond perk-diamond-sm ${p ? '' : 'is-empty'}">
                <div class="perk-diamond-inner">${p ? imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xl') : ''}</div>
            </div>
            <span>${p ? esc(nm(p)) : 'Slot ' + (i + 1)}</span>
        </div>`).join('');

    const item = s.character ? makeItemObj(s.role, s.character, s.itemName, s.addons) : { ...EMPTY_ITEM };
    const slot = (o, fa, label) => `
        <div class="bd-item-slot">
            <div class="bd-item-box">${o ? imgTag(entryImgs(o), '', o.icon || fa, 'text-xl') : `<i class="fa-solid ${fa} text-xl"></i>`}</div>
            <span>${esc(label)}</span>
        </div>`;
    const hasItem = item.namePt !== 'Nenhum';
    const itemHtml = slot(hasItem ? item : null, hasItem ? (item.icon || 'fa-toolbox') : 'fa-toolbox', hasItem ? nm(item) : (currentLang === 'pt' ? 'Nenhum' : 'None'))
        + [0, 1].map(n => {
            const a = (item.addons || [])[n];
            return slot(a || null, 'fa-puzzle-piece', a ? nm(a) : 'Add-on ' + (n + 1));
        }).join('');

    box.innerHTML = `${charHtml}<div class="bd-preview-perks">${perksHtml}</div><div class="bd-preview-item">${itemHtml}</div>`;
}

// Valida e monta a build a partir do formulário
function buildFromBuilder() {
    const s = readBuilder();
    if (!s.character) { showToast(currentLang === 'pt' ? 'Selecione um personagem!' : 'Select a character!', 'error'); return null; }
    if (s.perks.some(p => !p)) { showToast(currentLang === 'pt' ? 'Escolha 4 perks válidos da lista!' : 'Pick 4 valid perks from the list!', 'error'); return null; }
    if (new Set(s.perks.map(p => p.id)).size < 4) { showToast(currentLang === 'pt' ? 'Há perks repetidos!' : 'Duplicate perks!', 'error'); return null; }
    if (s.addons[0] && s.addons[0] === s.addons[1]) { showToast(currentLang === 'pt' ? 'Os add-ons não podem ser iguais!' : 'Add-ons must be different!', 'error'); return null; }
    return {
        role: s.role,
        character: s.character,
        perks: s.perks,
        item: makeItemObj(s.role, s.character, s.itemName, s.addons),
        date: new Date().toLocaleDateString()
    };
}

function builderSave() {
    const b = buildFromBuilder();
    if (!b) return;
    const name = $('bldName').value.trim();
    savedBuilds.unshift({ id: Date.now(), ...(name ? { name } : {}), ...b });
    persistSavedBuilds();
    renderSavedBuilds();
    showToast(currentLang === 'pt' ? 'Build salva com sucesso!' : 'Build saved!', 'success');
}

function builderShow() {
    const b = buildFromBuilder();
    if (!b) return;
    showBuildInRoulette(b);
}

function builderClear() {
    $('bldName').value = '';
    setBuilderRole(builderRole, false);
}


/* ==========================================================================
   BUILDS DESTAQUE (lista pública vinda de json/builds-destaque.json)
   ========================================================================== */
function stubChar(role, name) {
    return { id: fmt(name), namePt: name, nameEn: name, rel: 'personagens/' + charPhotoSlug(name) + '.png', icon: role === 'survivor' ? 'fa-user' : 'fa-skull' };
}
function stubPerk(role, name) {
    const type = role === 'survivor' ? 'surv' : 'kill';
    return { id: type + '_' + perkSlug(name), namePt: name, nameEn: name, rel: type + '/iconperks-' + perkSlug(name) + '.png', icon: role === 'survivor' ? 'fa-shield-halved' : 'fa-skull' };
}

// Converte uma entrada do JSON (só nomes) em objeto de build completo
function resolveFeatured(b) {
    const role = b.role === 'killer' ? 'killer' : 'survivor';
    const character = findByName(charsByRole(role), b.character) || stubChar(role, b.character);
    const perks = (b.perks || []).slice(0, 4).map(n => findByName(perksByRole(role), n) || stubPerk(role, n));
    return {
        role, character, perks,
        item: makeItemObj(role, character, b.item, b.addons),
        date: new Date().toLocaleDateString(),
        name: b.name, source: b.source, type: b.type, url: b.url
    };
}

function featuredTypes() {
    return [...new Set(featuredBuilds.map(b => (b.type || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderFeatured() {
    const wrap = $('featuredContainer');
    const chips = $('featuredTypeChips');
    if (!wrap || !chips) return;

    // chips de tipo
    const types = featuredTypes();
    const count = t => featuredBuilds.filter(b => (b.type || '').trim() === t).length;
    const allLbl = currentLang === 'pt' ? 'Todos' : 'All';
    chips.innerHTML = `<button type="button" class="bd-chip ${featuredFilter.type === '' ? 'active' : ''}" data-type="">${allLbl}<small>${featuredBuilds.length}</small></button>` +
        types.map(t => `<button type="button" class="bd-chip ${featuredFilter.type === t ? 'active' : ''}" data-type="${esc(t)}">${esc(t)}<small>${count(t)}</small></button>`).join('');

    // filtro
    const term = norm(featuredFilter.text);
    const list = featuredBuilds.filter(b => {
        if (featuredFilter.type && (b.type || '').trim() !== featuredFilter.type) return false;
        if (featuredFilter.role && (b.role === 'killer' ? 'killer' : 'survivor') !== featuredFilter.role) return false;
        if (term) {
            const hay = norm([b.name, b.source, b.type, b.character, ...(b.perks || [])].join(' '));
            if (!hay.includes(term)) return false;
        }
        return true;
    });

    if (!list.length) {
        wrap.innerHTML = `<div class="bd-empty">${featuredBuilds.length
            ? (currentLang === 'pt' ? 'Nenhuma build encontrada com esses filtros.' : 'No builds match these filters.')
            : (currentLang === 'pt' ? 'Ainda não há builds em destaque.' : 'No featured builds yet.')}</div>`;
        return;
    }

    wrap.innerHTML = list.map(b => {
        const r = resolveFeatured(b);
        const idx = featuredBuilds.indexOf(b);
        const perkIcons = r.perks.map(p => `
            <div class="perk-diamond perk-diamond-xs" title="${esc(nm(p))}">
                <div class="perk-diamond-inner">${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}</div>
            </div>`).join('');
        const perkNames = r.perks.map(p => `<li>${esc(nm(p))}</li>`).join('');
        const srcLabel = currentLang === 'pt' ? 'Fonte' : 'Source';
        const safeUrl = /^https?:\/\//i.test(b.url || '') ? b.url : '';
        const srcHtml = b.source
            ? `<div class="bd-card-src">${srcLabel}: ${safeUrl ? `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${esc(b.source)}</a>` : esc(b.source)}</div>`
            : (safeUrl ? `<div class="bd-card-src"><a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${srcLabel}</a></div>` : '');
        const itemLine = r.item.namePt !== 'Nenhum' ? `<div class="bd-char-sub"><i class="fa-solid fa-box"></i> ${esc(nm(r.item))}</div>` : '';

        return `
        <div class="bd-card">
            <div class="bd-card-head">
                <span class="bd-badge">${esc(b.type || '—')}</span>
                <span class="bd-badge ${r.role === 'survivor' ? 'surv' : 'kill'}">${r.role.toUpperCase()}</span>
            </div>
            <div>
                <div class="bd-card-title">${esc(b.name)}</div>
                ${srcHtml}
            </div>
            <div class="bd-card-char">
                <div class="char-card w-11 shrink-0 flex items-center justify-center text-dbd-cyan text-lg">
                    ${imgTag(entryImgs(r.character), 'w-full h-full object-contain', r.character.icon || 'fa-user', 'text-lg')}
                </div>
                <div>
                    <div class="bd-char-name">${esc(nm(r.character))}</div>
                    ${itemLine}
                </div>
            </div>
            <div class="bd-perks">${perkIcons}</div>
            <ul class="bd-perk-names">${perkNames}</ul>
            <div class="bd-actions" style="margin-top:auto">
                <button type="button" class="bd-btn bd-btn-sm bd-btn-primary" data-act="view" data-idx="${idx}"><i class="fa-solid fa-eye"></i> ${currentLang === 'pt' ? 'Ver na roleta' : 'View'}</button>
                <button type="button" class="bd-btn bd-btn-sm" data-act="save" data-idx="${idx}"><i class="fa-solid fa-floppy-disk"></i> ${currentLang === 'pt' ? 'Salvar' : 'Save'}</button>
                <button type="button" class="bd-btn bd-btn-sm" data-act="link" data-idx="${idx}"><i class="fa-solid fa-link"></i> Link</button>
            </div>
        </div>`;
    }).join('');
}

function bindFeaturedEvents() {
    $('featuredTypeChips').addEventListener('click', e => {
        const btn = e.target.closest('[data-type]');
        if (!btn) return;
        featuredFilter.type = btn.dataset.type;
        renderFeatured();
    });
    $('featuredRole').addEventListener('change', e => { featuredFilter.role = e.target.value; renderFeatured(); });
    $('featuredSearch').addEventListener('input', e => { featuredFilter.text = e.target.value; renderFeatured(); });

    $('featuredContainer').addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const b = featuredBuilds[parseInt(btn.dataset.idx, 10)];
        if (!b) return;
        const r = resolveFeatured(b);
        if (btn.dataset.act === 'view') {
            showBuildInRoulette(r);
        } else if (btn.dataset.act === 'save') {
            savedBuilds.unshift({ id: Date.now(), name: b.name, ...r });
            persistSavedBuilds();
            renderSavedBuilds();
            showToast(currentLang === 'pt' ? 'Build salva na sua coleção!' : 'Build saved to your collection!', 'success');
        } else if (btn.dataset.act === 'link') {
            if (typeof window.copyBuildLink === 'function') window.copyBuildLink(r);
        }
    });

    $('fDraftList').addEventListener('click', e => {
        const btn = e.target.closest('[data-draft]');
        if (!btn) return;
        featuredDrafts = featuredDrafts.filter(d => d.id !== btn.dataset.draft);
        persistDrafts();
        renderFeaturedDrafts();
    });
}


/* ==========================================================================
   MODO CURADOR: gera o builds-destaque.json
   ========================================================================== */
function persistDrafts() {
    localStorage.setItem('dbd_featured_drafts', JSON.stringify(featuredDrafts));
}

function refreshTypeList() {
    const all = [...new Set([...DEFAULT_BUILD_TYPES, ...featuredTypes(), ...featuredDrafts.map(d => d.type)])].filter(Boolean);
    $('fTypeList').innerHTML = all.map(t => `<option value="${esc(t)}"></option>`).join('');
}

function addFeaturedDraft() {
    const b = buildFromBuilder();
    if (!b) return;
    const name = $('fName').value.trim();
    const type = $('fType').value.trim();
    const source = $('fSource').value.trim();
    const url = $('fUrl').value.trim();
    if (!name || !type) {
        showToast(currentLang === 'pt' ? 'Informe o nome e o tipo da build!' : 'Enter the build name and type!', 'error');
        return;
    }
    if (url && !/^https?:\/\//i.test(url)) {
        showToast(currentLang === 'pt' ? 'O link precisa começar com http:// ou https://' : 'The link must start with http:// or https://', 'error');
        return;
    }

    const taken = new Set([...featuredBuilds, ...featuredDrafts].map(x => x.id));
    let id = slugId(name), n = 2;
    while (taken.has(id)) id = slugId(name) + '-' + n++;

    const hasItem = b.item.namePt !== 'Nenhum';
    featuredDrafts.push({
        id, name, type, source,
        ...(url ? { url } : {}),
        role: b.role,
        character: b.character.namePt,
        perks: b.perks.map(p => p.namePt),
        // killer: o poder já é do personagem, então só guardamos o item do survivor
        item: (b.role === 'survivor' && hasItem) ? b.item.namePt : '',
        addons: (b.item.addons || []).map(a => a.namePt)
    });
    persistDrafts();
    renderFeaturedDrafts();
    $('fName').value = '';
    showToast(currentLang === 'pt' ? 'Build adicionada ao rascunho!' : 'Build added to draft!', 'success');
}

function renderFeaturedDrafts() {
    const list = $('fDraftList');
    if (!list) return;
    refreshTypeList();
    if (!featuredDrafts.length) {
        list.innerHTML = `<div class="bd-hint">${currentLang === 'pt' ? 'Rascunho vazio.' : 'Draft is empty.'}</div>`;
        return;
    }
    list.innerHTML = featuredDrafts.map(d => `
        <div class="bd-draft-row">
            <div><b>${esc(d.name)}</b> · ${esc(d.type)} · ${esc(d.character)}${d.source ? ' · ' + esc(d.source) : ''}</div>
            <button type="button" class="bd-btn bd-btn-sm bd-btn-danger" data-draft="${esc(d.id)}" title="Remover"><i class="fa-solid fa-trash"></i></button>
        </div>`).join('');
}

function mergedFeaturedJSON() {
    const includeServer = $('fIncludeServer').checked;
    const base = includeServer ? featuredBuilds : [];
    const ids = new Set(base.map(b => b.id));
    const merged = [...base, ...featuredDrafts.filter(d => !ids.has(d.id))];
    return JSON.stringify({ builds: merged }, null, 2);
}

function downloadFeaturedJSON() {
    if (!featuredDrafts.length && !$('fIncludeServer').checked) {
        showToast(currentLang === 'pt' ? 'Nada para exportar!' : 'Nothing to export!', 'error');
        return;
    }
    const blob = new Blob([mergedFeaturedJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'builds-destaque.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(currentLang === 'pt' ? 'builds-destaque.json gerado! Suba na pasta json/' : 'builds-destaque.json generated! Upload it to json/', 'success');
}

async function copyFeaturedJSON() {
    const text = mergedFeaturedJSON();
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        const t = document.createElement('textarea');
        t.value = text;
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        t.remove();
    }
    showToast(currentLang === 'pt' ? 'JSON copiado!' : 'JSON copied!', 'success');
}

function clearFeaturedDrafts() {
    if (!featuredDrafts.length) return;
    if (!confirm(currentLang === 'pt' ? 'Apagar todo o rascunho?' : 'Delete the whole draft?')) return;
    featuredDrafts = [];
    persistDrafts();
    renderFeaturedDrafts();
}
