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

// ====== Travas / histórico / acervo salvo ======
let locks = { char: false, perks: [false, false, false, false], item: false };
const HISTORY_MAX = 10;
let rollHistory = [];
try { rollHistory = JSON.parse(localStorage.getItem('dbd_history') || '[]'); } catch (e) { rollHistory = []; }
const POOL_KEY = 'dbd_pool_filters';

// ====== Caminhos (se a página ficar fora da raiz do projeto, ajuste BASE, ex.: '../') ======
const BASE = '';
const JSON_DIR = BASE + 'json/';
const IMG_LOCAL = BASE + 'css/img/';
// Fallback caso a imagem não exista localmente (o mesmo host que o streaming-mode.js do zip usa). '' desativa.
const IMG_REMOTE = 'https://astofernest.github.io/css/img/';

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

// ====== PTB ======
let ptbIds = new Set();
const isPtb = o => !!o && ptbIds.has(o.id);
const ptbCls = o => isPtb(o) ? ' is-ptb' : '';
const includePtb = () => { const el = $('chkPtb'); return !el || el.checked; };

// Perks usam data-perk em todo lugar, então a aura é gerada por CSS dinâmico (sem mexer em cada template)
function applyPtbStyles() {
    let st = $('ptbDynStyle');
    if (!st) { st = document.createElement('style'); st.id = 'ptbDynStyle'; document.head.appendChild(st); }
    const ids = [...ptbIds].filter(id => /^(surv|kill)_/.test(id));
    st.textContent = ids.map(id => {
        const v = String(id).replace(/["\\]/g, '\\$&');
        return `
[data-perk="${v}"].perk-diamond,
[data-perk="${v}"] .perk-diamond {
  animation: ptbPulse 1.8s ease-in-out infinite;
}
[data-perk="${v}"].perk-diamond::after,
[data-perk="${v}"] .perk-diamond::after {
  content: "!";
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ef4444, #991b1b);
  border: 1.5px solid #fca5a5;
  color: #ffffff;
  font-family: var(--font-ui, sans-serif);
  font-size: 13px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 10px rgba(220, 38, 38, 0.85), 0 2px 4px rgba(0, 0, 0, 0.6);
  z-index: 5;
  pointer-events: none;
}`;
    }).join('\n');
    const chk = $('chkPtb');
    if (chk && chk.closest('label')) chk.closest('label').style.display = ptbIds.size ? '' : 'none';
}

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
    const own = {};
    perks.forEach(p => {
        const n = cleanChar(p.character);
        if (n.toLowerCase() === GENERAL_NAME) return;
        (own[n] = own[n] || []).push(p);
    });
    return Object.keys(own).sort((a, b) => a.localeCompare(b)).map(n => ({
        id: fmt(n), namePt: n, nameEn: n,
        rel: 'personagens/' + charPhotoSlug(n) + '.png',
        icon: role === 'survivor' ? 'fa-user' : 'fa-skull',
        // PTB se algum perk marcar character_ptb, ou se TODOS os perks dele forem PTB
        ptb: own[n].some(p => p.character_ptb === true) || own[n].every(p => p.ptb === true)
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
            charName: c,
            desc: p.descricao || '',
            descEn: p.descricao_en || '',
            ptb: p.ptb === true,     
            classe: p.classe_rpg || '',
            tags: Array.isArray(p.tags) ? p.tags : null,   // opcional: sobrescreve a detecção automática de tags
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
    ptbIds = new Set([...initialData.survivors, ...initialData.killers,
        ...initialData.survivorPerks, ...initialData.killerPerks]
        .filter(x => x.ptb).map(x => x.id));
    applyPtbStyles();    
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

const ITEM_TYPE_EN = {
    'Chaves': 'Keys', 'Lanternas': 'Flashlights', 'Mapas': 'Maps',
    'Kit Médico': 'Med-Kits', 'Caixa de Ferramenta': 'Toolboxes', 'Frasco de Névoa': 'Fog Vials'
};
const itemLabel = it => currentLang === 'pt' ? it.nome : (it.nome_en || it.nome);
const addonPairs = it => (it.complementos || []).map((pt, i) => ({
    pt,
    en: (it.complementos_en && it.complementos_en[i]) || pt
}));

// Sobrevivente: item aleatório + 2 addons. Killer: poder do personagem sorteado + 2 addons dele.
function rollItem(role, character) {
    if (role === 'survivor') {
        const tipos = Object.keys(itemsData.surv);
        if (!tipos.length) return null;
        const tipo = pick(tipos);
        const item = pick(itemsData.surv[tipo]);
        return {
            namePt: item.nome,
            nameEn: item.nome_en || item.nome,
            rel: 'itens/surv/' + fmt(item.nome) + '.png',
            icon: ITEM_TYPE_ICON[tipo] || 'fa-toolbox',
            addons: shuffle(addonPairs(item)).slice(0, 2).map(a => ({
                namePt: a.pt,
                nameEn: a.en,
                rel: 'itens/surv/complementos/' + fmt(a.pt) + '.png'
            }))
        };
    }
    const entry = itemsData.kill[character.namePt.toLowerCase().trim()];
    if (!entry || !entry[0]) return null;
    const poder = entry[0];
    return {
        namePt: poder.nome,
        nameEn: poder.nome_en || poder.nome,
        rel: 'itens/kill/poderes/' + fmt(poder.nome) + '.png',
        icon: 'fa-skull',
        addons: shuffle(addonPairs(poder)).slice(0, 2).map(a => ({
            namePt: a.pt,
            nameEn: a.en,
            rel: 'itens/kill/' + fmt(character.namePt) + '/' + fmt(a.pt) + '.png'
        }))
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
        navPerks: "Todos os Perks",
        pgTitle: "Todos os Perks",
        pgSub: "Todos os perks do jogo dentro da moldura roxa, separados por lado.",
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
        fBtnClearDrafts: "Limpar rascunho",
        // Novos recursos
        btnShareImage: "Imagem",
        histTitle: "Histórico de Sorteios",
        histClear: "Limpar histórico",
        btnSavePool: "Salvar acervo",
        btnClearPool: "Limpar salvo",
        obsTitle: "Overlay para OBS",
        obsHint: "Adicione cada link como \"Fonte de Navegador\" no OBS. Cada vez que a página carrega (ou você atualiza a fonte), sai uma build nova. Survivor e Killer são independentes. Clicar na página ou apertar R também sorteia de novo.",
        obsLblSurv: "Link Survivor",
        obsLblKill: "Link Killer",
        obsOptSpin: "Animação de roleta",
        obsOptNames: "Mostrar nomes",
        obsLblScale: "Tamanho",
        obsLblLayout: "Layout",
        obsLblAuto: "Sortear sozinho a cada (s, 0 = não)",
        imgTitle: "Imagem da Build",
        imgBtnDownload: "Baixar PNG",
        imgBtnCopy: "Copiar imagem",
        // Roleta temática
        tagTitle: "Filtrar por tags",
        tagClear: "Limpar tags",
        tagModeAny: "Qualquer tag",
        tagModeAll: "Todas as tags",
        optPtb: "Incluir PTB",      
        navSquad: "Modo Squad",
        squadTitle: "Modo Squad",
        squadSub: "Sortear os 4 survivors de uma vez · Cada jogador do grupo recebe personagem, perks e item, com opção de evitar perks repetidos entre eles.",
        lblSquadUniquePerks: "Evitar perks repetidos entre jogadores",
        lblSpinSquad: "SORTEAR SQUAD",
        lblSaveSquad: "Salvar Squad",
        lblShareSquadImage: "Imagem",
        navDaily: "Desafios Diários",
        btnDailySurvToRoulette: "Ver Survivor na Roleta",
        btnDailyKillToRoulette: "Ver Killer na Roleta",
        dailyChallengesTitle: "5 Desafios de Hoje",
        dailyPoolBadge: "100 desafios · 5 por dia",        
    },
    en: {
        subtitle: "Dead by Daylight Streamer Loadout Generator",
        navRandomizer: "Randomization Mode",
        navFeatured: "Featured Builds",
        navBuilder: "Create Build",
        navPool: "Content Pool",
        navPerks: "All Perks",
        pgTitle: "All Perks",
        pgSub: "Every perk in the game inside the purple frame, split by side.",
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
        fBtnClearDrafts: "Clear draft",
        btnShareImage: "Image",
        histTitle: "Roll History",
        histClear: "Clear history",
        btnSavePool: "Save pool",
        btnClearPool: "Clear saved",
        obsTitle: "OBS Overlay",
        obsHint: "Add each link as a \"Browser Source\" in OBS. Every time the page loads (or you refresh the source) a new build is rolled. Survivor and Killer are independent. Clicking the page or pressing R also rerolls.",
        obsLblSurv: "Survivor link",
        obsLblKill: "Killer link",
        obsOptSpin: "Roulette animation",
        obsOptNames: "Show names",
        obsLblScale: "Size",
        obsLblLayout: "Layout",
        obsLblAuto: "Auto-roll every (s, 0 = off)",
        imgTitle: "Build Image",
        imgBtnDownload: "Download PNG",
        imgBtnCopy: "Copy image",
        // Themed roulette
        tagTitle: "Filter by tags",
        tagClear: "Clear tags",
        tagModeAny: "Any tag",
        tagModeAll: "All tags",
        optPtb: "Include PTB",       
        navSquad: "Squad Mode",
        squadTitle: "Squad Mode",
        squadSub: "Roll all 4 survivors at once · Each squad member gets a character, perks, and item, with an option to avoid duplicate perks across players.",
        lblSquadUniquePerks: "Avoid duplicate perks between players",
        lblSpinSquad: "ROLL SQUAD", 
        lblSaveSquad: "Save Squad",
        lblShareSquadImage: "Image",
        navDaily: "Daily Challenges",
        btnDailySurvToRoulette: "View Survivor in Roulette",
        btnDailyKillToRoulette: "View Killer in Roulette",
        dailyChallengesTitle: "Today's 5 Challenges",
        dailyPoolBadge: "100 challenges · 5 per day",        
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    applyTheme();
    updateLanguageUI();
    renderSavedBuilds();
    bindFeaturedEvents();
    renderFeaturedDrafts();
    renderFeatured();
    loadPoolFilters();
    bindHistoryEvents();
    initSquadMode();
    renderHistory();
    updateLockUI();
    updateObsLinks();
    try {
        await loadData();
        renderDailyTab();
        renderPool();
        populateBuilder();
        renderPerkGallery();
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
    renderHistory();
    populateBuilder();
    renderPerkGallery();
    renderSquad();
    renderSquad(isSquadSpinning); 
    renderSquadHistory();
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


// ====== Galeria de Perks (aba "Todos os Perks") ======
let perkGalleryRole = 'killer';
let perkGalleryText = '';

function setPerkGalleryRole(role) {
    perkGalleryRole = role;
    renderPerkGallery();
}

function renderPerkGallery() {
    const grid = $('perkGalleryGrid');
    if (!grid) return;

    const all = role => [
        ...(role === 'survivor' ? initialData.survivorPerks : initialData.killerPerks),
        ...customEntries.filter(e => e.category === 'perk' && e.role === role)
    ];
    const killAll = all('killer'), survAll = all('survivor');
    $('pgKillCount').textContent = killAll.length;
    $('pgSurvCount').textContent = survAll.length;

    const kBtn = $('pgRoleKillBtn'), sBtn = $('pgRoleSurvBtn');
    kBtn.classList.toggle('active', perkGalleryRole === 'killer');
    sBtn.classList.toggle('active', perkGalleryRole === 'survivor');

    const q = norm(perkGalleryText);
    const roleList = perkGalleryRole === 'survivor' ? survAll : killAll;
    const list = roleList
        .filter(p => !q || norm(p.namePt).includes(q) || norm(p.nameEn).includes(q))
        .filter(matchesTags);
    renderTagChips();   // atualiza contagens do menu lateral para o lado da galeria
    $('pgCount').textContent = list.length;

    if (!list.length) {
        grid.innerHTML = `<div class="bd-hint">${currentLang === 'pt' ? 'Nenhum perk encontrado.' : 'No perks found.'}</div>`;
        return;
    }
    grid.innerHTML = list.map(p => `
        <div class="perk-gallery-item" data-perk="${esc(p.id)}">
            <div class="perk-diamond perk-diamond-lg">
                <div class="perk-diamond-inner">
                    ${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-2xl')}
                </div>
            </div>
            <span class="perk-gallery-name">${esc(nm(p))}</span>
        </div>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    const s = $('pgSearch');
    if (s) s.addEventListener('input', e => { perkGalleryText = e.target.value; renderPerkGallery(); });
});

const TABS = ['main', 'daily', 'squad', 'featured', 'builder', 'pool', 'perks', 'saved'];
const TAB_BTN_OFF = "dbd-tab";
const TAB_BTN_ON = "dbd-tab is-active";

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
    currentTab = tab;
    updateTagDrawerForTab();
}

function resetResultDisplay() {
    const defaultIcons = ['fa-shield-halved', 'fa-bolt', 'fa-heart-pulse', 'fa-eye'];

    $('displayCharName').innerText = '--';
    $('displayCharRole').innerText = currentRole.toUpperCase();
    setImg($('displayCharImg'), [], 'fa-user-ninja', 'text-8xl text-neutral-600');
    $('displayCharFrame').classList.remove('is-ptb', 'spinning-reel');

    [0, 1, 2, 3].forEach(i => {
        $(`perkName${i}`).innerText = `Slot ${i + 1}`;
        setImg($(`perkImg${i}`), [], defaultIcons[i], 'text-4xl text-purple-300');
        const diamond = $(`perkInner${i}`).parentElement;
        diamond.classList.add('is-empty');
        diamond.removeAttribute('data-perk');
    });

    $('displayItemName').innerText = currentLang === 'pt' ? 'Nenhum' : 'None';
    setImg($('displayItemImg'), [], 'fa-toolbox', 'text-3xl');

    [1, 2].forEach(n => {
        $(`displayAddonName${n}`).innerText = `Add-on ${n}`;
        $(`displayAddon${n}`).title = `Add-on ${n}`;
        setImg($(`displayAddonImg${n}`), [], 'fa-puzzle-piece', 'text-lg');
    });
}

function setRole(role) {
    currentRole = role;
    resetLocks();
    const survBtn = document.getElementById('roleSurvBtn');
    const killBtn = document.getElementById('roleKillBtn');

    if (role === 'survivor') {
        survBtn.className = "dbd-seg-btn is-surv is-active";
        killBtn.className = "dbd-seg-btn is-kill";
    } else {
        killBtn.className = "dbd-seg-btn is-kill is-active";
        survBtn.className = "dbd-seg-btn is-surv";
    }

    // Se trocou de lado manualmente, volta o palco para o estado vazio inicial
    if (!currentRollResult || currentRollResult.role !== role) {
        currentRollResult = null;
        resetResultDisplay();
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
                     class="group/perk flex flex-col items-center w-[4.75rem] cursor-pointer" data-perk="${esc(perk.id)}">
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
                    <div class="char-card w-24 flex items-center justify-center text-dbd-cyan${ptbCls(char)}">
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
        if (isPtb(char)) {
            card.classList.add('ptb-card');
            card.insertAdjacentHTML('afterbegin', '<span class="ptb-tag">PTB</span>');
        }        
        charContainer.appendChild(card);
    });

    renderTagChips();

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
    activeTags.clear();
    saveTags();
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

(function injectPerkSpinCss() {
    if (document.getElementById('perkSpin3dStyle')) return;
    const st = document.createElement('style');
    st.id = 'perkSpin3dStyle';
    st.textContent = `
        @keyframes perkSpin3D {
            0%   { transform: perspective(700px) rotateY(0deg) scale(1); }
            50%  { transform: perspective(700px) rotateY(180deg) scale(1.06); }
            100% { transform: perspective(700px) rotateY(360deg) scale(1); }
        }
        @keyframes revealPerkFromEmpty {
            0%   { transform: perspective(700px) rotateY(180deg) scale(0.94); }
            65%  { transform: perspective(700px) rotateY(-12deg) scale(1.06); }
            100% { transform: perspective(700px) rotateY(0deg) scale(1); }
        }
        .perk-diamond.is-perk-spinning {
            animation: perkSpin3D 0.28s linear infinite;
        }
        .perk-diamond.is-empty-flipping {
            animation: perkSpin3D 0.34s linear infinite;
        }
        .perk-diamond.is-empty-flipping .perk-diamond-inner {
            transform: scaleX(-1);
        }
        .perk-diamond.is-perk-revealing {
            animation: revealPerkFromEmpty 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
    `;
    document.head.appendChild(st);
})();

function spinRoulette() {
    if (isSpinning) return;

    const chkChar = document.getElementById('chkCharacter').checked;
    const chkPerks = document.getElementById('chkPerks').checked;
    const chkItems = document.getElementById('chkItems').checked;

    if (!chkChar && !chkPerks && !chkItems) {
        showToast("Marque ao menos um elemento da roleta!", "error");
        return;
    }

    // O que não for sorteado (desmarcado ou travado) é mantido do resultado atual (se for do mesmo lado)
    const prev = (currentRollResult && currentRollResult.role === currentRole) ? currentRollResult : null;
    if (!prev) resetLocks();

     const availableChars = getActiveCharacters().filter(c => !excludedCharacters.has(c.id) && (includePtb() || !isPtb(c)));
    // Roleta temática: só entram perks que tenham as tags marcadas
     const availablePerks = getActivePerks().filter(p => !excludedPerks.has(p.id) && matchesTags(p) && (includePtb() || !isPtb(p)));

    const rollChar = chkChar && !locks.char;
    const rollSlots = [0, 1, 2, 3].map(i => chkPerks && !locks.perks[i]);
    // Killer: o poder pertence ao personagem, então muda junto com ele
    const rollItemFlag = (chkItems && !locks.item) || (currentRole === 'killer' && rollChar);

    if (!rollChar && !rollSlots.some(Boolean) && !rollItemFlag) {
        showToast("Tudo está travado ou desmarcado!", "error");
        return;
    }

    // Personagem
    let fixedChar = null;
    if (rollChar) {
        if (!availableChars.length) { showToast("Selecione ao menos 1 personagem ativo no acervo!", "error"); return; }
    } else {
        fixedChar = prev ? prev.character : null;
        if (!fixedChar) {
            if (!availableChars.length) { showToast("Selecione ao menos 1 personagem ativo no acervo!", "error"); return; }
            fixedChar = pick(availableChars);
        }
    }

    // Perks: slots fixos mantêm o anterior; slots sem anterior são preenchidos uma vez só
    const fixedPerks = [0, 1, 2, 3].map(i => (!rollSlots[i] && prev && prev.perks[i]) ? prev.perks[i] : null);
    const rollIdx = [0, 1, 2, 3].filter(i => rollSlots[i]);
    const fillIdx = [0, 1, 2, 3].filter(i => !rollSlots[i] && !fixedPerks[i]);
    const keptIds = new Set(fixedPerks.filter(Boolean).map(p => p.id));
    const pool = availablePerks.filter(p => !keptIds.has(p.id));
    if (pool.length < rollIdx.length + fillIdx.length) {
        showToast(activeTags.size
            ? (currentLang === 'pt' ? 'Poucos perks com essas tags. Remova alguma tag ou ative mais perks no acervo.' : 'Not enough perks with these tags. Remove a tag or enable more perks in the pool.')
            : "Selecione mais perks ativos no acervo!", "error");
        return;
    }
    const fillPicks = shuffle(pool).slice(0, fillIdx.length);
    fillIdx.forEach((slot, k) => { fixedPerks[slot] = fillPicks[k]; });
    const rollPool = pool.filter(p => !fillPicks.includes(p));

    const keepItem = !rollItemFlag && prev ? prev.item : null;
    const parts = { char: rollChar, perks: rollSlots, items: rollItemFlag };

    isSpinning = true;
    const spinBtn = document.getElementById('btnSpin');
    spinBtn.disabled = true;
    spinBtn.classList.add('opacity-50', 'cursor-not-allowed');
    
    let steps = 22;
    let speed = 50;
    const cycleOrder = shuffle(rollPool);
    const finalPicks = shuffle(rollPool).slice(0, rollIdx.length);
    const finalPerks = [0, 1, 2, 3].map(i => rollSlots[i] ? finalPicks[rollIdx.indexOf(i)] : fixedPerks[i]);

    function step() {
        const isLastThree = steps <= 3;
        const turn = 22 - steps;
        playBeepSound(isLastThree ? 540 + (3 - steps) * 55 : 300 + turn * 15);

        const character = rollChar ? pick(availableChars) : fixedChar;
        const perks = [0, 1, 2, 3].map(i => {
            if (!rollSlots[i]) return fixedPerks[i];
            if (!isLastThree && cycleOrder.length) {
                return cycleOrder[(turn + i) % cycleOrder.length];
            }
            return finalPerks[i];
        });
        const item = keepItem ? keepItem : (rollItem(currentRole, character) || EMPTY_ITEM);

        currentRollResult = {
            role: currentRole,
            character,
            perks,
            item,
            date: new Date().toLocaleDateString()
        };

        renderResultDisplay(currentRollResult, true, {
            ...parts,
            finale: isLastThree,
            revealedSlots: new Set()
        });

        steps--;
        if (steps > 0) {
            speed += isLastThree ? 30 : 14;
            setTimeout(step, speed);
        } else {
            const revealQueue = [...rollIdx];
            const revealedSlots = new Set();

            function revealNext(k) {
                if (k >= revealQueue.length) {
                    isSpinning = false;
                    spinBtn.disabled = false;
                    spinBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    renderResultDisplay(currentRollResult, false, {
                        ...parts,
                        finale: false,
                        revealedSlots: new Set(rollIdx)
                    });
                    addToHistory(currentRollResult);
                    playBeepSound(880);
                    showToast("Novo Loadout gerado!", "success");
                    return;
                }

                const slot = revealQueue[k];
                revealedSlots.add(slot);
                playBeepSound(640 + k * 65);

                renderResultDisplay(currentRollResult, true, {
                    ...parts,
                    finale: true,
                    revealedSlots,
                    justRevealed: slot
                });

                // Tempo entre cada perk revelar na cascata (ex.: 350ms)
                setTimeout(() => revealNext(k + 1), 350);
            }

            revealNext(0);
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
    document.getElementById('displayCharFrame').classList.toggle('is-ptb', isPtb(result.character));

    result.perks.forEach((perk, i) => {
        const slotRolled = Array.isArray(parts.perks) ? parts.perks[i] : !!parts.perks;
        const isAlreadyRevealed = parts.revealedSlots instanceof Set && parts.revealedSlots.has(i);
        const shouldRevealNow = parts.justRevealed === i;
        const isSlotSpinning = isSpinningAnim && slotRolled && !isAlreadyRevealed;
        const showEmptySpin = isSlotSpinning && !!parts.finale;
        const shouldReveal = shouldRevealNow || (!isSpinningAnim && slotRolled);

        const nameEl = document.getElementById(`perkName${i}`);
        const imgEl = document.getElementById(`perkImg${i}`);
        const iconEl = document.getElementById(`perkIcon${i}`);
        const innerEl = document.getElementById(`perkInner${i}`);
        const diamond = innerEl.parentElement;

        diamond.classList.remove('is-empty', 'is-perk-spinning', 'is-empty-flipping', 'is-perk-revealing');
        innerEl.classList.remove('spinning-reel');

        if (showEmptySpin) {
            nameEl.innerText = '???';
            setImg(imgEl, [], perk.icon || 'fa-shield-halved', 'text-4xl text-purple-200');
            iconEl.classList.add('hidden');
            diamond.classList.add('is-empty', 'is-empty-flipping');
            diamond.removeAttribute('data-perk');
            return;
        }

        nameEl.innerText = currentLang === 'pt' ? perk.namePt : perk.nameEn;
        const cands = entryImgs(perk);
        setImg(imgEl, cands, perk.icon || 'fa-shield-halved', 'text-4xl text-purple-200');
        iconEl.classList.toggle('hidden', cands.length > 0);
        diamond.classList.toggle('is-perk-spinning', isSlotSpinning && !parts.finale);
        diamond.dataset.perk = perk.id;

        if (shouldReveal) {
            void diamond.offsetWidth;
            diamond.classList.add('is-perk-revealing');
            setTimeout(() => diamond.classList.remove('is-perk-revealing'), 450);
        }
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
            <div class="perk-diamond perk-diamond-xs" data-perk="${esc(p.id)}">
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
                <div class="char-card w-11 shrink-0${ptbCls(build.character)} flex items-center justify-center text-dbd-cyan text-lg">
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
    const resolveAddons = (it, relPrefix) => {
        const pairs = addonPairs(it);
        return wanted.map(n => {
            const hit = pairs.find(a => norm(a.pt) === norm(n) || norm(a.en) === norm(n));
            const pt = hit ? hit.pt : n;
            const en = hit ? hit.en : n;
            return { namePt: pt, nameEn: en, rel: relPrefix + fmt(pt) + '.png' };
        });
    };

    if (role === 'survivor') {
        const hit = itemName ? findSurvItem(itemName) : null;
        if (!hit) return { ...EMPTY_ITEM };
        const { tipo, found } = hit;
        return {
            namePt: found.nome,
            nameEn: found.nome_en || found.nome,
            rel: 'itens/surv/' + fmt(found.nome) + '.png',
            icon: ITEM_TYPE_ICON[tipo] || 'fa-toolbox',
            addons: resolveAddons(found, 'itens/surv/complementos/')
        };
    }
    const poder = getKillerPower(character);
    if (!poder) return { ...EMPTY_ITEM };
    return {
        namePt: poder.nome,
        nameEn: poder.nome_en || poder.nome,
        rel: 'itens/kill/poderes/' + fmt(poder.nome) + '.png',
        icon: 'fa-skull',
        addons: resolveAddons(poder, 'itens/kill/' + fmt(character.namePt) + '/')
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
    $('bldItem').innerHTML = `<option value="">${noneLbl}</option>` + Object.keys(itemsData.surv).map(tipo => {
        const grp = currentLang === 'pt' ? tipo : (ITEM_TYPE_EN[tipo] || tipo);
        return `<optgroup label="${esc(grp)}">${itemsData.surv[tipo].map(it =>
            `<option value="${esc(it.nome)}">${esc(itemLabel(it))}</option>`
        ).join('')}</optgroup>`;
    }).join('');
    if (prevItem && findSurvItem(prevItem)) $('bldItem').value = findSurvItem(prevItem).found.nome;

    $('bldItemRow').style.display = builderRole === 'survivor' ? '' : 'none';
    $('bldPowerRow').style.display = builderRole === 'killer' ? '' : 'none';

    refreshAddonOptions(prevAddons);
    onBuilderChange();
}

function currentAddonChoices() {
    if (builderRole === 'survivor') {
        const hit = findSurvItem($('bldItem').value);
        return { power: null, list: hit ? addonPairs(hit.found) : [] };
    }
    const character = charsByRole('killer').find(c => c.id === $('bldChar').value);
    const poder = getKillerPower(character);
    return { power: poder, list: poder ? addonPairs(poder) : [] };
}

function refreshAddonOptions(keep) {
    const { power, list } = currentAddonChoices();
    const noneLbl = currentLang === 'pt' ? '— Nenhum —' : '— None —';
    const keepVals = keep || [$('bldAddon1').value, $('bldAddon2').value];
    [1, 2].forEach(n => {
        const sel = $('bldAddon' + n);
        sel.innerHTML = `<option value="">${noneLbl}</option>` + list.map(a =>
            `<option value="${esc(a.pt)}">${esc(currentLang === 'pt' ? a.pt : a.en)}</option>`
        ).join('');
        const match = list.find(a => norm(a.pt) === norm(keepVals[n - 1]));
        sel.value = match ? match.pt : '';
        sel.disabled = list.length === 0;
    });
    if (builderRole === 'killer') {
        $('bldPowerName').textContent = power ? itemLabel(power) : (currentLang === 'pt' ? 'Selecione um personagem' : 'Select a character');
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
                <div class="char-card flex items-center justify-center text-dbd-cyan${ptbCls(s.character)}">${imgTag(entryImgs(s.character), 'w-full h-full object-contain', s.character.icon || 'fa-user', 'text-5xl text-dbd-cyan')}</div>
                <div class="bd-preview-name">${esc(nm(s.character))}</div>
           </div>`
        : `<div class="bd-preview-char"><div class="char-card flex items-center justify-center text-neutral-600"><i class="fa-solid fa-user-ninja text-6xl"></i></div><div class="bd-preview-name">--</div></div>`;

    const perksHtml = s.perks.map((p, i) => `
        <div class="bd-preview-perk" ${p ? `data-perk="${esc(p.id)}"` : ''}>
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
            <div class="perk-diamond perk-diamond-xs" data-perk="${esc(p.id)}">
                <div class="perk-diamond-inner">${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}</div>
            </div>`).join('');
        const perkNames = r.perks.map(p => `<li data-perk="${esc(p.id)}">${esc(nm(p))}</li>`).join('');
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
                <div class="char-card w-11 shrink-0${ptbCls(r.character)} flex items-center justify-center text-dbd-cyan text-lg">
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


/* ==========================================================================
   TRAVAR SLOTS
   ========================================================================== */
function resetLocks() {
    locks = { char: false, perks: [false, false, false, false], item: false };
    updateLockUI();
}

function toggleLock(kind, idx) {
    if (!currentRollResult || currentRollResult.role !== currentRole) {
        showToast(currentLang === 'pt' ? 'Gire a roleta antes de travar!' : 'Spin the roulette before locking!', 'error');
        return;
    }
    if (kind === 'char') locks.char = !locks.char;
    else if (kind === 'perk') locks.perks[idx] = !locks.perks[idx];
    else locks.item = !locks.item;
    updateLockUI();
}

function setLockBtn(id, on) {
    const b = $(id);
    if (!b) return;
    b.classList.toggle('locked', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const ic = b.querySelector('i');
    if (ic) ic.className = 'fa-solid ' + (on ? 'fa-lock' : 'fa-lock-open');
    const t = on ? (currentLang === 'pt' ? 'Destravar' : 'Unlock') : (currentLang === 'pt' ? 'Travar' : 'Lock');
    b.title = t;
    b.setAttribute('aria-label', t);
}

function updateLockUI() {
    setLockBtn('lockChar', locks.char);
    $('displayCharFrame') && $('displayCharFrame').classList.toggle('bd-char-locked', locks.char);
    [0, 1, 2, 3].forEach(i => {
        setLockBtn('lockPerk' + i, locks.perks[i]);
        const box = $('perkBox' + i);
        if (box) box.classList.toggle('bd-slot-locked', locks.perks[i]);
    });
    setLockBtn('lockItem', locks.item);
    const li = $('lockItem');
    if (li) li.style.display = currentRole === 'killer' ? 'none' : '';
}


/* ==========================================================================
   HISTÓRICO DE SORTEIOS
   ========================================================================== */
function addToHistory(result) {
    rollHistory.unshift({
        id: Date.now(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        role: result.role,
        character: result.character,
        perks: result.perks,
        item: result.item,
        date: result.date
    });
    rollHistory = rollHistory.slice(0, HISTORY_MAX);
    try { localStorage.setItem('dbd_history', JSON.stringify(rollHistory)); } catch (e) {}
    renderHistory();
}

function renderHistory() {
    const box = $('historyList');
    if (!box) return;
    $('historyCount').textContent = rollHistory.length;
    if (!rollHistory.length) {
        box.innerHTML = `<div class="bd-hint">${currentLang === 'pt' ? 'Nenhum sorteio ainda. Gire a roleta!' : 'No rolls yet. Spin the roulette!'}</div>`;
        return;
    }
    box.innerHTML = rollHistory.map((h, i) => {
        const perks = h.perks.map(p => `
            <div class="perk-diamond perk-diamond-xs" data-perk="${esc(p.id)}">
                <div class="perk-diamond-inner">${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}</div>
            </div>`).join('');
        const it = h.item || EMPTY_ITEM;
        return `
        <button type="button" class="bd-hist" data-hist="${i}" title="${currentLang === 'pt' ? 'Voltar para esta build' : 'Restore this build'}">
            <span class="bd-badge ${h.role === 'survivor' ? 'surv' : 'kill'}">${h.role === 'survivor' ? 'SURV' : 'KILL'}</span>
            <div class="char-card w-11 shrink-0${ptbCls(h.character)} flex items-center justify-center text-dbd-cyan text-lg">
                ${imgTag(entryImgs(h.character), 'w-full h-full object-contain', h.character.icon || 'fa-user', 'text-lg')}
            </div>
            <div class="bd-hist-info">
                <div class="bd-hist-name">${esc(nm(h.character))}</div>
                <div class="bd-hist-sub">${esc(nm(it))}</div>
            </div>
            <div class="bd-hist-perks">${perks}</div>
            <span class="bd-hist-time">${esc(h.time || '')}</span>
        </button>`;
    }).join('');
}

function bindHistoryEvents() {
    $('historyList').addEventListener('click', e => {
        const btn = e.target.closest('[data-hist]');
        if (!btn) return;
        const h = rollHistory[parseInt(btn.dataset.hist, 10)];
        if (h) showBuildInRoulette(h);
    });
}

function clearHistory() {
    rollHistory = [];
    try { localStorage.removeItem('dbd_history'); } catch (e) {}
    renderHistory();
    showToast(currentLang === 'pt' ? 'Histórico limpo!' : 'History cleared!', 'info');
}


/* ==========================================================================
   SALVAR / LIMPAR ACERVO (filtros do Seletor de Conteúdo)
   ========================================================================== */
function savePoolFilters() {
    try {
        localStorage.setItem(POOL_KEY, JSON.stringify({
            chars: [...excludedCharacters],
            perks: [...excludedPerks]
        }));
        showToast(currentLang === 'pt' ? 'Acervo salvo neste navegador!' : 'Pool saved in this browser!', 'success');
    } catch (e) {
        showToast(currentLang === 'pt' ? 'Não foi possível salvar o acervo.' : 'Could not save the pool.', 'error');
    }
}

function loadPoolFilters() {
    try {
        const d = JSON.parse(localStorage.getItem(POOL_KEY) || 'null');
        if (d) {
            excludedCharacters = new Set(d.chars || []);
            excludedPerks = new Set(d.perks || []);
        }
    } catch (e) {}
}

function clearPoolFilters() {
    try { localStorage.removeItem(POOL_KEY); } catch (e) {}
    excludedCharacters.clear();
    excludedPerks.clear();
    $('inputSearch').value = '';
    renderPool();
    showToast(currentLang === 'pt' ? 'Acervo salvo apagado e tudo reativado!' : 'Saved pool deleted, everything re-enabled!', 'info');
}


/* ==========================================================================
   COMPARTILHAR COMO IMAGEM (canvas -> PNG)
   ========================================================================== */
const PERK_ICON_SCALE = 0.92; // tamanho do ícone dentro do losango (1 = ocupa todo o losango; diminua/aumente se precisar)
let lastImage = { blob: null, url: null, name: 'build.png' };

// tenta cada URL em ordem (local -> remoto); resolve null se nenhuma carregar
function loadImg(cands) {
    return new Promise(resolve => {
        let i = 0;
        const next = () => {
            if (i >= cands.length) return resolve(null);
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => resolve(im);
            im.onerror = () => { i++; next(); };
            im.src = cands[i];
        };
        next();
    });
}

function drawContain(g, img, x, y, w, h) {
    const r = Math.min(w / img.width, h / img.height);
    const dw = img.width * r, dh = img.height * r;
    g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function wrapText(g, text, maxW, maxLines) {
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (g.measureText(t).width <= maxW || !cur) cur = t;
        else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1];
        while (g.measureText(last + '…').width > maxW && last.length > 1) last = last.slice(0, -1);
        lines[maxLines - 1] = last + '…';
    }
    return lines;
}

function drawCenteredLines(g, text, cx, y, maxW, maxLines, lineH) {
    wrapText(g, text, maxW, maxLines).forEach((ln, i) => g.fillText(ln, cx, y + i * lineH));
}

async function renderBuildCanvas(b) {
    const W = 1200, H = 630;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    const item = b.item || EMPTY_ITEM;
    const hasItem = item.namePt !== 'Nenhum';
    const addons = (item.addons || []).slice(0, 2);
    const accent = b.role === 'survivor' ? '#22d3ee' : '#ef4444';

    const [charImg, bgImg, frame, itemImg, ...others] = await Promise.all([
        loadImg(entryImgs(b.character)),
        loadImg(imgPaths('personagens/fundo_pdbd.png')),
        loadImg(imgPaths('perk_purple.png')),
        hasItem ? loadImg(entryImgs(item)) : Promise.resolve(null),
        ...b.perks.map(p => loadImg(entryImgs(p))),
        ...addons.map(a => loadImg(entryImgs(a)))
    ]);
    const perkImgs = others.slice(0, b.perks.length);
    const addonImgs = others.slice(b.perks.length);

    // fundo
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0a0a0f');
    grad.addColorStop(1, '#1b1b30');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(210, 300, 20, 210, 300, 420);
    glow.addColorStop(0, accent + '33');
    glow.addColorStop(1, 'transparent');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    g.textBaseline = 'alphabetic';
    const font = (w, px) => `${w} ${px}px "Segoe UI", Arial, sans-serif`;

    // título
    g.textAlign = 'left';
    g.font = font(900, 30);
    g.fillStyle = '#d1202f';
    g.fillText('ROLETA', 40, 58);
    const rw = g.measureText('ROLETA ').width;
    g.fillStyle = '#ffffff';
    g.fillText('DE PERKS', 40 + rw, 58);

    // painel do personagem
    roundRectPath(g, 40, 90, 340, 490, 18);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.stroke();

    if (bgImg) drawContain(g, bgImg, 60, 110, 300, 360);
    if (charImg) drawContain(g, charImg, 60, 110, 300, 360);
    else {
        g.fillStyle = '#525252';
        g.font = font(900, 120);
        g.textAlign = 'center';
        g.fillText('?', 210, 330);
    }

    g.textAlign = 'center';
    g.fillStyle = '#ffffff';
    let px = 34;
    const cname = nm(b.character).toUpperCase();
    g.font = font(900, px);
    while (g.measureText(cname).width > 300 && px > 16) { px -= 2; g.font = font(900, px); }
    g.fillText(cname, 210, 520);
    g.font = font(700, 18);
    g.fillStyle = accent;
    g.fillText(b.role.toUpperCase(), 210, 552);

    // perks
    const x0 = 420, areaW = 740, S = 150;
    const gap = (areaW - 4 * S) / 3;
    g.textAlign = 'left';
    g.font = font(700, 16);
    g.fillStyle = '#a3a3a3';
    g.fillText(currentLang === 'pt' ? 'VANTAGENS' : 'PERKS', x0, 128);

    b.perks.forEach((p, i) => {
        const x = x0 + i * (S + gap), y = 145;
        if (frame) g.drawImage(frame, x, y, S, S);
        else {
            g.save();
            g.translate(x + S / 2, y + S / 2);
            g.rotate(Math.PI / 4);
            g.fillStyle = '#7e22ce';
            g.fillRect(-S * 0.33, -S * 0.33, S * 0.66, S * 0.66);
            g.restore();
        }
        const im = perkImgs[i];
        if (im) {
            const is = S * PERK_ICON_SCALE;
            drawContain(g, im, x + (S - is) / 2, y + (S - is) / 2, is, is);
        }
        g.textAlign = 'center';
        g.fillStyle = '#e5e5e5';
        g.font = font(700, 20);
        drawCenteredLines(g, nm(p), x + S / 2, y + S + 28, S + gap - 10, 2, 24);
    });

    // item / poder + addons
    g.textAlign = 'left';
    g.font = font(700, 16);
    g.fillStyle = '#a3a3a3';
    g.fillText(currentLang === 'pt' ? 'ITEM / PODER' : 'ITEM / POWER', x0, 440);

    const box = (x, y, s, img) => {
        roundRectPath(g, x, y, s, s, 14);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.18)';
        g.lineWidth = 2;
        g.stroke();
        if (img) drawContain(g, img, x + 8, y + 8, s - 16, s - 16);
    };

    box(x0, 455, 110, itemImg);
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    g.font = font(800, 24);
    wrapText(g, hasItem ? nm(item) : (currentLang === 'pt' ? 'Nenhum' : 'None'), 210, 3)
        .forEach((ln, i) => g.fillText(ln, x0 + 128, 495 + i * 28));

    addons.forEach((a, i) => {
        const x = 790 + i * 190;
        box(x, 460, 90, addonImgs[i]);
        g.textAlign = 'center';
        g.fillStyle = '#d4d4d4';
        g.font = font(600, 16);
        drawCenteredLines(g, nm(a), x + 45, 570, 170, 2, 19);
    });

    // rodapé
    g.textAlign = 'right';
    g.font = font(600, 16);
    g.fillStyle = '#737373';
    g.fillText(location.host || 'Roleta de Perks', W - 40, H - 20);

    return c;
}

async function shareBuildImage() {
    if (!currentRollResult) {
        showToast(currentLang === 'pt' ? 'Gire a roleta antes de gerar a imagem!' : 'Spin the roulette first!', 'error');
        return;
    }
    showToast(currentLang === 'pt' ? 'Gerando imagem...' : 'Generating image...', 'info');
    try {
        const canvas = await renderBuildCanvas(currentRollResult);
        const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png'));
        if (lastImage.url) URL.revokeObjectURL(lastImage.url);
        lastImage = { blob, url: URL.createObjectURL(blob), name: 'roleta-perks-' + slugId(currentRollResult.character.namePt) + '.png' };
        $('imgPreview').src = lastImage.url;
        let canNative = false;
        try { canNative = !!(navigator.canShare && navigator.canShare({ files: [new File([blob], lastImage.name, { type: 'image/png' })] })); } catch (e) {}
        $('imgBtnShare').style.display = canNative ? '' : 'none';
        $('imageModal').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        showToast(currentLang === 'pt' ? 'Não foi possível gerar a imagem (abra o site por http://).' : 'Could not generate the image.', 'error');
    }
}

function closeImageModal() {
    $('imageModal').classList.add('hidden');
}

function downloadBuildImage() {
    if (!lastImage.url) return;
    const a = document.createElement('a');
    a.href = lastImage.url;
    a.download = lastImage.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function copyBuildImage() {
    if (!lastImage.blob) return;
    try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': lastImage.blob })]);
        showToast(currentLang === 'pt' ? 'Imagem copiada!' : 'Image copied!', 'success');
    } catch (e) {
        showToast(currentLang === 'pt' ? 'Seu navegador não permite copiar imagem. Use "Baixar PNG".' : 'Copy not supported. Use "Download PNG".', 'error');
    }
}

async function nativeShareBuildImage() {
    if (!lastImage.blob) return;
    try {
        await navigator.share({ files: [new File([lastImage.blob], lastImage.name, { type: 'image/png' })], title: 'Roleta de Perks' });
    } catch (e) { /* usuário cancelou */ }
}


/* ==========================================================================
   LINKS DO OVERLAY PARA OBS
   ========================================================================== */
function obsUrl(role) {
    const q = new URLSearchParams();
    q.set('role', role);
    if (!$('obsSpin').checked) q.set('spin', '0');
    if (!$('obsNames').checked) q.set('names', '0');
    const scale = $('obsScale').value;
    if (scale && scale !== '1') q.set('scale', scale);
    if ($('obsLayout').value === 'v') q.set('layout', 'v');
    const auto = parseInt($('obsAuto').value, 10);
    if (auto > 0) q.set('auto', auto);
    return new URL('overlay.html', location.href).href.split('#')[0] + '?' + q.toString();
}

function updateObsLinks() {
    if (!$('obsLinkSurv')) return;
    const s = obsUrl('survivor'), k = obsUrl('killer');
    $('obsLinkSurv').value = s;
    $('obsLinkKill').value = k;
    $('obsOpenSurv').href = s;
    $('obsOpenKill').href = k;
}

async function copyObsLink(which) {
    const text = $(which === 'surv' ? 'obsLinkSurv' : 'obsLinkKill').value;
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
    showToast(currentLang === 'pt' ? 'Link do overlay copiado!' : 'Overlay link copied!', 'success');
}


/* ===== Tooltip de perk (hover) ===== */
(function () {
    const GOOD = ['Celeridade', 'Indetectável', 'Resistência', 'Esquiva', 'Haste', 'Undetectable', 'Endurance'];
    const BAD = ['Exaustão', 'Exposto', 'Quebrado', 'Lentidão', 'Cegueira', 'Hemorragia', 'Ferida Profunda',
        'Incapacitado', 'Dilacerado', 'Alheio', 'Exhausted', 'Exposed', 'Broken', 'Hindered', 'Blindness',
        'Hemorrhage', 'Deep Wound', 'Mangled', 'Oblivious'];
    const kwMap = {};
    GOOD.forEach(k => kwMap[k.toLowerCase()] = 'kw-good');
    BAD.forEach(k => kwMap[k.toLowerCase()] = 'kw-bad');
    const kwRx = new RegExp('(?<![\\p{L}])(' + Object.keys(kwMap).sort((a, b) => b.length - a.length).join('|') + ')(?![\\p{L}])', 'giu');

    function descToHtml(text) {
        const lines = esc(text)
            .replace(/&lt;(\/?)i&gt;/gi, '<$1i>')      // libera só <i> e </i>
            .replace(/\{[^}]*\}/g, '<b>X</b>')
            .split('\n');
        let html = '', inList = false;
        lines.forEach(raw => {
            const ln = raw.trim();
            if (!ln) return;
            const li = ln.startsWith('- ');
            const body = (li ? ln.slice(2) : ln).replace(kwRx, m => `<span class="${kwMap[m.toLowerCase()]}">${m}</span>`);
            if (li && !inList) { html += '<ul>'; inList = true; }
            if (!li && inList) { html += '</ul>'; inList = false; }
            html += li ? `<li>${body}</li>` : `<p>${body}</p>`;
        });
        return html + (inList ? '</ul>' : '');
    }

    function findPerk(id) {
        return [...initialData.survivorPerks, ...initialData.killerPerks,
            ...customEntries.filter(e => e.category === 'perk')].find(p => p.id === id);
    }

    const tip = document.createElement('div');
    tip.id = 'perkTip';
    tip.className = 'perk-tip';
    document.body.appendChild(tip);
    let cur = null;

    function show(el) {
        const p = findPerk(el.dataset.perk);
        if (!p) return hide();
        const pt = currentLang === 'pt';
        const desc = (!pt && p.descEn) ? p.descEn : p.desc;
        const owner = p.ownerId === 'geral' ? (pt ? 'Geral' : 'General') : (p.charName || '');
        tip.innerHTML = `
            <div class="perk-tip-head">
                <div class="perk-tip-name">${esc(nm(p))}</div>
                <div class="perk-tip-sub"><span>${esc(owner)}</span><span>${p.ptb ? 'PTB' : (pt ? 'Muito raro' : 'Very rare')}</span></div>
            </div>
            <div class="perk-tip-body">${desc ? descToHtml(desc) : `<p>${pt ? 'Sem descrição.' : 'No description.'}</p>`}</div>`;
        tip.classList.add('show');
        cur = el;
    }
    function hide() { tip.classList.remove('show'); cur = null; }
    function place(e) {
        const pad = 16, w = tip.offsetWidth, h = tip.offsetHeight;
        let x = e.clientX + pad, y = e.clientY + pad;
        if (x + w > innerWidth - 8) x = e.clientX - w - pad;
        if (y + h > innerHeight - 8) y = innerHeight - h - 8;
        tip.style.left = Math.max(8, x) + 'px';
        tip.style.top = Math.max(8, y) + 'px';
    }

    document.addEventListener('mouseover', e => {
        const el = e.target.closest && e.target.closest('[data-perk]');
        if (!el) return;
        if (el !== cur) show(el);
        place(e);
    });
    document.addEventListener('mouseout', e => {
        if (cur && !cur.contains(e.relatedTarget)) hide();
    });
    document.addEventListener('mousemove', e => {
        if (!cur) return;
        if (!cur.isConnected) return hide();   // a roleta redesenha os perks enquanto gira
        place(e);
    });
    document.addEventListener('scroll', hide, true);
})();


/* ==========================================================================
   TAGS DE PERKS + ROLETA TEMÁTICA
   As tags vêm do campo "tags" de cada perk no JSON (qualquer tag nova que você
   escrever lá aparece sozinha nos filtros). Perks sem "tags" usam detecção
   automática pelo texto como reserva.
   ========================================================================== */
const TAG_META = {
    'aura':               { pt: 'Aura',               en: 'Aura',            icon: 'fa-eye' },
    'cura':               { pt: 'Cura',               en: 'Healing',         icon: 'fa-kit-medical' },
    'exposto':            { pt: 'Exposto',            en: 'Exposed',         icon: 'fa-bullseye' },
    'furtividade':        { pt: 'Furtividade',        en: 'Stealth',         icon: 'fa-user-secret' },
    'indetectavel':       { pt: 'Indetectável',       en: 'Undetectable',    icon: 'fa-ghost' },
    'celeridade':         { pt: 'Celeridade',         en: 'Haste',           icon: 'fa-gauge-high' },
    'velocidade':         { pt: 'Velocidade',         en: 'Speed',           icon: 'fa-person-running' },
    'raio de terror':     { pt: 'Raio de Terror',     en: 'Terror Radius',   icon: 'fa-circle-dot' },
    'janela':             { pt: 'Janela',             en: 'Window',          icon: 'fa-window-maximize' },
    'barricada':          { pt: 'Barricada',          en: 'Pallet',          icon: 'fa-road-barrier' },
    'gancho':             { pt: 'Gancho',             en: 'Hook',            icon: 'fa-skull-crossbones' },
    'gancho do tormento': { pt: 'Gancho do Tormento', en: 'Scourge Hook',    icon: 'fa-skull' },
    'gerador':            { pt: 'Gerador',            en: 'Generator',       icon: 'fa-bolt' },
    'reparo':             { pt: 'Reparo',             en: 'Repair',          icon: 'fa-wrench' },
    'regressao':          { pt: 'Regressão',          en: 'Regression',      icon: 'fa-rotate-left' },
    'fim de jogo':        { pt: 'Fim de jogo',        en: 'Endgame',         icon: 'fa-flag-checkered' },
    'exaustao':           { pt: 'Exaustão',           en: 'Exhaustion',      icon: 'fa-battery-quarter' },
    'hemorragia':         { pt: 'Hemorragia',         en: 'Hemorrhage',      icon: 'fa-droplet' },
    'dilacerado':         { pt: 'Dilacerado',         en: 'Mangled',         icon: 'fa-bandage' },
    'quebrado':           { pt: 'Quebrado',           en: 'Broken',          icon: 'fa-bone' },
    'cegueira':           { pt: 'Cegueira',           en: 'Blindness',       icon: 'fa-eye-low-vision' },
    'alheio':             { pt: 'Alheio',             en: 'Oblivious',       icon: 'fa-eye-slash' },
    'lentidao':           { pt: 'Lentidão',           en: 'Hindered',        icon: 'fa-person-walking' },
    'portao':             { pt: 'Portão',             en: 'Gate',            icon: 'fa-door-open' },
    'totem':              { pt: 'Totem',              en: 'Totem',           icon: 'fa-fire' },
    'totem enfeiticado':  { pt: 'Totem Enfeitiçado',  en: 'Hex Totem',       icon: 'fa-fire-flame-curved' },
    'totem abencoado':    { pt: 'Totem Abençoado',    en: 'Boon Totem',      icon: 'fa-hands-praying' },
    'feitico':            { pt: 'Feitiço',            en: 'Hex',             icon: 'fa-hat-wizard' },
    'teste de pericia':   { pt: 'Teste de Perícia',   en: 'Skill Check',     icon: 'fa-crosshairs' },
    'tempo de recarga':   { pt: 'Tempo de recarga',   en: 'Cooldown',        icon: 'fa-hourglass-half' },
    'perseguicao':        { pt: 'Perseguição',        en: 'Chase',           icon: 'fa-route' },
    'obsessao':           { pt: 'Obsessão',           en: 'Obsession',       icon: 'fa-star-of-life' },
    'ataque':             { pt: 'Ataque',             en: 'Attack',          icon: 'fa-hand-fist' },
    'morrendo':           { pt: 'Morrendo',           en: 'Dying',           icon: 'fa-heart-crack' },
    'carregar':           { pt: 'Carregar',           en: 'Carrying',        icon: 'fa-person-carry-box' },
    'debater':            { pt: 'Debater',            en: 'Wiggle',          icon: 'fa-hand' },
    'item':               { pt: 'Item',               en: 'Item',            icon: 'fa-box-open' },
    'bau':                { pt: 'Baú',                en: 'Chest',           icon: 'fa-box' },
    'armario':            { pt: 'Armário',            en: 'Locker',          icon: 'fa-door-closed' },
    'porao':              { pt: 'Porão',              en: 'Basement',        icon: 'fa-stairs' },
    'rastro':             { pt: 'Rastro',             en: 'Trail',           icon: 'fa-shoe-prints' },
    'ruido':              { pt: 'Ruído',              en: 'Noise',           icon: 'fa-volume-high' },
    'notificacao':        { pt: 'Notificação',        en: 'Notification',    icon: 'fa-bell' },
    'sede de sangue':     { pt: 'Sede de Sangue',     en: 'Bloodlust',       icon: 'fa-droplet' },
    'poder do assassino': { pt: 'Poder do Assassino', en: 'Killer Power',    icon: 'fa-gem' },
    'ptb':                { pt: 'PTB',                en: 'PTB',             icon: 'fa-flask' },
};

// Reserva: só é usada em perks que NÃO têm "tags" no JSON (ex.: perks importados)
const AUTO_TAGS = [
    { k: 'cura',      rx: /\bcur(a|as|ar|ado|ada|ados|adas|ando|e|em)\b|kit medico|\bheal(s|ed|ing)?\b/ },
    { k: 'aura',      rx: /\baura/ },
    { k: 'exposto',   rx: /exposto|exposed/ },
    { k: 'furtividade', rx: /indetectavel|undetectable|furtiv|stealth/ },
    { k: 'celeridade', rx: /celeridade|\bhaste\b/ },
    { k: 'exaustao',  rx: /exaust|exhaust/ },
    { k: 'gerador',   rx: /gerador|geradores|generator/ },
    { k: 'gancho',    rx: /gancho|\bhook/ },
    { k: 'janela',    rx: /janela|window|vault/ },
    { k: 'barricada', rx: /barricada|palete|pallet/ },
    { k: 'portao',    rx: /portao|portoes|gate/ },
    { k: 'totem',     rx: /totem/ }
];

const TAGS_KEY = 'dbd_tags_v2';
let activeTags = new Set();
try { activeTags = new Set(JSON.parse(localStorage.getItem(TAGS_KEY) || '[]')); } catch (e) {}
let tagMode = 'any';           // 'any' | 'all'
let currentTab = 'main';
const tagCache = new Map();
const tagLabels = {};          // chave normalizada -> texto original visto no JSON

const tagKey = t => norm(t);
const capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

function tagInfo(key) {
    const m = TAG_META[key];
    const raw = capFirst(tagLabels[key] || key);
    return {
        label: currentLang === 'pt' ? (m ? m.pt : raw) : (m ? m.en : raw),
        icon: (m && m.icon) || 'fa-tag'
    };
}

// Tags do perk = campo "tags" do JSON (se existir); senão, detecção automática
function perkTags(p) {
    if (tagCache.has(p.id)) return tagCache.get(p.id);
    const set = new Set();
    if (Array.isArray(p.tags) && p.tags.length) {
        p.tags.forEach(t => {
            const k = tagKey(t);
            if (!k) return;
            if (!tagLabels[k]) tagLabels[k] = String(t).trim();
            set.add(k);
        });
    } else {
        const txt = norm([p.namePt, p.nameEn, p.desc, p.descEn].join(' '));
        AUTO_TAGS.forEach(t => { if (t.rx.test(txt)) set.add(t.k); });
    }
    if (p.ptb) { set.add('ptb'); if (!tagLabels.ptb) tagLabels.ptb = 'PTB'; }
    tagCache.set(p.id, set);
    return set;
}

function matchesTags(p) {
    if (!activeTags.size) return true;
    const t = perkTags(p), sel = [...activeTags];
    return tagMode === 'all' ? sel.every(x => t.has(x)) : sel.some(x => t.has(x));
}

// Perks que servem de base para as contagens: o lado da galeria (aba Todos os Perks) ou o lado da roleta
function tagContextPerks() {
    if (currentTab === 'perks') {
        return [...(perkGalleryRole === 'survivor' ? initialData.survivorPerks : initialData.killerPerks),
            ...customEntries.filter(e => e.category === 'perk' && e.role === perkGalleryRole)];
    }
    return getActivePerks();
}

// Chips criados a partir das tags que existem nos perks (mais usadas primeiro)
function tagChipsHtml(perks, selected) {
    const counts = new Map();
    perks.forEach(p => perkTags(p).forEach(k => counts.set(k, (counts.get(k) || 0) + 1)));
    selected.forEach(k => { if (!counts.has(k)) counts.set(k, 0); });
    return [...counts.entries()]
        .map(([k, n]) => ({ k, n, ...tagInfo(k) }))
        .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
        .map(t => `<button type="button" class="bd-chip ${selected.has(t.k) ? 'active' : ''}" data-tag="${esc(t.k)}">
            <i class="fa-solid ${t.icon}"></i> ${esc(t.label)}<small>${t.n}</small></button>`)
        .join('');
}

function renderTagChips() {
    const box = $('tagChips');
    if (!box) return;
    const perks = tagContextPerks();
    box.innerHTML = tagChipsHtml(perks, activeTags);

    // contador de perks elegíveis (na roleta respeita o acervo; na galeria só as tags)
    const n = perks.filter(p => (currentTab === 'perks' || !excludedPerks.has(p.id)) && matchesTags(p)).length;
    const pt = currentLang === 'pt';
    const st = $('tagStatus');
    if (st) {
        st.textContent = activeTags.size
            ? (currentTab === 'perks' ? (pt ? `${n} perks no filtro` : `${n} perks match`)
                                      : (pt ? `${n} perks elegíveis` : `${n} eligible perks`))
            : '';
        st.style.color = (activeTags.size && currentTab !== 'perks' && n < 4) ? '#ef4444' : '';
    }

    // bolinha com a quantidade de tags ativas na aba lateral
    const badge = $('tagBadge');
    if (badge) {
        badge.textContent = activeTags.size;
        badge.style.display = activeTags.size ? '' : 'none';
    }
    const handle = $('tagHandle');
    if (handle) handle.title = pt ? 'Filtrar por tags' : 'Filter by tags';
}

function saveTags() {
    try { localStorage.setItem(TAGS_KEY, JSON.stringify([...activeTags])); } catch (e) {}
}
function setTagMode(m) {
    tagMode = m;
    renderTagChips();
    renderPerkGallery();
}
function clearTags() {
    activeTags.clear();
    saveTags();
    renderTagChips();
    renderPerkGallery();
}


/* ==========================================================================
   MENU LATERAL DE TAGS (escondido, só uma aba na lateral esquerda)
   Criado por aqui mesmo: não precisa de HTML no index.html.
   Aparece nas abas "Modo Roleta" e "Todos os Perks".
   ========================================================================== */
const TAG_DRAWER_CSS = `
#tagDrawer{position:fixed;top:0;left:0;bottom:0;width:320px;max-width:86vw;z-index:45;display:flex;flex-direction:column;
  background:#1f242d;border-right:1px solid #2f3540;box-shadow:6px 0 24px rgba(0,0,0,.5);
  transform:translateX(-100%);transition:transform .25s ease}
#tagDrawer.open{transform:none}
#tagDrawer.no-tabs{display:none}
#tagHandle{position:absolute;top:50%;left:100%;transform:translateY(-50%);width:30px;height:104px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer;
  background:#1f242d;color:#00e5ff;border:1px solid #2f3540;border-left:none;border-radius:0 10px 10px 0;
  box-shadow:6px 0 14px rgba(0,0,0,.35)}
#tagHandle:hover{background:#2a303b}
#tagHandle .tg-chev{font-size:10px;transition:transform .25s ease}
#tagDrawer.open #tagHandle .tg-chev{transform:rotate(180deg)}
#tagBadge{min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#d78056;color:#fff;
  font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center}
.tg-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.9rem 1rem .6rem;border-bottom:1px solid #2f3540}
.tg-title{font-size:.8rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#fff;display:flex;align-items:center;gap:.5rem}
.tg-title i{color:#00e5ff}
#tagClose{color:#9ca3af;padding:.25rem .4rem;cursor:pointer}
#tagClose:hover{color:#fff}
.tg-tools{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem;padding:.7rem 1rem;border-bottom:1px solid #2f3540}
#tagStatus{flex:1 0 100%;font-size:11px;font-weight:700;color:#00e5ff;min-height:1rem}
#tagMode{width:auto;padding:.25rem .5rem;font-size:.75rem}
#tagClear{font-size:.75rem;color:#00e5ff;cursor:pointer;display:flex;align-items:center;gap:.25rem;margin-left:auto}
#tagClear:hover{text-decoration:underline}
#tagChips.tg-chips{flex:1;overflow-y:auto;padding:.8rem 1rem 1.2rem;align-content:flex-start}
html:not(.dark) #tagDrawer,html:not(.dark) #tagHandle{background:#fff;border-color:#e5e7eb;box-shadow:6px 0 20px rgba(0,0,0,.12)}
html:not(.dark) #tagHandle{color:#0e7490}
html:not(.dark) #tagHandle:hover{background:#f3f4f6}
html:not(.dark) .tg-head,html:not(.dark) .tg-tools{border-color:#e5e7eb}
html:not(.dark) .tg-title{color:#111827}
html:not(.dark) #tagStatus,html:not(.dark) #tagClear{color:#0e7490}
`;

function openTagDrawer() {
    const d = $('tagDrawer'), h = $('tagHandle');
    if (!d) return;
    d.classList.add('open');
    if (h) h.setAttribute('aria-expanded', 'true');
}
function closeTagDrawer() {
    const d = $('tagDrawer'), h = $('tagHandle');
    if (!d) return;
    d.classList.remove('open');
    if (h) h.setAttribute('aria-expanded', 'false');
}
function toggleTagDrawer() {
    const d = $('tagDrawer');
    if (!d) return;
    d.classList.contains('open') ? closeTagDrawer() : openTagDrawer();
}

// A aba lateral só existe na roleta e em "Todos os Perks"
function updateTagDrawerForTab() {
    const d = $('tagDrawer');
    if (!d) return;
    const ok = currentTab === 'main' || currentTab === 'perks';
    d.classList.toggle('no-tabs', !ok);
    if (!ok) closeTagDrawer();
    renderTagChips();
}

function initTagDrawer() {
    if ($('tagDrawer')) return;

    // remove a barra de tags antiga do index.html, se você ainda não a apagou (evita ids duplicados)
    const oldChips = $('tagChips');
    if (oldChips) (oldChips.closest('.bg-dbd-card') || oldChips.parentElement).remove();
    const oldPg = $('pgTags');
    if (oldPg) oldPg.remove();

    const st = document.createElement('style');
    st.textContent = TAG_DRAWER_CSS;
    document.head.appendChild(st);

    const d = document.createElement('aside');
    d.id = 'tagDrawer';
    d.setAttribute('aria-label', 'Tags');
    d.innerHTML = `
        <button type="button" id="tagHandle" aria-expanded="false" aria-controls="tagDrawer">
            <i class="fa-solid fa-tags"></i>
            <span id="tagBadge" style="display:none">0</span>
            <i class="fa-solid fa-chevron-right tg-chev"></i>
        </button>
        <div class="tg-head">
            <span class="tg-title"><i class="fa-solid fa-tags"></i> <span id="tagTitle">Filtrar por tags</span></span>
            <button type="button" id="tagClose" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="tg-tools">
            <span id="tagStatus"></span>
            <select id="tagMode" class="bd-field">
                <option value="any" id="tagModeAny">Qualquer tag</option>
                <option value="all" id="tagModeAll">Todas as tags</option>
            </select>
            <button type="button" id="tagClear"><i class="fa-solid fa-xmark"></i> <span>Limpar tags</span></button>
        </div>
        <div id="tagChips" class="bd-chips tg-chips"></div>`;
    document.body.appendChild(d);

    $('tagHandle').addEventListener('click', toggleTagDrawer);
    $('tagClose').addEventListener('click', closeTagDrawer);
    $('tagClear').addEventListener('click', clearTags);
    $('tagMode').addEventListener('change', e => setTagMode(e.target.value));
    $('tagChips').addEventListener('click', e => {
        const b = e.target.closest('[data-tag]');
        if (!b) return;
        const id = b.dataset.tag;
        activeTags.has(id) ? activeTags.delete(id) : activeTags.add(id);
        saveTags();
        renderTagChips();
        renderPerkGallery();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTagDrawer(); });

    updateLanguageUI();      // traduz os textos que acabaram de ser criados
    updateTagDrawerForTab();
}

/* ==========================================================================
   MODO SQUAD (4 SURVIVORS) — 4 PALCOS + LOCKS + HISTÓRICO
   ========================================================================== */
let currentSquadResult = [];
let isSquadSpinning = false;
const SQUAD_HIST_KEY = 'dbd_squad_history';
let squadHistory = [];
try { squadHistory = JSON.parse(localStorage.getItem(SQUAD_HIST_KEY) || '[]'); } catch (e) { squadHistory = []; }

function createEmptySquadLocks() {
    return [0, 1, 2, 3].map(() => ({
        char: false,
        perks: [false, false, false, false],
        item: false
    }));
}
let squadLocks = createEmptySquadLocks();

function resetSquadLocks() {
    squadLocks = createEmptySquadLocks();
}

function playSquadBeep(freq = 440) {
    const chk = $('chkSquadSound') || $('chkSound');
    if (!chk || !chk.checked) return;
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

function rollSurvivorItemForSquad(character) {
    const prevRole = currentRole;
    currentRole = 'survivor';
    const rolled = rollItem('survivor', character);
    currentRole = prevRole;
    return rolled || { ...EMPTY_ITEM };
}

function getSquadPools() {
    const chars = [
        ...initialData.survivors,
        ...customEntries.filter(e => e.category === 'character' && e.role === 'survivor')
    ].filter(c => !excludedCharacters.has(c.id) && (includePtb() || !isPtb(c)));

    const perks = [
        ...initialData.survivorPerks,
        ...customEntries.filter(e => e.category === 'perk' && e.role === 'survivor')
    ].filter(p => !excludedPerks.has(p.id) && matchesTags(p) && (includePtb() || !isPtb(p)));

    return { chars, perks };
}

function generateSquadOnce(chars, perks, uniqueAcrossSquad, prevSquad = null) {
    const usedCharIds = new Set();
    const usedPerkIds = new Set();

    // Primeiro preserva tudo que estiver travado com cadeado
    if (prevSquad && prevSquad.length === 4) {
        for (let s = 0; s < 4; s++) {
            const lk = squadLocks[s];
            const prevM = prevSquad[s];
            if (!prevM) continue;
            if (lk.char && prevM.character) usedCharIds.add(prevM.character.id);
            if (uniqueAcrossSquad && prevM.perks) {
                prevM.perks.forEach((p, pIdx) => {
                    if (lk.perks[pIdx] && p) usedPerkIds.add(p.id);
                });
            }
        }
    }

    const squad = [];

    for (let slot = 0; slot < 4; slot++) {
        const lk = squadLocks[slot];
        const prevM = (prevSquad && prevSquad[slot]) ? prevSquad[slot] : null;

        let character;
        if (lk.char && prevM && prevM.character) {
            character = prevM.character;
        } else {
            let charPool = chars.filter(c => !usedCharIds.has(c.id));
            if (!charPool.length) charPool = [...chars];
            character = pick(charPool);
            if (chars.length >= 4) usedCharIds.add(character.id);
        }

        const fixedPerks = [0, 1, 2, 3].map(pIdx =>
            (lk.perks[pIdx] && prevM && prevM.perks && prevM.perks[pIdx]) ? prevM.perks[pIdx] : null
        );
        const rollCount = fixedPerks.filter(x => !x).length;

        let perkPool = uniqueAcrossSquad
            ? perks.filter(p => !usedPerkIds.has(p.id))
            : [...perks];
        const keptIds = new Set(fixedPerks.filter(Boolean).map(p => p.id));
        perkPool = perkPool.filter(p => !keptIds.has(p.id));

        if (perkPool.length < rollCount) {
            perkPool = [...perks].filter(p => !keptIds.has(p.id));
        }

        const rolledSlice = shuffle(perkPool).slice(0, rollCount);
        let rPtr = 0;
        const pickedPerks = fixedPerks.map(fp => fp || rolledSlice[rPtr++]);

        if (uniqueAcrossSquad) {
            pickedPerks.forEach(p => { if (p) usedPerkIds.add(p.id); });
        }

        const item = (lk.item && prevM && prevM.item)
            ? prevM.item
            : rollSurvivorItemForSquad(character);

        squad.push({
            player: slot + 1,
            character,
            perks: pickedPerks,
            item
        });
    }

    return squad;
}

function toggleSquadLock(playerIdx, kind, perkIdx = 0) {
    if (!currentSquadResult.length || !currentSquadResult[playerIdx]) {
        showToast(currentLang === 'pt' ? 'Sorteie o Squad antes de travar!' : 'Roll the Squad before locking!', 'error');
        return;
    }
    if (kind === 'char') squadLocks[playerIdx].char = !squadLocks[playerIdx].char;
    else if (kind === 'perk') squadLocks[playerIdx].perks[perkIdx] = !squadLocks[playerIdx].perks[perkIdx];
    else if (kind === 'item') squadLocks[playerIdx].item = !squadLocks[playerIdx].item;
    renderSquad(isSquadSpinning);
}

function renderSquad(spinning = false) {
    const wrap = $('squadContainer');
    if (!wrap) return;

    const defaultIcons = ['fa-shield-halved', 'fa-bolt', 'fa-heart-pulse', 'fa-eye'];
    const hasResult = Array.isArray(currentSquadResult) && currentSquadResult.length === 4;

    const cells = [0, 1, 2, 3].map(sIdx => {
        const member = hasResult ? currentSquadResult[sIdx] : null;
        const lk = squadLocks[sIdx] || { char: false, perks: [false, false, false, false], item: false };

        const charName = member ? esc(nm(member.character)) : '--';
        const charCands = member ? entryImgs(member.character) : [];
        const charHtml = member
            ? imgTag(charCands, 'w-full h-full object-cover', member.character.icon || 'fa-user', 'text-4xl text-dbd-cyan')
            : '<i class="fa-solid fa-user-ninja text-4xl text-neutral-600"></i>';

        const perksHtml = [0, 1, 2, 3].map(pIdx => {
            const p = member && member.perks ? member.perks[pIdx] : null;
            const pLocked = !!lk.perks[pIdx];
            const pName = p ? esc(nm(p)) : `Slot ${pIdx + 1}`;
            const pCands = p ? entryImgs(p) : [];

            return `
                <div class="sq-perk-slot ${pLocked ? 'bd-slot-locked' : ''}" ${p ? `data-perk="${esc(p.id)}"` : ''}>
                    <div class="perk-diamond ${p ? '' : 'is-empty'} ${spinning && !pLocked ? 'is-perk-spinning' : ''}">
                        <div class="perk-diamond-inner">
                            ${p
                                ? imgTag(pCands, 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-lg')
                                : `<i class="fa-solid ${defaultIcons[pIdx]} text-lg text-purple-300"></i>`}
                        </div>
                    </div>
                    <span class="sq-perk-label">${pName}</span>
                    <button type="button" onclick="toggleSquadLock(${sIdx}, 'perk', ${pIdx})"
                        class="bd-lock ${pLocked ? 'locked' : ''}"
                        aria-pressed="${pLocked ? 'true' : 'false'}"
                        title="${pLocked ? (currentLang === 'pt' ? 'Destravar' : 'Unlock') : (currentLang === 'pt' ? 'Travar' : 'Lock')}">
                        <i class="fa-solid ${pLocked ? 'fa-lock' : 'fa-lock-open'}"></i>
                    </button>
                </div>`;
        }).join('');

        const item = member && member.item ? member.item : EMPTY_ITEM;
        const hasItem = !!member && item.namePt !== 'Nenhum';
        const itemName = member ? esc(hasItem ? nm(item) : (currentLang === 'pt' ? 'Nenhum' : 'None')) : (currentLang === 'pt' ? 'Nenhum' : 'None');
        const addons = member && Array.isArray(item.addons) ? item.addons.slice(0, 2) : [];

        const addonsHtml = [0, 1].map(aIdx => {
            const a = addons[aIdx];
            const aName = a ? esc(nm(a)) : `Add-on ${aIdx + 1}`;
            return `
                <div class="sq-addon-slot" title="${aName}">
                    <div class="sq-addon-box ${spinning && !lk.item ? 'spinning-reel' : ''}">
                        ${a
                            ? imgTag(entryImgs(a), 'w-full h-full object-contain', 'fa-puzzle-piece', 'text-xs text-neutral-400')
                            : '<i class="fa-solid fa-puzzle-piece text-xs text-neutral-500"></i>'}
                    </div>
                    <span class="sq-mini-name">${aName}</span>
                </div>`;
        }).join('');

        return `
        <article class="sq-panel">
            <div class="sq-panel-head">
                <span class="sq-char-sub">${currentLang === 'pt' ? `JOGADOR ${sIdx + 1}` : `PLAYER ${sIdx + 1}`}</span>
                <span class="bd-badge surv">SURVIVOR</span>
            </div>

            <div class="sq-panel-body">
                <div class="sq-char-col">
                    <div class="sq-char-frame ${lk.char ? 'bd-char-locked' : ''} ${spinning && !lk.char ? 'spinning-reel' : ''}">
                        ${charHtml}
                    </div>
                    <div>
                        <div class="sq-char-title">${charName}</div>
                        <div class="sq-char-sub">SURVIVOR</div>
                        <button type="button" onclick="toggleSquadLock(${sIdx}, 'char')"
                            class="bd-lock ${lk.char ? 'locked' : ''}"
                            aria-pressed="${lk.char ? 'true' : 'false'}"
                            title="${lk.char ? (currentLang === 'pt' ? 'Destravar' : 'Unlock') : (currentLang === 'pt' ? 'Travar' : 'Lock')}">
                            <i class="fa-solid ${lk.char ? 'fa-lock' : 'fa-lock-open'}"></i>
                        </button>
                    </div>
                </div>

                <div class="sq-main-col">
                    <div class="sq-perks-zone">
                        <div class="sq-perks-grid">
                            ${perksHtml}
                        </div>
                    </div>

                    <div class="sq-gear-zone ${lk.item ? 'is-locked' : ''}">
                        <div class="sq-item-group">
                            <div class="sq-item-box ${spinning && !lk.item ? 'spinning-reel' : ''}">
                                ${hasItem
                                    ? imgTag(entryImgs(item), 'w-full h-full object-contain', item.icon || 'fa-toolbox', 'text-lg text-dbd-cyan')
                                    : '<i class="fa-solid fa-toolbox text-lg text-neutral-500"></i>'}
                            </div>
                            <div>
                                <div class="dbd-section-label">${currentLang === 'pt' ? 'ITEM / PODER' : 'ITEM / POWER'}</div>
                                <div class="text-xs font-bold text-white mt-0.5">${itemName}</div>
                                <button type="button" onclick="toggleSquadLock(${sIdx}, 'item')"
                                    class="bd-lock ${lk.item ? 'locked' : ''}"
                                    aria-pressed="${lk.item ? 'true' : 'false'}"
                                    title="${lk.item ? (currentLang === 'pt' ? 'Destravar' : 'Unlock') : (currentLang === 'pt' ? 'Travar' : 'Lock')}">
                                    <i class="fa-solid ${lk.item ? 'fa-lock' : 'fa-lock-open'}"></i>
                                </button>
                            </div>
                        </div>

                        <div class="sq-addons-group">
                            ${addonsHtml}
                        </div>
                    </div>
                </div>
            </div>
        </article>`;
    });

    wrap.innerHTML = cells.join('');
}

function addSquadToHistory(squad) {
    if (!Array.isArray(squad) || squad.length !== 4) return;
    squadHistory.unshift({
        id: Date.now(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString(),
        members: squad.map(m => ({
            player: m.player,
            character: m.character,
            perks: m.perks,
            item: m.item
        }))
    });
    squadHistory = squadHistory.slice(0, HISTORY_MAX);
    try { localStorage.setItem(SQUAD_HIST_KEY, JSON.stringify(squadHistory)); } catch (e) {}
    renderSquadHistory();
}

function renderSquadHistory() {
    const box = $('squadHistoryList');
    if (!box) return;
    const countEl = $('squadHistoryCount');
    if (countEl) countEl.textContent = squadHistory.length;

    if (!squadHistory.length) {
        box.innerHTML = `<div class="bd-hint">${currentLang === 'pt' ? 'Nenhum sorteio de Squad ainda. Clique em SORTEAR SQUAD!' : 'No squad rolls yet. Click ROLL SQUAD!'}</div>`;
        return;
    }

    box.innerHTML = squadHistory.map((h, i) => {
        const namesSummary = (h.members || []).map(m => esc(nm(m.character))).join(' · ');
        const allPerks = (h.members || []).flatMap(m => m.perks || []).slice(0, 8);
        const perksHtml = allPerks.map(p => `
            <div class="perk-diamond perk-diamond-xs" data-perk="${esc(p.id)}">
                <div class="perk-diamond-inner">${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}</div>
            </div>`).join('');

        return `
        <button type="button" class="bd-hist" data-squad-hist="${i}" title="${currentLang === 'pt' ? 'Restaurar este Squad' : 'Restore this Squad'}">
            <span class="bd-badge surv">SQUAD</span>
            <div class="bd-hist-info">
                <div class="bd-hist-name">${namesSummary}</div>
                <div class="bd-hist-sub">${currentLang === 'pt' ? '4 Survivors' : '4 Survivors'}</div>
            </div>
            <div class="bd-hist-perks">${perksHtml}</div>
            <span class="bd-hist-time">${esc(h.time || '')}</span>
        </button>`;
    }).join('');
}

function clearSquadHistory() {
    squadHistory = [];
    try { localStorage.removeItem(SQUAD_HIST_KEY); } catch (e) {}
    renderSquadHistory();
    showToast(currentLang === 'pt' ? 'Histórico do Squad limpo!' : 'Squad history cleared!', 'info');
}

function spinSquadRoulette() {
    if (isSquadSpinning) return;

    const { chars, perks } = getSquadPools();
    const uniqueAcrossSquad = $('chkSquadUniquePerks') ? $('chkSquadUniquePerks').checked : true;

    if (!chars.length) {
        showToast(currentLang === 'pt' ? 'Nenhum Survivor ativo no acervo!' : 'No active Survivors in pool!', 'error');
        return;
    }

    if (perks.length < 4 || (uniqueAcrossSquad && perks.length < 16)) {
        showToast(
            currentLang === 'pt'
                ? 'Poucos perks ativos para montar o Squad sem repetição. Ative mais perks ou desmarque a opção.'
                : 'Not enough active perks to roll a non-repeating squad. Enable more perks or uncheck the option.',
            'error'
        );
        return;
    }

    const baseSnapshot = currentSquadResult.length === 4 ? currentSquadResult : null;
    isSquadSpinning = true;
    const btn = $('btnSpinSquad');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    let steps = 14;
    let speed = 55;

    function tick() {
        playSquadBeep(340 + (14 - steps) * 18);
        currentSquadResult = generateSquadOnce(chars, perks, uniqueAcrossSquad, baseSnapshot);
        renderSquad(true);

        steps--;
        if (steps > 0) {
            speed += 11;
            setTimeout(tick, speed);
        } else {
            currentSquadResult = generateSquadOnce(chars, perks, uniqueAcrossSquad, baseSnapshot);
            renderSquad(false);
            isSquadSpinning = false;
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            addSquadToHistory(currentSquadResult);
            playSquadBeep(880);
            showToast(currentLang === 'pt' ? 'Squad sorteado!' : 'Squad rolled!', 'success');
        }
    }

    tick();
}

function initSquadMode() {
    renderSquad(false);
    renderSquadHistory();
    const histBox = $('squadHistoryList');
    if (histBox && !histBox.dataset.bound) {
        histBox.dataset.bound = '1';
        histBox.addEventListener('click', e => {
            const btn = e.target.closest('[data-squad-hist]');
            if (!btn) return;
            const h = squadHistory[parseInt(btn.dataset.squadHist, 10)];
            if (!h || !Array.isArray(h.members) || h.members.length !== 4) return;
            resetSquadLocks();
            currentSquadResult = h.members.map(m => ({ ...m }));
            renderSquad(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

async function renderSquadCanvas(squad) {
    const W = 1200, H = 760;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0b0c0f');
    grad.addColorStop(1, '#12141a');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    const font = (w, px) => `${w} ${px}px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif`;
    const dispFont = (w, px) => `${w} ${px}px "Barlow Condensed", "Segoe UI", Arial, sans-serif`;
    g.textBaseline = 'alphabetic';

    g.textAlign = 'left';
    g.font = dispFont(800, 30);
    g.fillStyle = '#b91c28';
    g.fillText('ROLETA', 36, 48);
    const rw = g.measureText('ROLETA ').width;
    g.fillStyle = '#eceae4';
    g.fillText('DE PERKS · SQUAD', 36 + rw, 48);

    const [bgImg, frame] = await Promise.all([
        loadImg(imgPaths('personagens/fundo_pdbd.png')),
        loadImg(imgPaths('perk_purple.png'))
    ]);

    const cardsData = await Promise.all(squad.map(async m => {
        const item = m.item || EMPTY_ITEM;
        const hasItem = item.namePt !== 'Nenhum';
        const addons = (item.addons || []).slice(0, 2);
        const [charImg, itemImg, addon0Img, addon1Img, ...perkImgs] = await Promise.all([
            loadImg(entryImgs(m.character)),
            hasItem ? loadImg(entryImgs(item)) : Promise.resolve(null),
            addons[0] ? loadImg(entryImgs(addons[0])) : Promise.resolve(null),
            addons[1] ? loadImg(entryImgs(addons[1])) : Promise.resolve(null),
            ...m.perks.map(p => loadImg(entryImgs(p)))
        ]);
        return { m, item, hasItem, addons, charImg, itemImg, addonImgs: [addon0Img, addon1Img], perkImgs };
    }));

    const cols = 2, padX = 36, topY = 74, gapX = 24, gapY = 20;
    const cardW = (W - padX * 2 - gapX) / cols;
    const cardH = (H - topY - 44 - gapY) / 2;

    const drawBox = (x, y, s, img, radius = 8) => {
        roundRectPath(g, x, y, s, s, radius);
        g.fillStyle = '#0e1015';
        g.fill();
        g.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        g.lineWidth = 1.5;
        g.stroke();
        if (img) drawContain(g, img, x + 5, y + 5, s - 10, s - 10);
    };

    cardsData.forEach((d, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = padX + col * (cardW + gapX);
        const y = topY + row * (cardH + gapY);

        roundRectPath(g, x, y, cardW, cardH, 10);
        g.fillStyle = '#12141a';
        g.fill();
        g.strokeStyle = 'rgba(255, 255, 255, 0.10)';
        g.lineWidth = 1.5;
        g.stroke();

        // Cabeçalho do jogador
        g.textAlign = 'left';
        g.font = font(700, 12);
        g.fillStyle = '#6ba3be';
        g.fillText((currentLang === 'pt' ? `JOGADOR ${d.m.player}` : `PLAYER ${d.m.player}`), x + 18, y + 25);

        // Retrato
        const charX = x + 18, charY = y + 36, charW = 78, charH = 112;
        if (bgImg) drawContain(g, bgImg, charX, charY, charW, charH);
        if (d.charImg) drawContain(g, d.charImg, charX, charY, charW, charH);

        // Nome do personagem + Item
        const infoX = x + 110;
        g.fillStyle = '#eceae4';
        g.font = dispFont(700, 22);
        g.fillText(nm(d.m.character).toUpperCase(), infoX, y + 58, cardW - 128);

        g.fillStyle = '#8e95a5';
        g.font = font(600, 12);
        const itemLabel = d.hasItem ? nm(d.item) : (currentLang === 'pt' ? 'Nenhum' : 'None');
        g.fillText((currentLang === 'pt' ? 'Item: ' : 'Item: ') + itemLabel, infoX, y + 78, cardW - 128);

        // Caixa do Item + 2 Add-ons ao lado
        drawBox(infoX, y + 88, 52, d.itemImg, 6);

        [0, 1].forEach(aIdx => {
            const add = d.addons[aIdx];
            const ax = infoX + 64 + aIdx * 96;
            const ay = y + 88;
            drawBox(ax, ay, 44, d.addonImgs[aIdx], 6);

            g.textAlign = 'left';
            g.font = font(600, 11);
            g.fillStyle = add ? '#cfd5e2' : '#646b7a';
            const addName = add ? nm(add) : `Add-on ${aIdx + 1}`;
            drawCenteredLines(g, addName, ax + 22, ay + 56, 88, 2, 13);
        });

        // 4 Perks
        const perkSize = 84;
        const pGap = (cardW - 36 - 4 * perkSize) / 3;
        d.m.perks.forEach((p, i) => {
            const px = x + 18 + i * (perkSize + pGap);
            const py = y + 170;
            if (frame) g.drawImage(frame, px, py, perkSize, perkSize);
            if (d.perkImgs[i]) {
                const is = perkSize * PERK_ICON_SCALE;
                drawContain(g, d.perkImgs[i], px + (perkSize - is) / 2, py + (perkSize - is) / 2, is, is);
            }
            g.textAlign = 'center';
            g.fillStyle = '#eceae4';
            g.font = font(600, 12);
            drawCenteredLines(g, nm(p), px + perkSize / 2, py + perkSize + 16, perkSize + 8, 2, 14);
        });
    });

    g.textAlign = 'right';
    g.font = font(600, 13);
    g.fillStyle = '#646b7a';
    g.fillText(location.host || 'Roleta de Perks', W - 36, H - 16);

    return c;
}

async function shareSquadImage() {
    if (!currentSquadResult.length) {
        showToast(currentLang === 'pt' ? 'Sorteie o Squad antes de gerar a imagem!' : 'Roll the Squad first!', 'error');
        return;
    }
    showToast(currentLang === 'pt' ? 'Gerando imagem do Squad...' : 'Generating Squad image...', 'info');
    try {
        const canvas = await renderSquadCanvas(currentSquadResult);
        const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/png'));
        if (lastImage.url) URL.revokeObjectURL(lastImage.url);
        lastImage = { blob, url: URL.createObjectURL(blob), name: `roleta-perks-squad-${Date.now()}.png` };
        $('imgPreview').src = lastImage.url;
        let canNative = false;
        try { canNative = !!(navigator.canShare && navigator.canShare({ files: [new File([blob], lastImage.name, { type: 'image/png' })] })); } catch (e) {}
        $('imgBtnShare').style.display = canNative ? '' : 'none';
        $('imageModal').classList.remove('hidden');
    } catch (e) {
        console.error(e);
        showToast(currentLang === 'pt' ? 'Não foi possível gerar a imagem.' : 'Could not generate the image.', 'error');
    }
}

/* ==========================================================================
   DESAFIOS DIÁRIOS (BUILD DO DIA SURVIVOR & KILLER + 5 DESAFIOS / DIA)
   ========================================================================== */
const DAILY_CHALLENGES_100 = [
    { id: 1,  side: 'both',     pt: { title: 'Sem Item', desc: 'Complete a partida sem pegar ou usar item (Survivor) / sem usar poder principal além do ataque básico (Killer).' }, en: { title: 'No Item', desc: 'Finish the match without picking up or using an item (Survivor) / without using your main power beyond basic attacks (Killer).' } },
    { id: 2,  side: 'survivor', pt: { title: 'Proibido Agachar', desc: 'Termine a partida sem agachar nenhuma vez.' }, en: { title: 'No Crouching', desc: 'Finish the match without crouching at all.' } },
    { id: 3,  side: 'both',     pt: { title: 'Um Perk por Vez', desc: 'A cada gancho ou gerador concluído, foque na jogabilidade de apenas 1 dos seus perks por vez.' }, en: { title: 'One Perk at a Time', desc: 'After each hook or generator, play around only 1 of your perks at a time.' } },
    { id: 4,  side: 'both',     pt: { title: 'Sem Cobertura de Terror', desc: 'Jogue sem ativar perks que escondam aura, rastro ou raio de terror.' }, en: { title: 'No Terror Cover', desc: 'Play without triggering perks that hide aura, scratch marks, or terror radius.' } },
    { id: 5,  side: 'survivor', pt: { title: 'Caçador de Totens', desc: 'Purifique ou abençoe pelo menos 3 totens na partida.' }, en: { title: 'Totem Hunter', desc: 'Cleanse or bless at least 3 totems during the match.' } },
    { id: 6,  side: 'survivor', pt: { title: 'Sem Barracadas', desc: 'Não derrube nenhuma barricada durante toda a partida.' }, en: { title: 'No Pallets', desc: 'Do not drop any pallets throughout the match.' } },
    { id: 7,  side: 'killer',   pt: { title: 'Apenas Ataques Básicos', desc: 'Derrube todos os sobreviventes usando apenas ataques básicos (M1).' }, en: { title: 'Basic Attacks Only', desc: 'Down survivors using only basic attacks (M1).' } },
    { id: 8,  side: 'killer',   pt: { title: 'Sem Acampar', desc: 'Afaste-se pelo menos 24 metros após colocar um sobrevivente no gancho.' }, en: { title: 'No Camping', desc: 'Move at least 24 meters away after hooking a survivor.' } },
    { id: 9,  side: 'survivor', pt: { title: 'Fim de Jogo Ativo', desc: 'Só conclua o último gerador quando pelo menos um portão ou escotilha estiver em vista.' }, en: { title: 'Active Endgame', desc: 'Only finish the last generator when an exit gate or hatch is in sight.' } },
    { id: 10, side: 'survivor', pt: { title: 'Furtivo nas Sombras', desc: 'Evite qualquer perseguição longa (máximo de 10 segundos seguidos em chase).' }, en: { title: 'Shadow Stealth', desc: 'Avoid long chases (max 10 seconds in chase at a time).' } },
    { id: 11, side: 'both',     pt: { title: 'Apenas Perks Ensináveis', desc: 'Use apenas perks ensináveis de personagens (sem perks gerais).' }, en: { title: 'Teachable Perks Only', desc: 'Use only character teachable perks (no general perks).' } },
    { id: 12, side: 'both',     pt: { title: 'Apenas Perks Gerais', desc: 'Use exclusivamente perks gerais do jogo.' }, en: { title: 'General Perks Only', desc: 'Use exclusively general perks.' } },
    { id: 13, side: 'survivor', pt: { title: 'Mão Leve', desc: 'Não abra nenhum baú durante a partida.' }, en: { title: 'Light Fingers', desc: 'Do not open any chests during the match.' } },
    { id: 14, side: 'survivor', pt: { title: 'Curandeiro de Campo', desc: 'Cure companheiros (ou recupere estados críticos) pelo menos 3 vezes.' }, en: { title: 'Field Medic', desc: 'Heal teammates (or recover from dying state) at least 3 times.' } },
    { id: 15, side: 'killer',   pt: { title: 'Sem Chutar Geradores', desc: 'Não use a ação de chutar/danificar geradores diretamente.' }, en: { title: 'No Gen Kicking', desc: 'Do not directly kick or damage generators.' } },
    { id: 16, side: 'killer',   pt: { title: 'Pressão de Gancho', desc: 'Coloque cada sobrevivente diferente no gancho pelo menos 1 vez antes de eliminar alguém.' }, en: { title: 'Hook Spread', desc: 'Hook each survivor at least once before eliminating anyone.' } },
    { id: 17, side: 'both',     pt: { title: 'Apenas Add-ons Comuns', desc: 'Equipe no máximo add-ons de raridade comum ou não use add-ons.' }, en: { title: 'Common Add-ons Only', desc: 'Equip at most common add-ons or no add-ons.' } },
    { id: 18, side: 'survivor', pt: { title: 'Sem Olhar para Trás', desc: 'Durante perseguições, não gire a câmera para olhar para trás por mais de 1 segundo.' }, en: { title: 'Eyes Forward', desc: 'During chases, avoid looking back for more than 1 second at a time.' } },
    { id: 19, side: 'survivor', pt: { title: 'Reparo em Dupla', desc: 'Conclua pelo menos 2 geradores trabalhando junto com outro sobrevivente.' }, en: { title: 'Duo Repair', desc: 'Complete at least 2 generators working alongside a teammate.' } },
    { id: 20, side: 'survivor', pt: { title: 'Silêncio Absoluto', desc: 'Evite gerar notificações de ruído alto durante toda a partida.' }, en: { title: 'Total Silence', desc: 'Avoid triggering loud noise notifications throughout the match.' } },
    { id: 21, side: 'killer',   pt: { title: 'Caça Rápida', desc: 'Consiga o primeiro acerto em menos de 45 segundos após o início da partida.' }, en: { title: 'Quick Hunt', desc: 'Land your first hit within 45 seconds of the match starting.' } },
    { id: 22, side: 'killer',   pt: { title: 'Sem Dependência de Totens', desc: 'Não dependa de totens para controlar o mapa na partida.' }, en: { title: 'No Totem Reliance', desc: 'Do not rely on totems for map control during the match.' } },
    { id: 23, side: 'survivor', pt: { title: 'Troca ao Ser Pego', desc: 'A cada gancho sofrido, trate um dos seus perks como inativo até ser curado.' }, en: { title: 'Hook Swap', desc: 'Each time you are hooked, treat one perk as inactive until healed.' } },
    { id: 24, side: 'killer',   pt: { title: 'Troca a Cada 3 Ganchos', desc: 'A cada 3 ganchos totais, mude seu alvo principal de perseguição.' }, en: { title: 'Rotate Every 3 Hooks', desc: 'Every 3 total hooks, switch your primary chase target.' } },
    { id: 25, side: 'both',     pt: { title: 'Apenas Uma Licença', desc: 'Use apenas personagens e perks vindos de um mesmo capítulo/licença.' }, en: { title: 'Single Chapter', desc: 'Use only characters and perks from the same chapter/license.' } },
    { id: 26, side: 'survivor', pt: { title: 'Sem Correr em Área Segura', desc: 'Não corra fora de perseguição ou fora do raio de terror.' }, en: { title: 'Safe Walk', desc: 'Do not sprint outside of chases or terror radius.' } },
    { id: 27, side: 'survivor', pt: { title: 'Foco em Geradores', desc: 'Repare sozinho o equivalente a pelo menos 2 geradores completos.' }, en: { title: 'Gen Focus', desc: 'Solo-repair the equivalent of at least 2 full generators.' } },
    { id: 28, side: 'killer',   pt: { title: 'Sem Túneis', desc: 'Evite perseguir ou derrubar o mesmo sobrevivente duas vezes seguidas após sair do gancho.' }, en: { title: 'No Tunneling', desc: 'Avoid chasing or downing the same survivor twice in a row after unhook.' } },
    { id: 29, side: 'killer',   pt: { title: 'Sem Slug', desc: 'Quando derrubar um sobrevivente, leve ao gancho em vez de deixar no chão.' }, en: { title: 'No Slugging', desc: 'Hook downed survivors instead of leaving them on the ground.' } },
    { id: 30, side: 'both',     pt: { title: 'Minimalista', desc: 'Jogue sem item e sem add-ons.' }, en: { title: 'Minimalist', desc: 'Play with no item and no add-ons.' } },
    { id: 31, side: 'survivor', pt: { title: 'Resgate Seguro', desc: 'Faça pelo menos 2 resgates seguros de gancho.' }, en: { title: 'Safe Unhooks', desc: 'Perform at least 2 safe hook rescues.' } },
    { id: 32, side: 'survivor', pt: { title: 'Sem Usar Janelas', desc: 'Não faça saltos por janelas durante a partida.' }, en: { title: 'No Vaults', desc: 'Do not vault windows during the match.' } },
    { id: 33, side: 'killer',   pt: { title: 'Perseguição Curta', desc: 'Se um sobrevivente durar mais de 20 segundos na chase, troque de alvo.' }, en: { title: 'Short Chases', desc: 'If a chase lasts over 20 seconds, switch targets.' } },
    { id: 34, side: 'killer',   pt: { title: 'Guardião de Portões', desc: 'Controle os portões de saída quando restarem 1 ou 2 geradores.' }, en: { title: 'Gate Keeper', desc: 'Control exit gates when 1 or 2 generators remain.' } },
    { id: 35, side: 'survivor', pt: { title: 'Sem Armários', desc: 'Não entre em nenhum armário durante a partida inteira.' }, en: { title: 'No Lockers', desc: 'Do not enter any lockers during the entire match.' } },
    { id: 36, side: 'killer',   pt: { title: 'Apenas Caminhando', desc: 'Ande pelo mapa sem usar habilidades de mobilidade ou teleporte.' }, en: { title: 'Walking Pace', desc: 'Traverse the map without mobility or teleport powers.' } },
    { id: 37, side: 'survivor', pt: { title: 'Sem Exaustão', desc: 'Não equipe nenhum perk que cause estado de Exaustão.' }, en: { title: 'No Exhaustion', desc: 'Do not equip any Exhaustion perks.' } },
    { id: 38, side: 'both',     pt: { title: 'Apenas Informação', desc: 'Use apenas perks focados em leitura de aura, ruídos ou localização.' }, en: { title: 'Info Only', desc: 'Use only perks focused on aura reading, alerts, or tracking.' } },
    { id: 39, side: 'both',     pt: { title: 'Apenas Furtividade', desc: 'Use apenas perks focados em furtividade ou ocultar presença.' }, en: { title: 'Stealth Only', desc: 'Use only perks focused on stealth or hiding presence.' } },
    { id: 40, side: 'survivor', pt: { title: 'Sobrevivência/Defesa', desc: 'Priorize perks de resistência, cura ou prolongar perseguições.' }, en: { title: 'Defense & Survival', desc: 'Prioritize endurance, healing, or chase-extending perks.' } },
    { id: 41, side: 'killer',   pt: { title: 'Pressão/Controle', desc: 'Priorize perks de atraso de geradores, regressão ou controle de mapa.' }, en: { title: 'Pressure & Control', desc: 'Prioritize generator delay, regression, or map control perks.' } },
    { id: 42, side: 'survivor', pt: { title: 'Zero Itens no Chão', desc: 'Não solte ou troque seu item inicial durante a partida.' }, en: { title: 'Keep Your Item', desc: 'Do not drop or swap your starting item during the match.' } },
    { id: 43, side: 'survivor', pt: { title: 'Por Último', desc: 'Abra o portão de saída ou escape por último da equipe.' }, en: { title: 'Last Out', desc: 'Open an exit gate or escape last among your team.' } },
    { id: 44, side: 'killer',   pt: { title: 'Sem Quebrar Barricadas', desc: 'Não quebre barricadas com chute; passe por cima ou contorne.' }, en: { title: 'No Pallet Breaking', desc: 'Do not break pallets; vault over or loop around them.' } },
    { id: 45, side: 'killer',   pt: { title: 'Observador', desc: 'Verifique geradores à distância sem quebrar todos imediatamente.' }, en: { title: 'Observer', desc: 'Check generators without breaking every single one right away.' } },
    { id: 46, side: 'survivor', pt: { title: 'Sem Autocura', desc: 'Não realize autocura durante a partida.' }, en: { title: 'No Self-Healing', desc: 'Do not perform self-heals during the match.' } },
    { id: 47, side: 'survivor', pt: { title: 'Precisão Total', desc: 'Acerte todos os testes de perícia sem errar nenhum.' }, en: { title: 'Skill Check Ace', desc: 'Hit all skill checks without missing any.' } },
    { id: 48, side: 'killer',   pt: { title: 'Caçador de Obsessão', desc: 'Dê atenção especial à Obsessão sempre que ela aparecer.' }, en: { title: 'Obsession Hunter', desc: 'Prioritize hunting the Obsession whenever spotted.' } },
    { id: 49, side: 'both',     pt: { title: 'Fora do Meta', desc: 'Não use os perks mais populares da sua função na partida.' }, en: { title: 'Off-Meta', desc: 'Avoid the most common meta perks for your role.' } },
    { id: 50, side: 'both',     pt: { title: 'Apenas 2 Perks Ativos', desc: 'Jogue como se tivesse apenas 2 espaços de perk disponíveis.' }, en: { title: '2 Perks Only', desc: 'Play as if you only had 2 perk slots available.' } },
    { id: 51, side: 'both',     pt: { title: 'Apenas 3 Perks Ativos', desc: 'Jogue como se tivesse apenas 3 espaços de perk disponíveis.' }, en: { title: '3 Perks Only', desc: 'Play as if you only had 3 perk slots available.' } },
    { id: 52, side: 'both',     pt: { title: 'Build do Dia', desc: 'Jogue exatamente com a Build do Dia exibida no topo desta aba.' }, en: { title: 'Build of the Day', desc: 'Play using the exact Build of the Day shown at the top of this tab.' } },
    { id: 53, side: 'survivor', pt: { title: 'Squad Sincronizado', desc: 'Em grupo, todos os 4 survivors devem usar o mesmo tipo de item ou nenhum item.' }, en: { title: 'Synced Squad', desc: 'In a group, all 4 survivors use the same item type or no item.' } },
    { id: 54, side: 'survivor', pt: { title: 'Squad Sem Repetição', desc: 'Em grupo, nenhum dos 4 survivors pode repetir perks entre si.' }, en: { title: 'Unique Squad', desc: 'In a group, no two survivors share any perk.' } },
    { id: 55, side: 'both',     pt: { title: 'Espelho da Build do Dia', desc: 'Use o mesmo personagem da Build do Dia com perks da sua escolha.' }, en: { title: 'Daily Character Mirror', desc: 'Use the Daily Build character with perks of your choice.' } },
    { id: 56, side: 'both',     pt: { title: 'Mesmo Dono', desc: 'Use perks ligados a um mesmo personagem na build.' }, en: { title: 'Same Character Perks', desc: 'Use perks belonging to the same character.' } },
    { id: 57, side: 'killer',   pt: { title: 'Sem Usar o Poder', desc: 'Vença usando apenas ataques básicos e perks.' }, en: { title: 'Powerless', desc: 'Win using only basic attacks and perks.' } },
    { id: 58, side: 'killer',   pt: { title: 'Pressão Central', desc: 'Mantenha foco nos geradores centrais logo no início da partida.' }, en: { title: 'Center Pressure', desc: 'Focus early map control on central generators.' } },
    { id: 59, side: 'both',     pt: { title: 'Visita ao Porão', desc: 'Passe pela área do porão ao menos uma vez durante a partida.' }, en: { title: 'Basement Visit', desc: 'Enter the basement area at least once during the match.' } },
    { id: 60, side: 'survivor', pt: { title: 'Sem Atordoar', desc: 'Não atordoe o Killer com barricadas ou itens.' }, en: { title: 'No Stuns', desc: 'Do not stun the Killer with pallets or items.' } },
    { id: 61, side: 'survivor', pt: { title: 'Atordoar ou Cegar', desc: 'Consiga ao menos 1 atordoamento ou cegueira na partida.' }, en: { title: 'Stun or Blind', desc: 'Land at least 1 stun or blind during the match.' } },
    { id: 62, side: 'survivor', pt: { title: 'Sem Item em Chase', desc: 'Não use seu item durante uma perseguição ativa.' }, en: { title: 'No Chase Item Use', desc: 'Do not use your item while actively in a chase.' } },
    { id: 63, side: 'survivor', pt: { title: 'Esgotar o Item', desc: 'Consuma todas as cargas do seu item antes de escapar.' }, en: { title: 'Empty the Tank', desc: 'Deplete all charges of your item before escaping.' } },
    { id: 64, side: 'both',     pt: { title: 'Sem Bônus de Velocidade', desc: 'Não use perks que aumentem velocidade de movimento ou ação.' }, en: { title: 'No Speed Boosts', desc: 'Do not use perks that boost movement or action speed.' } },
    { id: 65, side: 'survivor', pt: { title: 'Foco em Altruísmo', desc: 'Faça pelo menos 2 ações altruístas na partida.' }, en: { title: 'Altruism Focus', desc: 'Perform at least 2 altruistic actions during the match.' } },
    { id: 66, side: 'survivor', pt: { title: 'Reparo Solo', desc: 'Conclua pelo menos 1 gerador inteiramente sozinho.' }, en: { title: 'Solo Gen', desc: 'Complete at least 1 generator completely by yourself.' } },
    { id: 67, side: 'survivor', pt: { title: 'Apenas Portões', desc: 'Escape apenas pelos portões de saída (não use a escotilha).' }, en: { title: 'Gates Only', desc: 'Escape only through exit gates (do not use hatch).' } },
    { id: 68, side: 'killer',   pt: { title: 'Portões Fechados', desc: 'Não deixe ninguém escapar pelos portões abertos.' }, en: { title: 'Locked Gates', desc: 'Prevent survivors from escaping through open exit gates.' } },
    { id: 69, side: 'killer',   pt: { title: 'Sem Quebrar Paredes', desc: 'Não quebre paredes quebráveis no mapa.' }, en: { title: 'No Breakable Walls', desc: 'Do not break breakable walls during the match.' } },
    { id: 70, side: 'both',     pt: { title: 'Add-ons de Alta Raridade', desc: 'Equipe add-ons de maior raridade disponíveis para o item/poder.' }, en: { title: 'High-Rarity Add-ons', desc: 'Equip highest-rarity add-ons available for your item/power.' } },
    { id: 71, side: 'both',     pt: { title: 'Sem Add-ons', desc: 'Jogue sem add-ons equipados.' }, en: { title: 'No Add-ons', desc: 'Play with no add-ons equipped.' } },
    { id: 72, side: 'both',     pt: { title: 'Início Discreto', desc: 'Nos primeiros 60 segundos, evite ações que chamem atenção direta.' }, en: { title: 'Quiet Start', desc: 'In the first 60 seconds, avoid drawing direct attention.' } },
    { id: 73, side: 'both',     pt: { title: 'Fim Agressivo', desc: 'Quando restar 1 gerador, jogue de forma mais agressiva.' }, en: { title: 'Aggressive Finish', desc: 'When 1 generator remains, play more aggressively.' } },
    { id: 74, side: 'survivor', pt: { title: 'Sem Trocar de Loop', desc: 'Em perseguição, não mude de estrutura no meio da mesma tentativa.' }, en: { title: 'Commit to the Loop', desc: 'Do not abandon a loop mid-attempt during a chase.' } },
    { id: 75, side: 'both',     pt: { title: 'Foco em Auras', desc: 'Jogue priorizando leitura de auras.' }, en: { title: 'Aura Focus', desc: 'Play prioritizing aura-reading perks.' } },
    { id: 76, side: 'both',     pt: { title: 'Sem Auras', desc: 'Jogue sem nenhum perk de leitura de aura.' }, en: { title: 'No Auras', desc: 'Play with no aura-reading perks.' } },
    { id: 77, side: 'both',     pt: { title: 'Contra o Relógio', desc: 'Termine a partida em menos de 8 minutos (ou segure por pelo menos 8 minutos).' }, en: { title: 'Beat the Clock', desc: 'Finish within 8 minutes (or last at least 8 minutes).' } },
    { id: 78, side: 'killer',   pt: { title: 'Sem Perks de Gancho', desc: 'Não equipe perks focados em ganchos ou ganchos do tormento.' }, en: { title: 'No Hook Perks', desc: 'Do not equip hook or scourge hook perks.' } },
    { id: 79, side: 'killer',   pt: { title: 'Sem Perks de Gerador', desc: 'Não equipe perks que afetem geradores.' }, en: { title: 'No Gen Perks', desc: 'Do not equip generator perks.' } },
    { id: 80, side: 'killer',   pt: { title: 'Caçador de Curas', desc: 'Interrompa ou puna curas sempre que possível.' }, en: { title: 'Heal Disruptor', desc: 'Interrupt or punish healing whenever possible.' } },
    { id: 81, side: 'survivor', pt: { title: 'Furtividade Máxima', desc: 'Evite ficar visível para o Killer fora de perseguição.' }, en: { title: 'Maximum Stealth', desc: 'Stay hidden from the Killer outside of chases.' } },
    { id: 82, side: 'survivor', pt: { title: 'Reparo Firme', desc: 'Ao iniciar um gerador, permaneça nele até concluir ou ser pressionado.' }, en: { title: 'Steady Repair', desc: 'Stay on a generator until finished or pressured off.' } },
    { id: 83, side: 'survivor', pt: { title: 'Exaustão Guardada', desc: 'Não use o efeito do seu perk de Exaustão durante a partida.' }, en: { title: 'Held Exhaustion', desc: 'Do not trigger your Exhaustion perk during the match.' } },
    { id: 84, side: 'survivor', pt: { title: 'Suporte de Equipe', desc: 'Use perks voltados a apoiar e ajudar o time.' }, en: { title: 'Team Support', desc: 'Use perks focused on supporting your team.' } },
    { id: 85, side: 'killer',   pt: { title: 'Caça Direta', desc: 'Use perks voltados a derrubar e pressionar sobreviventes.' }, en: { title: 'Direct Hunt', desc: 'Use perks focused on downing and pressuring survivors.' } },
    { id: 86, side: 'both',     pt: { title: 'Sem Obsessão', desc: 'Jogue sem perks ligados a Obsessão.' }, en: { title: 'No Obsession Perks', desc: 'Play with no Obsession-related perks.' } },
    { id: 87, side: 'both',     pt: { title: 'Rosto Novo', desc: 'Jogue com um personagem que você usa pouco.' }, en: { title: 'Fresh Face', desc: 'Play a character you rarely pick.' } },
    { id: 88, side: 'both',     pt: { title: 'Perk Esquecido', desc: 'Inclua pelo menos 1 perk que você quase nunca usa.' }, en: { title: 'Forgotten Perk', desc: 'Include at least 1 perk you rarely equip.' } },
    { id: 89, side: 'both',     pt: { title: 'Sem Fim de Jogo', desc: 'Não equipe perks focados no endgame.' }, en: { title: 'No Endgame Perks', desc: 'Do not equip endgame perks.' } },
    { id: 90, side: 'both',     pt: { title: 'Foco no Endgame', desc: 'Monte ou jogue mirando no fim da partida.' }, en: { title: 'Endgame Focus', desc: 'Play with an endgame-oriented plan.' } },
    { id: 91, side: 'survivor', pt: { title: 'Economia de Recursos', desc: 'Não desperdice barricadas nem cargas do item.' }, en: { title: 'Resource Saver', desc: 'Do not waste pallets or item charges.' } },
    { id: 92, side: 'killer',   pt: { title: 'Múltiplos Feridos', desc: 'Mantenha pelo menos 2 sobreviventes feridos ao mesmo tempo.' }, en: { title: 'Multiple Injured', desc: 'Keep at least 2 survivors injured at the same time.' } },
    { id: 93, side: 'killer',   pt: { title: 'Desengajar Rápido', desc: 'Abandone perseguições após 15 segundos sem acerto.' }, en: { title: 'Quick Disengage', desc: 'Drop chases after 15 seconds without a hit.' } },
    { id: 94, side: 'survivor', pt: { title: 'Sobrevivência em Primeiro Lugar', desc: 'Priorize ficar vivo até o final acima de jogadas arriscadas.' }, en: { title: 'Survival First', desc: 'Prioritize staying alive over risky plays.' } },
    { id: 95, side: 'both',     pt: { title: 'Mobilidade & Loops', desc: 'Foque em perks de deslocamento e perseguição.' }, en: { title: 'Mobility & Loops', desc: 'Focus on mobility and chase perks.' } },
    { id: 96, side: 'survivor', pt: { title: 'Sem Perks de Cura', desc: 'Jogue sem nenhum perk de cura.' }, en: { title: 'No Healing Perks', desc: 'Play with no healing perks.' } },
    { id: 97, side: 'killer',   pt: { title: 'Regressão de Gens', desc: 'Foque em perks que façam geradores regredirem.' }, en: { title: 'Gen Regression', desc: 'Focus on perks that regress generators.' } },
    { id: 98, side: 'survivor', pt: { title: 'Squad Caótico', desc: 'Em grupo, cada jogador segue um papel diferente (furtivo, gen, resgate, chase).' }, en: { title: 'Chaotic Squad', desc: 'In a group, each player takes a distinct role.' } },
    { id: 99, side: 'killer',   pt: { title: 'Poder Fora da Chase', desc: 'Use o poder apenas para mobilidade ou controle fora de perseguição.' }, en: { title: 'Out-of-Chase Power', desc: 'Use your power only outside active chases.' } },
    { id: 100, side: 'both',    pt: { title: 'Mestre Diário', desc: 'Complete a partida com a Build do Dia e cumpra 1 desafio de hoje.' }, en: { title: 'Daily Master', desc: 'Finish the match with the Build of the Day and complete 1 daily challenge.' } }
];

function getTodaySeedKey() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function hashSeedString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function createSeededRng(seedNum) {
    let a = seedNum >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seededShuffle(arr, rng) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function buildDailyLoadout(role, dateKey) {
    const chars = role === 'survivor' ? initialData.survivors : initialData.killers;
    const perks = role === 'survivor' ? initialData.survivorPerks : initialData.killerPerks;
    if (!chars.length || perks.length < 4) return null;

    const rng = createSeededRng(hashSeedString(`${dateKey}|daily-build|${role}`));
    const character = chars[Math.floor(rng() * chars.length)];
    const pickedPerks = seededShuffle(perks, rng).slice(0, 4);

    let item = { ...EMPTY_ITEM };
    if (role === 'survivor') {
        const tipos = Object.keys(itemsData.surv || {});
        if (tipos.length) {
            const tipo = tipos[Math.floor(rng() * tipos.length)];
            const list = itemsData.surv[tipo] || [];
            if (list.length) {
                const chosen = list[Math.floor(rng() * list.length)];
                const pairs = addonPairs(chosen);
                const chosenAddons = seededShuffle(pairs, rng).slice(0, 2).map(a => ({
                    namePt: a.pt,
                    nameEn: a.en,
                    rel: 'itens/surv/complementos/' + fmt(a.pt) + '.png'
                }));
                item = {
                    namePt: chosen.nome,
                    nameEn: chosen.nome_en || chosen.nome,
                    rel: 'itens/surv/' + fmt(chosen.nome) + '.png',
                    icon: ITEM_TYPE_ICON[tipo] || 'fa-toolbox',
                    addons: chosenAddons
                };
            }
        }
    } else {
        const poder = getKillerPower(character);
        if (poder) {
            const pairs = addonPairs(poder);
            const chosenAddons = seededShuffle(pairs, rng).slice(0, 2).map(a => ({
                namePt: a.pt,
                nameEn: a.en,
                rel: 'itens/kill/' + fmt(character.namePt) + '/' + fmt(a.pt) + '.png'
            }));
            item = {
                namePt: poder.nome,
                nameEn: poder.nome_en || poder.nome,
                rel: 'itens/kill/poderes/' + fmt(poder.nome) + '.png',
                icon: 'fa-skull',
                addons: chosenAddons
            };
        }
    }

    return {
        role,
        character,
        perks: pickedPerks,
        item,
        date: dateKey
    };
}

function getTodayFiveChallenges(dateKey) {
    const rng = createSeededRng(hashSeedString(`${dateKey}|daily-challenges-100`));
    return seededShuffle(DAILY_CHALLENGES_100, rng).slice(0, 5);
}

let dailyBuildsCache = { dateKey: '', survivor: null, killer: null };

function applyDailyBuildToRoulette(role) {
    const dateKey = getTodaySeedKey();
    const b = buildDailyLoadout(role, dateKey);
    if (!b) return;
    showBuildInRoulette(b);
}

function renderDailyTab() {
    const grid = $('dailyBuildsGrid');
    const listBox = $('dailyChallengesList');
    const dateLbl = $('dailyDateLabel');
    if (!grid || !listBox) return;

    const dateKey = getTodaySeedKey();
    if (dateLbl) {
        dateLbl.textContent = currentLang === 'pt'
            ? `DATA DO DESAFIO: ${dateKey} · MESMA BUILD E 5 DESAFIOS PARA TODOS`
            : `DAILY SEED: ${dateKey} · SAME BUILD & 5 CHALLENGES FOR EVERYONE`;
    }

    const survBuild = buildDailyLoadout('survivor', dateKey);
    const killBuild = buildDailyLoadout('killer', dateKey);
    dailyBuildsCache = { dateKey, survivor: survBuild, killer: killBuild };

    const renderBuildCard = (b, labelPt, labelEn, badgeCls) => {
        if (!b) return '';
        const item = b.item || EMPTY_ITEM;
        const hasItem = item.namePt !== 'Nenhum';
        const perksHtml = b.perks.map(p => `
            <div class="flex flex-col items-center text-center w-16" data-perk="${esc(p.id)}">
                <div class="perk-diamond perk-diamond-xs">
                    <div class="perk-diamond-inner">
                        ${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}
                    </div>
                </div>
                <span class="text-[10px] font-semibold text-neutral-300 line-clamp-2 mt-1">${esc(nm(p))}</span>
            </div>
        `).join('');

        return `
        <div class="bg-dbd-card border border-neutral-800 rounded-xl p-4 space-y-3 shadow">
            <div class="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span class="text-xs font-black uppercase tracking-wider text-white">${currentLang === 'pt' ? labelPt : labelEn}</span>
                <span class="bd-badge ${badgeCls}">${b.role.toUpperCase()}</span>
            </div>
            <div class="flex items-center gap-3">
                <div class="char-card w-14 shrink-0${ptbCls(b.character)} flex items-center justify-center text-dbd-cyan">
                    ${imgTag(entryImgs(b.character), 'w-full h-full object-contain', b.character.icon || 'fa-user', 'text-xl')}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="text-sm font-black text-white uppercase truncate">${esc(nm(b.character))}</div>
                    <div class="text-xs text-neutral-400 truncate mt-0.5">${esc(hasItem ? nm(item) : (currentLang === 'pt' ? 'Nenhum' : 'None'))}</div>
                </div>
                <button type="button" onclick="applyDailyBuildToRoulette('${b.role}')" class="bd-btn bd-btn-sm">
                    <i class="fa-solid fa-eye"></i> ${currentLang === 'pt' ? 'Ver' : 'View'}
                </button>
            </div>
            <div class="flex items-start justify-between gap-2 pt-2 border-t border-neutral-800/80">
                ${perksHtml}
            </div>
        </div>`;
    };

    grid.innerHTML =
        renderBuildCard(survBuild, 'Build do Dia · Survivor', 'Build of the Day · Survivor', 'surv') +
        renderBuildCard(killBuild, 'Build do Dia · Killer', 'Build of the Day · Killer', 'kill');

    const five = getTodayFiveChallenges(dateKey);
    listBox.innerHTML = five.map((ch, idx) => {
        const txt = currentLang === 'pt' ? ch.pt : ch.en;
        const sideTag = ch.side === 'survivor'
            ? '<span class="bd-badge surv">SURVIVOR</span>'
            : (ch.side === 'killer'
                ? '<span class="bd-badge kill">KILLER</span>'
                : `<span class="bd-badge">${currentLang === 'pt' ? 'AMBOS' : 'BOTH'}</span>`);
        return `
        <div class="bg-neutral-950 border border-neutral-800 rounded-lg p-3.5 space-y-1.5">
            <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-black text-white">#${idx + 1} · ${esc(txt.title)}</span>
                ${sideTag}
            </div>
            <p class="text-xs text-neutral-400 leading-relaxed">${esc(txt.desc)}</p>
        </div>`;
    }).join('');
}

if (document.body) initTagDrawer();
else document.addEventListener('DOMContentLoaded', initTagDrawer);
