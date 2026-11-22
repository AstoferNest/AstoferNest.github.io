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
const HISTORY_MAX = 100;      // máximo de sorteios NÃO favoritos guardados (favoritos nunca são apagados)
const HISTORY_PAGE = 15;      // quantos itens aparecem por vez ("Ver mais" mostra +15)
let histFilterText = '';
let histFavOnly = false;
let histVisible = HISTORY_PAGE;
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
    const [sp, kp, is, ik, dc] = await Promise.all([get('survivor-perks'), get('killer-perks'), get('itens-surv'), get('itens-kill'), get('desafios-diarios')]);
    initialData.survivors = buildCharacters(sp.perks, 'survivor');
    initialData.killers = buildCharacters(kp.perks, 'killer');
    initialData.survivorPerks = buildPerks(sp.perks, 'survivor');
    initialData.killerPerks = buildPerks(kp.perks, 'killer');
    itemsData.surv = is;
    itemsData.kill = {};
    Object.keys(ik).forEach(k => { itemsData.kill[k.toLowerCase().trim()] = ik[k]; });
    DAILY_CHALLENGES_100 = Array.isArray(dc) ? dc : [];   // <-- novo
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
        navThumb: "Thumbmaker",
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
        navThumb: "Thumbmaker",
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    applyTheme();
    document.documentElement.lang = currentLang === 'pt' ? 'pt-BR' : 'en';
    updateLanguageUI();
    applyA11yLabels();
    initA11y();
    initKeyboardShortcuts();
    renderSavedBuilds();
    bindFeaturedEvents();
    renderFeaturedDrafts();
    renderFeatured();
    loadPoolFilters();
    bindHistoryEvents();
    initSquadMode();
    renderHistory();
    updateLockUI();
    syncTabA11y();
    updateObsLinks();
    initThumbmakerEvents(); 
    syncThumbTextControls(); 
    applyPresetLikeRef();
    try {
        await loadData();
        populateThumbSelectors();
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
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    updateLanguageUI();
    applyA11yLabels();
    updateRerollUI();
    renderPool();
    renderSavedBuilds();
    renderFeatured();
    renderFeaturedDrafts();
    renderHistory();
    populateBuilder();
    populateThumbSelectors();
    renderPerkGallery();
    renderDailyTab();
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

const TABS = ['main', 'daily', 'squad', 'featured', 'builder', 'pool', 'perks', 'saved', 'thumb'];
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
    syncTabA11y();
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
    populateThumbSelectors();
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
                    announceBuild(currentRollResult);
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
    updateRerollUI();
}


/* ==========================================================================
   HISTÓRICO DE SORTEIOS
   ========================================================================== */
function trimHistory() {
    // Favoritos ficam para sempre; os demais respeitam o limite HISTORY_MAX
    let nonFav = 0;
    rollHistory = rollHistory.filter(h => h.fav || ++nonFav <= HISTORY_MAX);
}

function persistHistory() {
    // Se estourar a cota do localStorage, descarta os mais antigos que não são favoritos
    for (let tries = 0; tries < 200; tries++) {
        try { localStorage.setItem('dbd_history', JSON.stringify(rollHistory)); return; }
        catch (e) {
            let idx = -1;
            for (let i = rollHistory.length - 1; i >= 0; i--) { if (!rollHistory[i].fav) { idx = i; break; } }
            if (idx < 0) return;
            rollHistory.splice(idx, 1);
        }
    }
}

function addToHistory(result) {
    let id = Date.now();
    while (rollHistory.some(h => h.id === id)) id++;
    const entry = {
        id,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        role: result.role,
        character: result.character,
        perks: result.perks,
        item: result.item,
        date: result.date,
        fav: false
    };
    rollHistory.unshift(entry);
    trimHistory();
    persistHistory();
    renderHistory();
    return entry;
}

function historyMatches(h, text) {
    const q = norm(text);
    if (!q) return true;
    const it = h.item || EMPTY_ITEM;
    const bits = [h.character, ...(h.perks || []), it, ...(it.addons || [])]
        .filter(Boolean)
        .map(o => (o.namePt || '') + ' ' + (o.nameEn || ''));
    bits.push(h.role === 'survivor' ? 'survivor sobrevivente' : 'killer assassino');
    const hay = norm(bits.join(' '));
    return q.split(/\s+/).every(tok => hay.includes(tok));
}

function renderHistory() {
    const box = $('historyList');
    if (!box) return;
    const pt = currentLang === 'pt';

    // Rótulos que dependem do idioma
    const search = $('histSearch');
    if (search) search.placeholder = pt ? 'Buscar no histórico (personagem, perk, item)...' : 'Search history (character, perk, item)...';
    const favLbl = $('histFavLabel');
    if (favLbl) favLbl.textContent = pt ? 'Favoritos' : 'Favorites';
    const favBtn = $('histFavToggle');
    if (favBtn) {
        favBtn.setAttribute('aria-pressed', histFavOnly ? 'true' : 'false');
        const ic = favBtn.querySelector('i');
        if (ic) ic.className = (histFavOnly ? 'fa-solid' : 'fa-regular') + ' fa-star';
    }
    const clearBtn = document.querySelector('[onclick="clearHistory()"]');
    if (clearBtn) clearBtn.title = pt ? 'Limpa o histórico (favoritos são mantidos)' : 'Clears history (favorites are kept)';

    const total = rollHistory.length;
    const list = rollHistory.filter(h => (!histFavOnly || h.fav) && historyMatches(h, histFilterText));
    $('historyCount').textContent = list.length === total ? total : `${list.length}/${total}`;

    if (!total) {
        box.innerHTML = `<div class="bd-hint">${pt ? 'Nenhum sorteio ainda. Gire a roleta!' : 'No rolls yet. Spin the roulette!'}</div>`;
        return;
    }
    if (!list.length) {
        const msg = histFavOnly && !histFilterText
            ? (pt ? 'Nenhum favorito ainda. Toque na estrela de um sorteio para fixá-lo aqui.' : 'No favorites yet. Tap the star on a roll to pin it here.')
            : (pt ? 'Nenhum sorteio encontrado com esse filtro.' : 'No rolls match this filter.');
        box.innerHTML = `<div class="bd-hint">${msg}</div>`;
        return;
    }

    const shown = list.slice(0, histVisible);
    let html = shown.map(h => {
        const perks = (h.perks || []).map(p => `
            <div class="perk-diamond perk-diamond-xs" data-perk="${esc(p.id)}">
                <div class="perk-diamond-inner">${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}</div>
            </div>`).join('');
        const it = h.item || EMPTY_ITEM;
        const favLabel = h.fav ? (pt ? 'Remover dos favoritos' : 'Remove from favorites') : (pt ? 'Favoritar' : 'Favorite');
        return `
        <div class="bd-hist-row">
            <button type="button" class="bd-hist" data-hist-id="${h.id}" title="${pt ? 'Voltar para esta build' : 'Restore this build'}">
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
            </button>
            <button type="button" class="bd-hist-fav${h.fav ? ' is-fav' : ''}" data-hist-fav="${h.id}" aria-pressed="${h.fav ? 'true' : 'false'}" title="${favLabel}" aria-label="${favLabel}">
                <i class="${h.fav ? 'fa-solid' : 'fa-regular'} fa-star"></i>
            </button>
        </div>`;
    }).join('');

    const remaining = list.length - shown.length;
    if (remaining > 0) {
        html += `<button type="button" class="bd-btn bd-btn-sm bd-hist-more" data-hist-more="1">
            <i class="fa-solid fa-chevron-down"></i> ${pt ? 'Ver mais' : 'Show more'} (${remaining})
        </button>`;
    }
    box.innerHTML = html;
}

function setHistoryFilter(text) {
    histFilterText = text || '';
    histVisible = HISTORY_PAGE;
    renderHistory();
}

function toggleHistoryFavOnly() {
    histFavOnly = !histFavOnly;
    histVisible = HISTORY_PAGE;
    renderHistory();
}

function toggleHistoryFav(id) {
    const h = rollHistory.find(x => x.id === id);
    if (!h) return;
    h.fav = !h.fav;
    if (!h.fav) trimHistory();   // ao desfavoritar, o limite volta a valer
    persistHistory();
    renderHistory();
    showToast(h.fav
        ? (currentLang === 'pt' ? 'Sorteio favoritado!' : 'Roll favorited!')
        : (currentLang === 'pt' ? 'Removido dos favoritos.' : 'Removed from favorites.'), 'info');
}

// Acha no histórico o sorteio que está na tela (mesmo personagem e mesmos perks)
function findHistoryEntryFor(res) {
    if (!res) return null;
    const key = r => (r.character && r.character.id) + '|' + (r.perks || []).map(p => p && p.id).join(',');
    const k = key(res);
    return rollHistory.find(h => h.role === res.role && key(h) === k) || null;
}

// Atalho F: favorita o sorteio atual (adiciona ao histórico se ainda não estiver lá)
function favoriteCurrentRoll() {
    if (!currentRollResult || currentRollResult.role !== currentRole) {
        showToast(currentLang === 'pt' ? 'Gire a roleta antes de favoritar!' : 'Spin the roulette before favoriting!', 'error');
        return;
    }
    let h = findHistoryEntryFor(currentRollResult);
    if (!h) {
        h = addToHistory(currentRollResult);
        h.fav = true;
        persistHistory();
        renderHistory();
        showToast(currentLang === 'pt' ? 'Sorteio favoritado!' : 'Roll favorited!', 'success');
        return;
    }
    toggleHistoryFav(h.id);
}

function bindHistoryEvents() {
    $('historyList').addEventListener('click', e => {
        const fav = e.target.closest('[data-hist-fav]');
        if (fav) { toggleHistoryFav(parseInt(fav.dataset.histFav, 10)); return; }
        if (e.target.closest('[data-hist-more]')) { histVisible += HISTORY_PAGE; renderHistory(); return; }
        const btn = e.target.closest('[data-hist-id]');
        if (!btn) return;
        const h = rollHistory.find(x => x.id === parseInt(btn.dataset.histId, 10));
        if (h) showBuildInRoulette(h);
    });
}

function clearHistory() {
    const keep = rollHistory.filter(h => h.fav);
    rollHistory = keep;
    persistHistory();
    if (!keep.length) { try { localStorage.removeItem('dbd_history'); } catch (e) {} }
    histVisible = HISTORY_PAGE;
    renderHistory();
    showToast(keep.length
        ? (currentLang === 'pt' ? `Histórico limpo! ${keep.length} favorito(s) mantido(s).` : `History cleared! ${keep.length} favorite(s) kept.`)
        : (currentLang === 'pt' ? 'Histórico limpo!' : 'History cleared!'), 'info');
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

function updateSquadSaveCount() {
    const box = $('squadSaveList');
    const lbl = $('squadSaveSelectedCount');
    if (!box || !lbl) return;
    const checks = Array.from(box.querySelectorAll('input[type="checkbox"][data-squad-idx]'));
    const checked = checks.filter(c => c.checked).length;
    lbl.textContent = currentLang === 'pt'
        ? `${checked} de ${checks.length} selecionadas`
        : `${checked} of ${checks.length} selected`;
}

function toggleAllSquadSaveChecks(state) {
    const box = $('squadSaveList');
    if (!box) return;
    box.querySelectorAll('input[type="checkbox"][data-squad-idx]').forEach(ch => {
        ch.checked = !!state;
    });
    updateSquadSaveCount();
}

function closeSaveSquadModal() {
    const modal = $('saveSquadModal');
    if (modal) modal.classList.add('hidden');
}

function saveCurrentSquad() {
    if (!Array.isArray(currentSquadResult) || currentSquadResult.length !== 4) {
        showToast(
            currentLang === 'pt' ? 'Sorteie o Squad primeiro antes de salvar!' : 'Roll the Squad first before saving!',
            'error'
        );
        return;
    }

    const modal = $('saveSquadModal');
    const listBox = $('squadSaveList');
    const prefixInput = $('squadSavePrefix');
    if (!modal || !listBox) return;

    if (prefixInput) prefixInput.value = '';

    listBox.innerHTML = currentSquadResult.map((m, idx) => {
        const charName = esc(nm(m.character));
        const item = m.item || EMPTY_ITEM;
        const itemName = esc(item.namePt !== 'Nenhum' ? nm(item) : (currentLang === 'pt' ? 'Nenhum' : 'None'));
        const perksMini = (m.perks || []).map(p => `
            <div class="perk-diamond perk-diamond-xs" data-perk="${esc(p.id)}">
                <div class="perk-diamond-inner">
                    ${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}
                </div>
            </div>
        `).join('');

        return `
            <label class="flex flex-col gap-2.5 p-3 rounded-lg bg-neutral-950 border border-neutral-800 hover:border-dbd-cyan cursor-pointer transition">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-black uppercase tracking-wider text-dbd-cyan">
                        ${currentLang === 'pt' ? `Jogador ${m.player || idx + 1}` : `Player ${m.player || idx + 1}`}
                    </span>
                    <input type="checkbox" data-squad-idx="${idx}" checked onchange="updateSquadSaveCount()" class="w-4 h-4 accent-dbd-red cursor-pointer">
                </div>

                <div class="flex items-center gap-2.5">
                    <div class="char-card w-11 shrink-0${ptbCls(m.character)} flex items-center justify-center text-dbd-cyan">
                        ${imgTag(entryImgs(m.character), 'w-full h-full object-contain', m.character.icon || 'fa-user', 'text-lg')}
                    </div>
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">${charName}</div>
                        <div class="text-[11px] text-dbd-muted truncate">${itemName}</div>
                    </div>
                </div>

                <div class="flex items-center gap-1.5 pt-1 border-t border-neutral-800/80">
                    ${perksMini}
                </div>
            </label>
        `;
    }).join('');

    updateSquadSaveCount();
    modal.classList.remove('hidden');
}

function confirmSaveSelectedSquadBuilds() {
    const listBox = $('squadSaveList');
    if (!listBox || !Array.isArray(currentSquadResult) || currentSquadResult.length !== 4) {
        closeSaveSquadModal();
        return;
    }

    const selectedIndices = Array.from(listBox.querySelectorAll('input[type="checkbox"][data-squad-idx]:checked'))
        .map(el => parseInt(el.dataset.squadIdx, 10))
        .filter(i => !Number.isNaN(i) && currentSquadResult[i]);

    if (!selectedIndices.length) {
        showToast(
            currentLang === 'pt' ? 'Selecione ao menos 1 build do Squad para salvar!' : 'Select at least 1 Squad build to save!',
            'error'
        );
        return;
    }

    const prefix = ($('squadSavePrefix')?.value || '').trim();
    const todayStr = new Date().toLocaleDateString();
    const baseTime = Date.now();

    selectedIndices.forEach((idx, order) => {
        const m = currentSquadResult[idx];
        const playerLabel = currentLang === 'pt' ? `Jogador ${m.player || idx + 1}` : `Player ${m.player || idx + 1}`;
        const buildName = prefix ? `${prefix} · ${playerLabel}` : playerLabel;

        savedBuilds.unshift({
            id: baseTime + order,
            name: buildName,
            role: 'survivor',
            character: m.character,
            perks: m.perks,
            item: m.item || { ...EMPTY_ITEM },
            date: todayStr
        });
    });

    persistSavedBuilds();
    renderSavedBuilds();
    closeSaveSquadModal();

    showToast(
        currentLang === 'pt'
            ? `${selectedIndices.length} build(s) do Squad salva(s)!`
            : `${selectedIndices.length} Squad build(s) saved!`,
        'success'
    );
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
let DAILY_CHALLENGES_100 = [];

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


let dailyBuildsCache = { dateKey: '', survivor: null, killer: null };

function applyDailyBuildToRoulette(role) {
    const dateKey = getTodaySeedKey();
    const b = buildDailyLoadout(role, dateKey);
    if (!b) return;
    showBuildInRoulette(b);
}

function getTodayFiveChallenges(dateKey) {
    const rng = createSeededRng(hashSeedString(`${dateKey}|daily-challenges-100-v2`));

    const survPool = seededShuffle(DAILY_CHALLENGES_100.filter(c => c.side === 'survivor'), rng);
    const killPool = seededShuffle(DAILY_CHALLENGES_100.filter(c => c.side === 'killer'), rng);
    const bothPool = seededShuffle(DAILY_CHALLENGES_100.filter(c => c.side === 'both'), rng);

    const picked = [
        ...survPool.slice(0, 2),
        ...killPool.slice(0, 2),
        ...bothPool.slice(0, 1)
    ];

    return seededShuffle(picked, rng);
}

function renderDailyTab() {
    const grid = $('dailyBuildsGrid');
    const listBox = $('dailyChallengesList');

    if (!grid || !listBox) return;

    grid.className = 'dl-grid';

    const dateKey = getTodaySeedKey();

    const survBuild = buildDailyLoadout('survivor', dateKey);
    const killBuild = buildDailyLoadout('killer', dateKey);
    dailyBuildsCache = { dateKey, survivor: survBuild, killer: killBuild };

    const renderBuildCard = (b, labelPt, labelEn, badgeCls) => {
        if (!b) return '';
        const item = b.item || EMPTY_ITEM;
        const hasItem = item.namePt !== 'Nenhum';
        const addonsText = (item.addons || []).map(a => nm(a)).join(' · ');

        const perksHtml = b.perks.map(p => `
            <div class="dl-perk" data-perk="${esc(p.id)}">
                <div class="perk-diamond">
                    <div class="perk-diamond-inner">
                        ${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-sm')}
                    </div>
                </div>
                <span class="dl-perk-name">${esc(nm(p))}</span>
            </div>
        `).join('');

        return `
        <article class="dl-card">
            <div class="dl-card-head">
                <span class="text-xs font-black uppercase tracking-wider text-white">${currentLang === 'pt' ? labelPt : labelEn}</span>
                <span class="bd-badge ${badgeCls}">${b.role.toUpperCase()}</span>
            </div>
            <div class="dl-card-body">
                <div class="dl-top">
                    <div class="dl-portrait ${ptbCls(b.character)}">
                        ${imgTag(entryImgs(b.character), 'w-full h-full object-cover', b.character.icon || 'fa-user', 'text-2xl text-dbd-cyan')}
                    </div>
                    <div class="dl-meta">
                        <div class="dl-char-name">${esc(nm(b.character))}</div>
                        <div class="dl-item-row">
                            <div class="dl-item-thumb">
                                ${hasItem
                                    ? imgTag(entryImgs(item), 'w-full h-full object-contain', item.icon || 'fa-toolbox', 'text-xs text-dbd-cyan')
                                    : '<i class="fa-solid fa-toolbox text-xs text-neutral-500"></i>'}
                            </div>
                            <div class="min-w-0">
                                <div class="text-xs font-bold text-white truncate">${esc(hasItem ? nm(item) : (currentLang === 'pt' ? 'Nenhum' : 'None'))}</div>
                                ${addonsText ? `<div class="text-[11px] text-neutral-400 truncate">${esc(addonsText)}</div>` : ''}
                            </div>
                        </div>
                    </div>
                    <button type="button" onclick="applyDailyBuildToRoulette('${b.role}')" class="bd-btn bd-btn-sm">
                        <i class="fa-solid fa-eye"></i> ${currentLang === 'pt' ? 'Ver' : 'View'}
                    </button>
                </div>
                <div class="dl-perks">
                    ${perksHtml}
                </div>
            </div>
        </article>`;
    };

    grid.innerHTML =
        renderBuildCard(survBuild, 'Build do Dia · Survivor', 'Build of the Day · Survivor', 'surv') +
        renderBuildCard(killBuild, 'Build do Dia · Killer', 'Build of the Day · Killer', 'kill');

    listBox.className = 'dl-cards-row';
    const five = getTodayFiveChallenges(dateKey);

    const wmImg = rel => `<img src="${encodeURI(IMG_LOCAL + rel)}" alt="" aria-hidden="true" onerror="this.style.display='none'">`;

    listBox.innerHTML = five.map(ch => {
        const txt = currentLang === 'pt' ? ch.pt : ch.en;
        const cardSideCls = ch.side === 'survivor'
            ? 'is-surv'
            : (ch.side === 'killer' ? 'is-kill' : 'is-both');

        const wmFile = ch.side === 'survivor'
            ? 'surv.png'
            : (ch.side === 'killer' ? 'killer.png' : 'both.png');

        return `
        <article class="dl-rule-card ${cardSideCls}">
            <div class="dl-rule-wm">
                ${wmImg(wmFile)}
            </div>
            <div class="dl-rule-content">
                <div class="dl-rule-title">${esc(txt.title)}</div>
                <p class="dl-rule-desc">${esc(txt.desc)}</p>
            </div>
        </article>`;
    }).join('');
}

/* ==========================================================================
   THUMBMAKER LIVRE (16:9 & 9:16 · CAMADAS ILIMITADAS · PROJETO JSON)
   ========================================================================== */
const THUMB_RATIOS = {
    '16:9': { w: 1280, h: 720, cls: 'is-16-9' },
    '9:16': { w: 1080, h: 1920, cls: 'is-9-16' }
};

let thumbRatio = '16:9';
let selectedThumbId = 'bg';
let thumbDragging = null;
const thumbImgCache = new Map();

function uidThumb(prefix = 'layer') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultThumbState(ratio = '16:9') {
    return {
        ratio,
        bg: { id: 'bg', type: 'bg', label: 'Fundo', visible: true, x: 0.5, y: 0.5, scale: 1.0, rot: 0, src: '',opacity: 1 },
        items: []
    };
}

let thumbState = createDefaultThumbState('16:9');

function loadThumbImageElement(src) {
    if (!src) return Promise.resolve(null);
    if (thumbImgCache.has(src)) return Promise.resolve(thumbImgCache.get(src));
    return new Promise(resolve => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => {
            thumbImgCache.set(src, im);
            resolve(im);
        };
        im.onerror = () => resolve(null);
        im.src = src;
    });
}

function getFirstAvailableSrc(cands) {
    return Array.isArray(cands) && cands.length ? cands[0] : '';
}

function getSelectedThumbLayer() {
    if (selectedThumbId === 'bg') return thumbState.bg;
    return thumbState.items.find(it => it.id === selectedThumbId) || null;
}

function applyPresetLikeRef() {
    const role = currentRole || 'survivor';
    const chars = (role === 'survivor' ? initialData.survivors : initialData.killers) || [];
    const perks = (role === 'survivor' ? initialData.survivorPerks : initialData.killerPerks) || [];

    const ch = (currentRollResult && currentRollResult.character) || chars[0] || null;
    const pkList = (currentRollResult && Array.isArray(currentRollResult.perks) && currentRollResult.perks.length === 4)
        ? currentRollResult.perks
        : shuffle(perks).slice(0, 4);

    const isVert = thumbRatio === '9:16';
    thumbState = createDefaultThumbState(thumbRatio);
    thumbState.bg.src = getFirstAvailableSrc(imgPaths('personagens/fundo_pdbd.png'));

    const pScale = isVert ? 0.92 : 1.0;
    const perkCoords = [
        { x: isVert ? 0.25 : 0.27, y: isVert ? 0.36 : 0.31, rot: -12, scale: pScale },
        { x: isVert ? 0.75 : 0.73, y: isVert ? 0.31 : 0.28, rot: 12,  scale: pScale },
        { x: isVert ? 0.22 : 0.21, y: isVert ? 0.62 : 0.66, rot: -16, scale: pScale * 1.05 },
        { x: isVert ? 0.78 : 0.79, y: isVert ? 0.64 : 0.65, rot: 15,  scale: pScale * 1.05 }
    ];

    pkList.forEach((p, idx) => {
        if (!p) return;
        thumbState.items.push({
            id: uidThumb('perk'),
            type: 'perk',
            label: nm(p),
            visible: true,
            x: perkCoords[idx].x,
            y: perkCoords[idx].y,
            scale: perkCoords[idx].scale,
            rot: perkCoords[idx].rot,
            src: getFirstAvailableSrc(entryImgs(p))
        });
    });

    if (ch) {
        const chItem = {
            id: uidThumb('char'),
            type: 'char',
            label: nm(ch),
            visible: true,
            x: 0.5,
            y: isVert ? 0.55 : 0.57,
            scale: isVert ? 1.15 : 1.0,
            rot: 0,
            src: getFirstAvailableSrc(entryImgs(ch))
        };
        thumbState.items.push(chItem);
        selectedThumbId = chItem.id;
    }

    renderThumbLayerList();
    syncThumbControlsToSelected();
    renderThumbCanvas();
    pushThumbHistory();
    showToast(currentLang === 'pt' ? 'Exemplo aplicado no Thumbmaker!' : 'Preset applied to Thumbmaker!', 'success');
}

function loadCurrentBuildIntoThumb() {
    if (!currentRollResult) {
        showToast(currentLang === 'pt' ? 'Gire a roleta primeiro ou use Exemplo Estilo Card!' : 'Spin the roulette first!', 'error');
        return;
    }
    applyPresetLikeRef();
}

function setThumbRatio(ratio) {
    if (!THUMB_RATIOS[ratio]) return;
    thumbRatio = ratio;
    thumbState.ratio = ratio;

    const cfg = THUMB_RATIOS[ratio];
    const canvas = $('thumbCanvas');
    const wrap = $('thStageWrap');
    const dims = $('thCanvasDims');
    if (canvas) { canvas.width = cfg.w; canvas.height = cfg.h; }
    if (wrap) {
        wrap.classList.remove('is-16-9', 'is-9-16');
        wrap.classList.add(cfg.cls);
    }
    if (dims) dims.textContent = `${cfg.w} × ${cfg.h}`;

    $('thRatio169').className = ratio === '16:9' ? 'dbd-seg-btn is-surv is-active' : 'dbd-seg-btn is-surv';
    $('thRatio916').className = ratio === '9:16' ? 'dbd-seg-btn is-surv is-active' : 'dbd-seg-btn is-surv';

    renderThumbCanvas();
}

function renderThumbLayerList() {
    const box = $('thLayerTabs');
    const countEl = $('thLayerCount');
    if (!box) return;

    const all = [thumbState.bg, ...thumbState.items];
    if (countEl) countEl.textContent = all.length;

    box.innerHTML = all.map(l => {
        const icon = l.type === 'bg' ? 'fa-panorama'
            : (l.type === 'char' ? 'fa-user'
            : (l.type === 'perk' ? 'fa-gem'
            : (l.type === 'text' ? 'fa-font' : 'fa-image')));
        const activeCls = l.id === selectedThumbId ? 'active' : '';
        const eyeCls = l.visible === false ? 'opacity-50' : '';
        return `<button type="button" data-layer-id="${esc(l.id)}" onclick="selectThumbLayer('${esc(l.id)}')" class="bd-chip ${activeCls} ${eyeCls}">
            <i class="fa-solid ${icon}"></i> ${esc(l.label || l.type)}
        </button>`;
    }).join('');
}

function selectThumbLayer(id) {
    selectedThumbId = id;
    renderThumbLayerList();
    syncThumbControlsToSelected();
    renderThumbCanvas();
}

function syncThumbControlsToSelected() {
    const l = getSelectedThumbLayer();
    const imgCtrl = $('thImageControls');
    const txtCtrl = $('thTextControls');
    const replaceBtn = $('thReplaceImgBtn');
    const nameEl = $('thSelectedName');

    if (!l) {
        if (nameEl) nameEl.textContent = currentLang === 'pt' ? 'Nenhuma camada' : 'No layer';
        return;
    }

    if (nameEl) nameEl.textContent = l.label || l.type;
    if ($('thLayerVisible')) $('thLayerVisible').checked = l.visible !== false;
    const opPct = Math.round((l.opacity != null ? l.opacity : (l.type === 'bg' ? 0.45 : 1)) * 100);
    if ($('thOpacityRange')) $('thOpacityRange').value = opPct;
    if ($('thOpacityVal')) $('thOpacityVal').textContent = `${opPct}%`;
    

    if (l.type === 'text') {
        if (imgCtrl) imgCtrl.classList.add('hidden');
        if (txtCtrl) txtCtrl.classList.remove('hidden');
        if (replaceBtn) replaceBtn.classList.add('hidden');
        if ($('thTextInput')) $('thTextInput').value = l.content || '';
        if ($('thTextFont')) $('thTextFont').value = l.font || 'Barlow Condensed';
        if ($('thTextSize')) $('thTextSize').value = l.size || 64;
        if ($('thTextSizeVal')) $('thTextSizeVal').textContent = `${l.size || 64}px`;
        if ($('thTextColor')) $('thTextColor').value = l.color || '#ffffff';

        const stEnabled = l.strokeEnabled !== false;
        const stWidth = l.strokeWidth != null ? l.strokeWidth : Math.max(5, Math.round((l.size || 64) * 0.12));
        if ($('thTextStrokeEnabled')) $('thTextStrokeEnabled').checked = stEnabled;
        if ($('thTextStrokeWidth')) $('thTextStrokeWidth').value = stWidth;
        if ($('thTextStrokeVal')) $('thTextStrokeVal').textContent = `${stWidth}px`;
        if ($('thTextStrokeColor')) $('thTextStrokeColor').value = l.strokeColor || '#000000';
    } else {
        if (imgCtrl) imgCtrl.classList.remove('hidden');
        if (txtCtrl) txtCtrl.classList.add('hidden');
        if (replaceBtn) replaceBtn.classList.remove('hidden');

        const perkBox = $('thPerkControls');
        if (perkBox) {
            if (l.type === 'perk') {
                perkBox.classList.remove('hidden');
                const fEn = l.showFrame !== false;
                const iEn = l.showIcon !== false;
                const icPct = Math.round((l.iconScale != null ? l.iconScale : 1) * 100);
                if ($('thPerkFrameEnabled')) $('thPerkFrameEnabled').checked = fEn;
                if ($('thPerkIconEnabled')) $('thPerkIconEnabled').checked = iEn;
                if ($('thPerkIconScale')) $('thPerkIconScale').value = icPct;
                if ($('thPerkIconScaleVal')) $('thPerkIconScaleVal').textContent = `${icPct}%`;
            } else {
                perkBox.classList.add('hidden');
            }
        }        

        const scalePct = Math.round((l.scale || 1) * 100);
        if ($('thScaleRange')) {
            if (scalePct > 1000) $('thScaleRange').max = String(scalePct);
            $('thScaleRange').value = scalePct;
        }
        if ($('thScaleVal')) $('thScaleVal').textContent = `${scalePct}%`;

        const rotDeg = Math.round(l.rot || 0);
        if ($('thRotRange')) $('thRotRange').value = rotDeg;
        if ($('thRotVal')) $('thRotVal').textContent = `${rotDeg}°`;

        const flipBtn = $('thFlipBtn');
        if (flipBtn) flipBtn.classList.toggle('bd-btn-primary', !!l.flipX);

        const cp = l.crop || { t: 0, r: 0, b: 0, l: 0 };
        ['T', 'B', 'L', 'R'].forEach(side => {
            const val = cp[side.toLowerCase()] || 0;
            if ($('thCrop' + side)) $('thCrop' + side).value = val;
            if ($('thCrop' + side + 'Val')) $('thCrop' + side + 'Val').textContent = `${val}%`;
        });
    }
}

function updateSelectedLayerProps() {
    const l = getSelectedThumbLayer();
    if (!l) return;
    l.visible = $('thLayerVisible') ? $('thLayerVisible').checked : true;
    const opPct = $('thOpacityRange') ? (parseInt($('thOpacityRange').value, 10) || 0) : 100;
    l.opacity = Math.max(0, Math.min(1, opPct / 100));
    if ($('thOpacityVal')) $('thOpacityVal').textContent = `${opPct}%`;    

    if (l.type === 'text') {
        l.content = $('thTextInput') ? $('thTextInput').value : '';
        l.label = l.content.trim().slice(0, 14) || 'Texto';
        l.size = parseInt($('thTextSize').value, 10) || 64;
        l.color = $('thTextColor').value || '#ffffff';
        if ($('thTextSizeVal')) $('thTextSizeVal').textContent = `${l.size}px`;
        l.font = $('thTextFont') ? $('thTextFont').value : 'Barlow Condensed';
        ensureGoogleFontLoaded(l.font).then(() => renderThumbCanvas());     
        l.strokeEnabled = $('thTextStrokeEnabled') ? $('thTextStrokeEnabled').checked : true;
        l.strokeWidth = $('thTextStrokeWidth') ? (parseInt($('thTextStrokeWidth').value, 10) || 8) : 8;
        l.strokeColor = $('thTextStrokeColor') ? $('thTextStrokeColor').value : '#000000';
        if ($('thTextStrokeVal')) $('thTextStrokeVal').textContent = `${l.strokeWidth}px`;        
    } else {
        const pct = parseInt($('thScaleRange').value, 10) || 100;
        const rot = parseInt($('thRotRange').value, 10) || 0;
        l.scale = pct / 100;
        l.rot = rot;
        if ($('thScaleVal')) $('thScaleVal').textContent = `${pct}%`;
        if ($('thRotVal')) $('thRotVal').textContent = `${rot}°`;
        
        l.crop = {
            t: parseInt($('thCropT')?.value, 10) || 0,
            b: parseInt($('thCropB')?.value, 10) || 0,
            l: parseInt($('thCropL')?.value, 10) || 0,
            r: parseInt($('thCropR')?.value, 10) || 0
        };
        ['T', 'B', 'L', 'R'].forEach(side => {
            if ($('thCrop' + side + 'Val')) $('thCrop' + side + 'Val').textContent = `${l.crop[side.toLowerCase()]}%`;
        });

        if (l.type === 'perk') {
            l.showFrame = $('thPerkFrameEnabled') ? $('thPerkFrameEnabled').checked : true;
            l.showIcon = $('thPerkIconEnabled') ? $('thPerkIconEnabled').checked : true;
            const icPct = $('thPerkIconScale') ? (parseInt($('thPerkIconScale').value, 10) || 100) : 100;
            l.iconScale = Math.max(0.3, Math.min(1.5, icPct / 100));
            if ($('thPerkIconScaleVal')) $('thPerkIconScaleVal').textContent = `${icPct}%`;
        }
    }

    renderThumbLayerList();
    renderThumbCanvas();
}

function addThumbTextLayer() {
    const newTxt = {
        id: uidThumb('text'),
        type: 'text',
        label: 'Texto',
        visible: true,
        content: 'NOVO TEXTO',
        x: 0.5,
        y: 0.82,
        size: thumbRatio === '9:16' ? 76 : 64,
        font: 'Barlow Condensed',
        color: '#ffffff',
        strokeEnabled: true,
        strokeColor: '#000000',
        strokeWidth: 8,
        opacity: 1
    };
    thumbState.items.push(newTxt);
    selectThumbLayer(newTxt.id);
    pushThumbHistory();
}

function addThumbCustomImageLayer(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const newImg = {
            id: uidThumb('img'),
            type: 'image',
            label: file.name.slice(0, 14),
            visible: true,
            x: 0.5,
            y: 0.5,
            scale: 1.0,
            rot: 0,
            opacity: 1,
            src: reader.result
        };
        thumbState.items.push(newImg);
        selectThumbLayer(newImg.id);
        showToast(currentLang === 'pt' ? 'Imagem adicionada!' : 'Image added!', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function addThumbPickedCharacter() {
    const sel = $('thPickChar');
    if (!sel || !sel.value) return;
    const found = getAllThumbCharacters().find(c => c.id === sel.value);
    if (!found) return;
    const offset = (thumbState.items.filter(i => i.type === 'char').length % 4) * 0.08;
    const newChar = {
        id: uidThumb('char'),
        type: 'char',
        label: nm(found),
        visible: true,
        x: Math.min(0.85, 0.35 + offset),
        y: 0.55,
        scale: 1.0,
        rot: 0,
        opacity: 1,
        src: getFirstAvailableSrc(entryImgs(found))
    };
    thumbState.items.push(newChar);
    selectThumbLayer(newChar.id);
    pushThumbHistory();
}

function addThumbPickedPerk() {
    const sel = $('thPickPerk0');
    if (!sel || !sel.value) return;
    const found = getAllThumbPerks().find(p => p.id === sel.value);
    if (!found) return;
    const offset = (thumbState.items.filter(i => i.type === 'perk').length % 5) * 0.07;
    const newPerk = {
        id: uidThumb('perk'),
        type: 'perk',
        label: nm(found),
        visible: true,
        x: Math.min(0.85, 0.25 + offset),
        y: 0.40,
        scale: 1.0,
        rot: 0,
        opacity: 1,
        src: getFirstAvailableSrc(entryImgs(found)),
        showFrame: true,
        showIcon: true,
        iconScale: 1.0        
    };
    thumbState.items.push(newPerk);
    selectThumbLayer(newPerk.id);
    pushThumbHistory();
}

function moveThumbLayerOrder(dir) {
    if (selectedThumbId === 'bg') return;
    const idx = thumbState.items.findIndex(i => i.id === selectedThumbId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= thumbState.items.length) return;
    const [item] = thumbState.items.splice(idx, 1);
    thumbState.items.splice(targetIdx, 0, item);
    renderThumbLayerList();
    renderThumbCanvas();
    pushThumbHistory()
}

function removeSelectedThumbLayer() {
    if (selectedThumbId === 'bg') {
        thumbState.bg.src = '';
        renderThumbCanvas();
        return;
    }
    thumbState.items = thumbState.items.filter(i => i.id !== selectedThumbId);
    selectedThumbId = thumbState.items.length ? thumbState.items[thumbState.items.length - 1].id : 'bg';
    renderThumbLayerList();
    syncThumbControlsToSelected();
    renderThumbCanvas();
    pushThumbHistory();
    
}

function clearAllThumbLayers() {
    thumbState.items = [];
    selectedThumbId = 'bg';
    renderThumbLayerList();
    syncThumbControlsToSelected();
    renderThumbCanvas();
    pushThumbHistory();
}

function handleThumbCustomImage(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const l = getSelectedThumbLayer();
        if (!l || l.type === 'text') return;
        l.src = reader.result;
        l.visible = true;
        thumbImgCache.delete(reader.result);
        renderThumbCanvas();
        showToast(currentLang === 'pt' ? 'Imagem atualizada!' : 'Image updated!', 'success');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

function saveThumbProjectFile() {
    const payload = { version: 2, savedAt: new Date().toISOString(), ratio: thumbRatio, state: thumbState };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dbd-thumb-projeto-${thumbRatio.replace(':', 'x')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(currentLang === 'pt' ? 'Projeto salvo (.json)!' : 'Project saved (.json)!', 'success');
}

function openThumbProjectFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            if (!parsed || !parsed.state || !Array.isArray(parsed.state.items)) throw new Error('inválido');
            thumbState = parsed.state;
            setThumbRatio(parsed.ratio === '9:16' ? '9:16' : '16:9');
            selectedThumbId = thumbState.items.length ? thumbState.items[0].id : 'bg';
            renderThumbLayerList();
            syncThumbControlsToSelected();
            renderThumbCanvas();
            showToast(currentLang === 'pt' ? 'Projeto carregado!' : 'Project loaded!', 'success');
        } catch (err) {
            showToast(currentLang === 'pt' ? 'Arquivo de projeto inválido.' : 'Invalid project file.', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function drawThumbSelectionHandles(g, w, h, color = '#00e5ff') {
    g.save();
    g.globalAlpha = 1;
    g.shadowBlur = 0;
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.strokeRect(-w / 2, -h / 2, w, h);

    // Linha e bolinha de rotação no topo
    const rotY = -h / 2 - 32;
    g.beginPath();
    g.moveTo(0, -h / 2);
    g.lineTo(0, rotY);
    g.stroke();

    const drawDot = (x, y, fill) => {
        g.beginPath();
        g.arc(x, y, 8, 0, Math.PI * 2);
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = '#0b0c0f';
        g.lineWidth = 2;
        g.stroke();
    };

    drawDot(0, rotY, '#facc15'); // Bolinha amarela = Rotacionar
    [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].forEach(([cx, cy]) => {
        drawDot(cx, cy, '#ffffff'); // Bolinhas brancas = Redimensionar
    });
    g.restore();
}

async function renderThumbCanvas() {
    thumbSelectedBox = null;
    const canvas = $('thumbCanvas');
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    const frameImg = await loadThumbImageElement(getFirstAvailableSrc(imgPaths('perk_purple.png')));
    const bgImg = await loadThumbImageElement(thumbState.bg.src);
    const itemImgs = await Promise.all(thumbState.items.map(it => it.type === 'text' ? Promise.resolve(null) : loadThumbImageElement(it.src)));

    // Garante que as fontes usadas nos textos já estejam carregadas antes de desenhar
    const activeFonts = [...new Set(
        thumbState.items
            .filter(it => it && it.type === 'text' && it.visible !== false && it.content && it.content.trim())
            .map(it => it.font || 'Barlow Condensed')
    )];
    if (activeFonts.length && typeof ensureGoogleFontLoaded === 'function') {
        await Promise.all(activeFonts.map(f => ensureGoogleFontLoaded(f)));
    }

    g.clearRect(0, 0, W, H);
    const bgGrad = g.createRadialGradient(W * 0.5, H * 0.4, 40, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    bgGrad.addColorStop(0, '#2b1218');
    bgGrad.addColorStop(0.55, '#121018');
    bgGrad.addColorStop(1, '#07080b');
    g.fillStyle = bgGrad;
    g.fillRect(0, 0, W, H);

    // Fundo
    const bgL = thumbState.bg;
    if (bgL.visible && bgImg) {
        g.save();
        g.translate(bgL.x * W, bgL.y * H);
        g.rotate(((bgL.rot || 0) * Math.PI) / 180);
        g.scale((bgL.scale || 1) * (bgL.flipX ? -1 : 1), bgL.scale || 1);
        g.globalAlpha = bgL.opacity != null ? bgL.opacity : 0.45;
        const cpBg = bgL.crop || { t: 0, r: 0, b: 0, l: 0 };
        if (cpBg.t || cpBg.r || cpBg.b || cpBg.l) {
            const cx0 = -W / 2 + (W * cpBg.l) / 100;
            const cy0 = -H / 2 + (H * cpBg.t) / 100;
            const cw = Math.max(4, W * (1 - (cpBg.l + cpBg.r) / 100));
            const ch = Math.max(4, H * (1 - (cpBg.t + cpBg.b) / 100));
            g.beginPath();
            g.rect(cx0, cy0, cw, ch);
            g.clip();
        }
        g.drawImage(bgImg, -W / 2, -H / 2, W, H);
        g.restore();
    }

    const basePerkSize = Math.min(W, H) * 0.24;

    thumbState.items.forEach((l, idx) => {
        if (l.visible === false) return;
        const im = itemImgs[idx];
        const px = l.x * W, py = l.y * H;
        const layerAlpha = l.opacity != null ? Math.max(0, Math.min(1, l.opacity)) : 1;

        if (l.type === 'text') {
            if (!l.content || !l.content.trim()) return;
            const fontSize = l.size || 64;
            const fontFamily = l.font || 'Barlow Condensed';
            const useStroke = l.strokeEnabled !== false;
            const strokeColor = l.strokeColor || '#000000';
            const strokeWidth = l.strokeWidth != null ? l.strokeWidth : Math.max(5, Math.round(fontSize * 0.12));

            g.save();
            g.globalAlpha = layerAlpha;
            g.font = `800 ${fontSize}px "${fontFamily}", "Barlow Condensed", sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            const textStr = l.content.trim().toUpperCase();

            g.shadowColor = 'rgba(0, 0, 0, 0.85)';
            g.shadowBlur = 18;

            if (useStroke && strokeWidth > 0) {
                g.lineJoin = 'round';
                g.lineWidth = strokeWidth;
                g.strokeStyle = strokeColor;
                g.strokeText(textStr, px, py);
            }

            g.shadowBlur = useStroke ? 0 : 14;
            g.fillStyle = l.color || '#ffffff';
            g.fillText(textStr, px, py);

            if (selectedThumbId === l.id) {
                const w = g.measureText(textStr).width + 24;
                const h = fontSize + 14;
                thumbSelectedBox = { cx: px, cy: py, w, h, rot: 0 };
                g.translate(px, py);
                drawThumbSelectionHandles(g, w, h, '#00e5ff');
            }
            g.restore();
            return;
        }

        if (l.type === 'perk') {
            const size = basePerkSize * (l.scale || 1);
            const cp = l.crop || { t: 0, r: 0, b: 0, l: 0 };
            const showFrame = l.showFrame !== false;
            const showIcon = l.showIcon !== false;
            const iconScale = l.iconScale != null ? l.iconScale : 1;

            g.save();
            g.globalAlpha = layerAlpha;
            g.translate(px, py);
            g.rotate(((l.rot || 0) * Math.PI) / 180);
            g.shadowColor = 'rgba(0, 0, 0, 0.75)';
            g.shadowBlur = 24;
            g.save();
            if (cp.t || cp.r || cp.b || cp.l) {
                const cx0 = -size / 2 + (size * cp.l) / 100;
                const cy0 = -size / 2 + (size * cp.t) / 100;
                const cw = Math.max(4, size * (1 - (cp.l + cp.r) / 100));
                const ch = Math.max(4, size * (1 - (cp.t + cp.b) / 100));
                g.beginPath();
                g.rect(cx0, cy0, cw, ch);
                g.clip();
            }
            if (l.flipX) g.scale(-1, 1);
            if (showFrame && frameImg) g.drawImage(frameImg, -size / 2, -size / 2, size, size);
            if (showIcon && im) {
                const inner = size * 0.96 * iconScale;
                drawContain(g, im, -inner / 2, -inner / 2, inner, inner);
            }
            g.restore();
            if (selectedThumbId === l.id) {
                thumbSelectedBox = { cx: px, cy: py, w: size, h: size, rot: l.rot || 0 };
                drawThumbSelectionHandles(g, size, size, '#00e5ff');
            }
            g.restore();
            return;
        }

        // char ou image própria
        if (!im) return;
        const boxH = H * (l.type === 'char' ? 0.72 : 0.45) * (l.scale || 1);
        const aspect = im.width && im.height ? (im.width / im.height) : 0.75;
        const boxW = boxH * aspect;
        const cp = l.crop || { t: 0, r: 0, b: 0, l: 0 };
        g.save();
        g.globalAlpha = layerAlpha;
        g.translate(px, py);
        g.rotate(((l.rot || 0) * Math.PI) / 180);
        g.shadowColor = 'rgba(0, 0, 0, 0.85)';
        g.shadowBlur = 28;
        g.save();
        if (cp.t || cp.r || cp.b || cp.l) {
            const cx0 = -boxW / 2 + (boxW * cp.l) / 100;
            const cy0 = -boxH / 2 + (boxH * cp.t) / 100;
            const cw = Math.max(4, boxW * (1 - (cp.l + cp.r) / 100));
            const ch = Math.max(4, boxH * (1 - (cp.t + cp.b) / 100));
            g.beginPath();
            g.rect(cx0, cy0, cw, ch);
            g.clip();
        }
        if (l.flipX) g.scale(-1, 1);
        drawContain(g, im, -boxW / 2, -boxH / 2, boxW, boxH);
        g.restore();
        if (selectedThumbId === l.id) {
            thumbSelectedBox = { cx: px, cy: py, w: boxW, h: boxH, rot: l.rot || 0 };
            drawThumbSelectionHandles(g, boxW, boxH, l.type === 'char' ? '#d4a34a' : '#00e5ff');
        }
        g.restore();
    });
}

function exportThumbPng() {
    const canvas = $('thumbCanvas');
    if (!canvas) return;
    const prevSelected = selectedThumbId;
    selectedThumbId = '';
    renderThumbCanvas().then(() => {
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `dbd-thumb-${thumbRatio.replace(':', 'x')}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        selectedThumbId = prevSelected;
        renderThumbCanvas();
        showToast(currentLang === 'pt' ? 'Thumbnail PNG baixada!' : 'PNG thumbnail downloaded!', 'success');
    });
}

function initThumbmakerEvents() {
    initThumbDropzone();

    const canvas = $('thumbCanvas');
    if (!canvas || canvas.dataset.bound) return;
    canvas.dataset.bound = '1';

    const toNorm = e => {
        const rect = canvas.getBoundingClientRect();
        return {
            nx: Math.max(0.03, Math.min(0.97, (e.clientX - rect.left) / rect.width)),
            ny: Math.max(0.03, Math.min(0.97, (e.clientY - rect.top) / rect.height))
        };
    };

    const toCanvasPx = e => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * canvas.width,
            y: ((e.clientY - rect.top) / rect.height) * canvas.height
        };
    };

    const hitHandle = ptPx => {
        if (!thumbSelectedBox) return null;
        const { cx, cy, w, h, rot } = thumbSelectedBox;
        const rad = (-rot * Math.PI) / 180;
        const dx = ptPx.x - cx, dy = ptPx.y - cy;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);

        if (Math.hypot(lx, ly - (-h / 2 - 32)) <= 18) return 'rotate';
        const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]];
        if (corners.some(([hx, hy]) => Math.hypot(lx - hx, ly - hy) <= 18)) return 'scale';
        return null;
    };

    canvas.addEventListener('pointerdown', e => {
        const pt = toNorm(e);
        const ptPx = toCanvasPx(e);
        const handleMode = hitHandle(ptPx);
        const cur = getSelectedThumbLayer();

        if (handleMode && cur) {
            const dist0 = Math.max(10, Math.hypot(ptPx.x - thumbSelectedBox.cx, ptPx.y - thumbSelectedBox.cy));
            thumbDragging = {
                mode: handleMode,
                id: cur.id,
                cx: thumbSelectedBox.cx,
                cy: thumbSelectedBox.cy,
                dist0,
                scale0: cur.scale || 1,
                size0: cur.size || 64
            };
            canvas.setPointerCapture(e.pointerId);
            return;
        }

        // Seleciona a camada mais próxima do clique (de cima para baixo)
        let hit = null;
        for (let i = thumbState.items.length - 1; i >= 0; i--) {
            const it = thumbState.items[i];
            if (it.visible === false) continue;
            const dx = Math.abs(pt.nx - it.x);
            const dy = Math.abs(pt.ny - it.y);
            if (dx <= 0.16 && dy <= 0.16) {
                hit = it;
                break;
            }
        }
        if (hit) {
            selectedThumbId = hit.id;
            renderThumbLayerList();
            syncThumbControlsToSelected();
        }
        const target = getSelectedThumbLayer();
        if (!target) return;
        thumbDragging = {
            mode: 'move',
            id: target.id,
            offsetX: target.x - pt.nx,
            offsetY: target.y - pt.ny
        };
        canvas.setPointerCapture(e.pointerId);
        renderThumbCanvas();
    });

    canvas.addEventListener('pointermove', e => {
        if (!thumbDragging) return;
        const target = thumbDragging.id === 'bg'
            ? thumbState.bg
            : thumbState.items.find(i => i.id === thumbDragging.id);
        if (!target) return;

        if (thumbDragging.mode === 'move') {
            const pt = toNorm(e);
            target.x = Math.max(0.03, Math.min(0.97, pt.nx + thumbDragging.offsetX));
            target.y = Math.max(0.03, Math.min(0.97, pt.ny + thumbDragging.offsetY));
        } else if (thumbDragging.mode === 'rotate' && target.type !== 'text') {
            const ptPx = toCanvasPx(e);
            const deg = Math.atan2(ptPx.y - thumbDragging.cy, ptPx.x - thumbDragging.cx) * (180 / Math.PI) + 90;
            target.rot = Math.round(deg);
            syncThumbControlsToSelected();
        } else if (thumbDragging.mode === 'scale') {
            const ptPx = toCanvasPx(e);
            const dist = Math.max(10, Math.hypot(ptPx.x - thumbDragging.cx, ptPx.y - thumbDragging.cy));
            const ratio = dist / thumbDragging.dist0;
            if (target.type === 'text') {
                target.size = Math.max(20, Math.min(160, Math.round(thumbDragging.size0 * ratio)));
            } else {
                target.scale = Math.max(0.2, Math.min(10, thumbDragging.scale0 * ratio));
            }
            syncThumbControlsToSelected();
        }
        renderThumbCanvas();
    });

    canvas.addEventListener('pointerup', () => {
        if (thumbDragging) {
            thumbDragging = null;
            pushThumbHistory();
        }
    });

    if (!window._thumbKeysBound) {
        window._thumbKeysBound = true;
        document.addEventListener('keydown', e => {
            if (currentTab !== 'thumb') return;
            const tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                e.shiftKey ? redoThumb() : undoThumb();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redoThumb();
            }
        });
    }
}

function syncThumbTextControls() {
    syncThumbControlsToSelected();
}

function getAllThumbCharacters() {
    const survs = (initialData.survivors || []).map(c => ({ ...c, _roleLabel: 'SURV' }));
    const kills = (initialData.killers || []).map(c => ({ ...c, _roleLabel: 'KILL' }));
    const customChars = (customEntries || [])
        .filter(e => e.category === 'character')
        .map(c => ({ ...c, _roleLabel: (c.role === 'killer' ? 'KILL' : 'SURV') }));
    return [...survs, ...kills, ...customChars];
}

function getAllThumbPerks() {
    const survP = (initialData.survivorPerks || []).map(p => ({ ...p, _roleLabel: 'SURV' }));
    const killP = (initialData.killerPerks || []).map(p => ({ ...p, _roleLabel: 'KILL' }));
    const customP = (customEntries || [])
        .filter(e => e.category === 'perk')
        .map(p => ({ ...p, _roleLabel: (p.role === 'killer' ? 'KILL' : 'SURV') }));
    return [...survP, ...killP, ...customP];
}

function populateThumbSelectors() {
    const charSel = $('thPickChar');
    const perkSel = $('thPickPerk0');
    if (!charSel || !perkSel) return;

    const allChars = getAllThumbCharacters();
    const allPerks = getAllThumbPerks();

    const prevChar = charSel.value;
    charSel.innerHTML =
        `<option value="">${currentLang === 'pt' ? '— Escolher personagem —' : '— Choose character —'}</option>` +
        allChars.map(c => `<option value="${esc(c.id)}">[${c._roleLabel}] ${esc(nm(c))}</option>`).join('');
    if (prevChar) charSel.value = prevChar;

    const prevPerk = perkSel.value;
    perkSel.innerHTML =
        `<option value="">${currentLang === 'pt' ? '— Escolher perk —' : '— Choose perk —'}</option>` +
        allPerks.map(p => `<option value="${esc(p.id)}">[${p._roleLabel}] ${esc(nm(p))}</option>`).join('');
    if (prevPerk) perkSel.value = prevPerk;
}

function toggleThumbFlipX() {
    const l = getSelectedThumbLayer();
    if (!l || l.type === 'text') return;
    l.flipX = !l.flipX;
    syncThumbControlsToSelected();
    renderThumbCanvas();
    pushThumbHistory();
}

const thumbLoadedFonts = new Set(['Barlow Condensed', 'Plus Jakarta Sans']);

async function ensureGoogleFontLoaded(fontFamily) {
    const clean = String(fontFamily || 'Barlow Condensed').replace(/['"]/g, '').trim();
    if (!clean) return 'Barlow Condensed';

    if (!thumbLoadedFonts.has(clean)) {
        const linkId = 'gfont_' + slugId(clean);
        if (!document.getElementById(linkId)) {
            const link = document.createElement('link');
            link.id = linkId;
            link.rel = 'stylesheet';
            link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(clean)}:wght@700;800;900&display=swap`;
            document.head.appendChild(link);
        }
        thumbLoadedFonts.add(clean);
    }

    try {
        await document.fonts.load(`800 64px "${clean}"`);
        await document.fonts.ready;
    } catch (e) {}

    return clean;
}

async function handleThumbFontChange() {
    const l = getSelectedThumbLayer();
    if (!l || l.type !== 'text') return;
    const chosen = $('thTextFont') ? $('thTextFont').value : 'Barlow Condensed';
    l.font = chosen;
    await ensureGoogleFontLoaded(chosen);
    renderThumbCanvas();
}

function addThumbImageFile(file, normPos = null) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
        const offset = (thumbState.items.filter(i => i.type === 'image').length % 5) * 0.04;
        const newImg = {
            id: uidThumb('img'),
            type: 'image',
            label: (file.name || 'Imagem').slice(0, 14),
            visible: true,
            x: normPos ? Math.max(0.05, Math.min(0.95, normPos.nx)) : Math.min(0.85, 0.5 + offset),
            y: normPos ? Math.max(0.05, Math.min(0.95, normPos.ny)) : Math.min(0.85, 0.5 + offset),
            scale: 1.0,
            rot: 0,
            flipX: false,
            opacity: 1,
            src: reader.result
        };
        thumbState.items.push(newImg);
        thumbImgCache.delete(reader.result);
        selectThumbLayer(newImg.id);
        showToast(
            currentLang === 'pt' ? `"${file.name}" adicionada ao canvas!` : `"${file.name}" added to canvas!`,
            'success'
        );
    };
    reader.readAsDataURL(file);
}

function handleThumbDroppedFiles(fileList, normPos = null) {
    if (!fileList || !fileList.length) return;
    Array.from(fileList).forEach((file, i) => {
        const shifted = normPos
            ? { nx: normPos.nx + i * 0.03, ny: normPos.ny + i * 0.03 }
            : null;
        addThumbImageFile(file, shifted);
    });
}

function initThumbDropzone() {
    const dropEl = $('thDropZone');
    const canvas = $('thumbCanvas');

    const bindZone = (el, getPosFromEvent) => {
        if (!el || el.dataset.dropBound) return;
        el.dataset.dropBound = '1';

        ['dragenter', 'dragover'].forEach(evName => {
            el.addEventListener(evName, e => {
                if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
                e.preventDefault();
                e.stopPropagation();
                el.classList.add('border-dbd-cyan', 'bg-neutral-900');
            });
        });

        ['dragleave', 'drop'].forEach(evName => {
            el.addEventListener(evName, e => {
                if (evName === 'drop' && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                el.classList.remove('border-dbd-cyan', 'bg-neutral-900');
            });
        });

        el.addEventListener('drop', e => {
            const files = e.dataTransfer && e.dataTransfer.files;
            if (!files || !files.length) return;
            e.preventDefault();
            e.stopPropagation();
            const pos = getPosFromEvent ? getPosFromEvent(e) : null;
            handleThumbDroppedFiles(files, pos);
        });
    };

    bindZone(dropEl, null);
    bindZone(canvas, e => {
        const rect = canvas.getBoundingClientRect();
        return {
            nx: (e.clientX - rect.left) / rect.width,
            ny: (e.clientY - rect.top) / rect.height
        };
    });
}

let thumbHistory = [];
let thumbHistoryIdx = -1;
let thumbSelectedBox = null; // guarda { cx, cy, w, h, rot } da camada selecionada

function pushThumbHistory() {
    const snap = JSON.stringify(thumbState);
    if (thumbHistory[thumbHistoryIdx] === snap) return;
    thumbHistory = thumbHistory.slice(0, thumbHistoryIdx + 1);
    thumbHistory.push(snap);
    if (thumbHistory.length > 40) thumbHistory.shift();
    thumbHistoryIdx = thumbHistory.length - 1;
    updateThumbHistoryButtons();
}

function updateThumbHistoryButtons() {
    if ($('thBtnUndo')) $('thBtnUndo').disabled = thumbHistoryIdx <= 0;
    if ($('thBtnRedo')) $('thBtnRedo').disabled = thumbHistoryIdx >= thumbHistory.length - 1;
}

function undoThumb() {
    if (thumbHistoryIdx <= 0) return;
    thumbHistoryIdx--;
    thumbState = JSON.parse(thumbHistory[thumbHistoryIdx]);
    if (!getSelectedThumbLayer()) selectedThumbId = 'bg';
    renderThumbLayerList();
    syncThumbControlsToSelected();
    renderThumbCanvas();
    updateThumbHistoryButtons();
}

function redoThumb() {
    if (thumbHistoryIdx >= thumbHistory.length - 1) return;
    thumbHistoryIdx++;
    thumbState = JSON.parse(thumbHistory[thumbHistoryIdx]);
    if (!getSelectedThumbLayer()) selectedThumbId = 'bg';
    renderThumbLayerList();
    syncThumbControlsToSelected();
    renderThumbCanvas();
    updateThumbHistoryButtons();
}

function resetThumbCrop() {
    const l = getSelectedThumbLayer();
    if (!l || l.type === 'text') return;
    l.crop = { t: 0, r: 0, b: 0, l: 0 };
    syncThumbControlsToSelected();
    renderThumbCanvas();
    pushThumbHistory();
}

if (document.body) initTagDrawer();
else document.addEventListener('DOMContentLoaded', initTagDrawer);


/* ==========================================================================
   REROLAR SÓ UM ELEMENTO (personagem, perk, item/poder ou add-on)
   Respeita travas, filtros do acervo, tags e evita perk repetido na build.
   ========================================================================== */
const _L = (pt, en) => (currentLang === 'pt' ? pt : en);
const REROLL_STEPS = 9;

// Pequena animação: vários valores aleatórios e o resultado final.
//   candidate() -> novo resultado (build inteira) | onStep(tmp) | onDone(final)
function animateReroll(candidate, onStep, onDone, beep, isAlive) {
    const finalRes = candidate();
    let n = 0;
    (function tick() {
        if (isAlive && !isAlive()) { onDone(null); return; }
        if (n < REROLL_STEPS) {
            if (beep) beep(300 + n * 30);
            onStep(candidate());
            n++;
            setTimeout(tick, 45 + n * 12);
        } else {
            onDone(finalRes);
        }
    })();
}

// Item / add-ons: devolve { make } (gera o novo item) ou { error } (mensagem para o usuário)
function itemRerollFactory(role, character, item, kind, n) {
    if (kind === 'item') {
        if (role === 'killer' && !getKillerPower(character)) {
            return { error: _L('Esse killer não tem poder cadastrado.', 'This killer has no power registered.') };
        }
        return { make: () => rollItem(role, character) || item || { ...EMPTY_ITEM } };
    }
    const src = role === 'survivor'
        ? ((findSurvItem(item && item.namePt) || {}).found)
        : getKillerPower(character);
    if (!src) return { error: _L('Esse item não tem add-ons para rerrolar.', 'This item has no add-ons to reroll.') };
    const names = [0, 1].map(i => (item.addons && item.addons[i]) ? item.addons[i].namePt : null);
    const pool = addonPairs(src).filter(a => a.pt !== names[0] && a.pt !== names[1]);
    if (!pool.length) return { error: _L('Não há outro add-on disponível.', 'No other add-on available.') };
    return {
        make: () => {
            const nn = names.slice();
            nn[n - 1] = pick(pool).pt;
            return makeItemObj(role, character, item.namePt, nn.filter(Boolean));
        }
    };
}

function rerollOne(kind, idx) {
    if (isSpinning) return;
    const cur = currentRollResult;
    if (!cur || cur.role !== currentRole) {
        showToast(_L('Gire a roleta antes de rerrolar!', 'Spin the roulette before rerolling!'), 'error');
        return;
    }
    const role = cur.role;
    const locked = (kind === 'char' && locks.char)
        || (kind === 'perk' && locks.perks[idx])
        || ((kind === 'item' || kind === 'addon') && locks.item);
    if (locked) {
        showToast(_L('Esse slot está travado. Destrave para rerrolar.', 'This slot is locked. Unlock it to reroll.'), 'error');
        return;
    }

    // Mesmos filtros do spinRoulette: acervo, tags e conteúdo Ptb
    const chars = getActiveCharacters().filter(c => !excludedCharacters.has(c.id) && (includePtb() || !isPtb(c)));
    const perks = getActivePerks().filter(p => !excludedPerks.has(p.id) && matchesTags(p) && (includePtb() || !isPtb(p)));

    const parts = { char: false, perks: [false, false, false, false], items: false };
    let candidate;

    if (kind === 'char') {
        const pool = chars.filter(c => !cur.character || c.id !== cur.character.id);
        if (!pool.length) {
            showToast(_L('Não há outro personagem ativo no acervo.', 'No other active character in the pool.'), 'error');
            return;
        }
        parts.char = true;
        parts.items = role === 'killer';   // o poder do killer muda junto com ele
        candidate = () => {
            const character = pick(pool);
            return {
                ...cur,
                character,
                item: role === 'killer' ? (rollItem(role, character) || { ...EMPTY_ITEM }) : cur.item
            };
        };
    } else if (kind === 'perk') {
        const others = new Set(cur.perks.filter((p, i) => p && i !== idx).map(p => p.id));
        const mine = cur.perks[idx] && cur.perks[idx].id;
        const pool = perks.filter(p => !others.has(p.id) && p.id !== mine);
        if (!pool.length) {
            showToast(activeTags.size
                ? _L('Poucos perks com essas tags. Remova alguma tag ou ative mais perks no acervo.', 'Not enough perks with these tags. Remove a tag or enable more perks in the pool.')
                : _L('Não há outro perk ativo no acervo.', 'No other active perk in the pool.'), 'error');
            return;
        }
        parts.perks[idx] = true;
        candidate = () => {
            const np = cur.perks.slice();
            np[idx] = pick(pool);
            return { ...cur, perks: np };
        };
    } else {
        const f = itemRerollFactory(role, cur.character, cur.item || EMPTY_ITEM, kind, idx);
        if (f.error) { showToast(f.error, 'error'); return; }
        parts.items = kind === 'item';
        candidate = () => ({ ...cur, item: f.make() });
    }

    isSpinning = true;
    animateReroll(
        candidate,
        tmp => renderResultDisplay(tmp, true, { ...parts, finale: false, revealedSlots: new Set() }),
        final => {
            isSpinning = false;
            if (!final) return;
            currentRollResult = { ...final, date: new Date().toLocaleDateString() };
            renderResultDisplay(currentRollResult, false, {
                ...parts, finale: false, revealedSlots: new Set(kind === 'perk' ? [idx] : [])
            });
            addToHistory(currentRollResult);
            announceBuild(currentRollResult);
            playBeepSound(880);
            showToast(_L('Rerrolado!', 'Rerolled!'), 'success');
        },
        playBeepSound,
        () => currentRole === role
    );
}

// Botões de rerrolar: desabilita os travados e ajusta os textos por idioma/lado
function updateRerollUI() {
    const set = (id, disabled, label) => {
        const b = $(id);
        if (!b) return;
        b.disabled = !!disabled;
        const t = disabled ? _L('Destrave para rerrolar', 'Unlock to reroll') : label;
        b.title = t;
        b.setAttribute('aria-label', t);
    };
    const killer = currentRole === 'killer';
    set('rerollChar', locks.char, killer
        ? _L('Rerrolar só o personagem (o poder muda junto)', 'Reroll only the character (the power changes too)')
        : _L('Rerrolar só o personagem', 'Reroll only the character'));
    [0, 1, 2, 3].forEach(i => set('rerollPerk' + i, locks.perks[i], _L('Rerrolar só este perk', 'Reroll only this perk')));
    set('rerollItem', locks.item, killer
        ? _L('Rerrolar os add-ons do poder', 'Reroll the power add-ons')
        : _L('Rerrolar só o item (e add-ons)', 'Reroll only the item (and add-ons)'));
    [1, 2].forEach(n => set('rerollAddon' + n, locks.item, _L('Rerrolar só este add-on', 'Reroll only this add-on')));
}


/* ==========================================================================
   ATALHOS DE TECLADO
   ========================================================================== */
function isTypingTarget(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true;
    if (tag === 'INPUT') {
        return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']
            .includes((el.type || '').toLowerCase());
    }
    return false;
}

function anyModalOpen() {
    return ['importModal', 'importPerksJsonModal', 'imageModal'].some(id => {
        const m = $(id);
        return m && !m.classList.contains('hidden');
    });
}

// Interpreta as teclas da roleta. "api" diz o que cada ação faz na aba atual.
function routeRollKeys(e, api) {
    const key = e.key || '';
    const code = e.code || '';
    const lower = key.toLowerCase();
    const isSpace = key === ' ' || code === 'Space';
    // Espaço em botão/link/checkbox mantém o comportamento nativo (acessibilidade)
    const onInteractive = !!(e.target && e.target.closest &&
        e.target.closest('button, a[href], summary, input, [role="tab"], label'));

    if ((isSpace && !onInteractive) || lower === 'r') {
        e.preventDefault();
        api.spin();
        return true;
    }
    const dm = /^(?:Digit|Numpad)([1-4])$/.exec(code);
    if (dm && api.lock) {
        e.preventDefault();
        const i = parseInt(dm[1], 10) - 1;
        e.shiftKey ? api.reroll('perk', i) : api.lock('perk', i);
        return true;
    }
    if (lower === 'c' && api.lock) {
        e.preventDefault();
        e.shiftKey ? api.reroll('char') : api.lock('char');
        return true;
    }
    if (lower === 'i' && api.lock) {
        e.preventDefault();
        e.shiftKey ? api.reroll('item') : api.lock('item');
        return true;
    }
    if (lower === 's' && api.save) { e.preventDefault(); api.save(); return true; }
    if (lower === 'q' && api.role) { e.preventDefault(); api.role(); return true; }
    if (lower === 'f' && api.fav) { e.preventDefault(); api.fav(); return true; }
    return false;
}

const mainKeysApi = {
    spin: () => spinRoulette(),
    lock: (kind, i) => {
        if (kind === 'item' && currentRole === 'killer') return;   // poder do killer não tem trava
        toggleLock(kind, i);
    },
    reroll: (kind, i) => rerollOne(kind, i),
    save: () => saveCurrentBuild(),
    role: () => { if (!isSpinning) setRole(currentRole === 'survivor' ? 'killer' : 'survivor'); },
    fav: () => favoriteCurrentRoll()
};

const squadKeysApi = {
    spin: () => spinSquadRoulette(),
    save: () => { if (typeof saveCurrentSquad === 'function') saveCurrentSquad(); }
};

function shortcutsHelpHtml() {
    const kb = (...keys) => keys.map(k => `<kbd>${k}</kbd>`).join(' ');
    const row = (keys, desc) => `<div class="bd-keys-row"><span>${keys}</span><span>${desc}</span></div>`;
    return `
    <div class="bd-keys-card" tabindex="-1">
        <div class="bd-keys-head">
            <h2 id="bdKeysTitle">${_L('Atalhos de teclado', 'Keyboard shortcuts')}</h2>
            <button type="button" class="bd-btn bd-btn-sm" data-keys-close onclick="toggleShortcutsHelp(false)" aria-label="${_L('Fechar', 'Close')}"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="bd-keys-group">${_L('Roleta e Roleta de Classes', 'Roulette and Class Roulette')}</div>
        ${row(kb(_L('Espaço', 'Space')) + ' ' + kb('R'), _L('Girar a roleta', 'Spin the roulette'))}
        ${row(kb('1') + '–' + kb('4'), _L('Travar / destravar o perk', 'Lock / unlock the perk'))}
        ${row(kb('C'), _L('Travar o personagem', 'Lock the character'))}
        ${row(kb('I'), _L('Travar o item (Survivor)', 'Lock the item (Survivor)'))}
        ${row(kb('Shift') + '+' + kb('1') + '–' + kb('4'), _L('Rerrolar só aquele perk', 'Reroll only that perk'))}
        ${row(kb('Shift') + '+' + kb('C'), _L('Rerrolar só o personagem', 'Reroll only the character'))}
        ${row(kb('Shift') + '+' + kb('I'), _L('Rerrolar item / add-ons', 'Reroll item / add-ons'))}
        ${row(kb('S'), _L('Salvar build', 'Save build'))}
        ${row(kb('F'), _L('Favoritar o sorteio atual (só na Roleta)', 'Favorite the current roll (Roulette only)'))}
        ${row(kb('Q'), _L('Alternar Survivor / Killer', 'Switch Survivor / Killer'))}
        <div class="bd-keys-group">Squad</div>
        ${row(kb(_L('Espaço', 'Space')) + ' ' + kb('R'), _L('Sortear o squad', 'Roll the squad'))}
        ${row(kb('S'), _L('Salvar squad', 'Save squad'))}
        <div class="bd-keys-group">${_L('Geral', 'General')}</div>
        ${row(kb('?') + ' ' + kb('H'), _L('Abrir / fechar esta ajuda', 'Open / close this help'))}
        ${row(kb('Esc'), _L('Fechar', 'Close'))}
        <p class="bd-hint" style="margin-top:.9rem">${_L('Os atalhos não funcionam enquanto você digita em um campo de texto.', 'Shortcuts are off while you type in a text field.')}</p>
    </div>`;
}

let _keysLastFocus = null;
function toggleShortcutsHelp(force) {
    let m = $('bdShortcutsModal');
    if (!m) {
        m = document.createElement('div');
        m.id = 'bdShortcutsModal';
        m.className = 'bd-keys-modal hidden';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.setAttribute('aria-labelledby', 'bdKeysTitle');
        m.addEventListener('click', e => { if (e.target === m) toggleShortcutsHelp(false); });
        document.body.appendChild(m);
    }
    const open = typeof force === 'boolean' ? force : m.classList.contains('hidden');
    if (open) {
        _keysLastFocus = document.activeElement;
        m.innerHTML = shortcutsHelpHtml();
        m.classList.remove('hidden');
        const c = m.querySelector('[data-keys-close]');
        if (c) c.focus();
    } else {
        m.classList.add('hidden');
        if (_keysLastFocus && _keysLastFocus.focus) _keysLastFocus.focus();
    }
}

function initKeyboardShortcuts() {
    if (window._bdKeysBound) return;
    window._bdKeysBound = true;

    // Clique de mouse num botão tira o foco dele: assim o Espaço volta a girar a roleta
    document.addEventListener('click', e => {
        if (e.pointerType !== 'mouse') return;
        const b = e.target.closest && e.target.closest(
            'button.dbd-action-btn, button.dbd-spin-btn, button.bd-lock, button.bd-reroll, button.dbd-seg-btn, button.dbd-tab');
        if (b) setTimeout(() => { if (document.activeElement === b) b.blur(); }, 0);
    });

    document.addEventListener('keydown', e => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const key = e.key || '';
        const help = $('bdShortcutsModal');
        const helpOpen = !!help && !help.classList.contains('hidden');

        if (key === 'Escape') {
            if (helpOpen) { e.preventDefault(); toggleShortcutsHelp(false); }
            return;
        }
        if (isTypingTarget(e.target)) return;

        if (helpOpen) {
            if (key === 'Tab') {          // mantém o foco dentro da janela
                e.preventDefault();
                const c = help.querySelector('[data-keys-close]');
                if (c) c.focus();
            } else if (key === '?' || key.toLowerCase() === 'h') {
                e.preventDefault();
                toggleShortcutsHelp(false);
            }
            return;
        }
        if (key === '?' || (key.toLowerCase() === 'h' && !e.shiftKey)) {
            e.preventDefault();
            toggleShortcutsHelp(true);
            return;
        }
        if (anyModalOpen()) return;

        if (currentTab === 'main') routeRollKeys(e, mainKeysApi);
        else if (currentTab === 'squad') routeRollKeys(e, squadKeysApi);
        else if (currentTab === 'classes' && window.crKeysApi) routeRollKeys(e, window.crKeysApi);
    });
}


/* ==========================================================================
   ACESSIBILIDADE
   ========================================================================== */
// Lê o resultado em voz alta para quem usa leitor de tela
function announceBuild(res) {
    const el = $('srAnnounce');
    if (!el || !res) return;
    const perks = (res.perks || []).filter(Boolean).map(p => nm(p)).join(', ');
    const it = res.item || EMPTY_ITEM;
    el.textContent = ''; // força nova leitura mesmo se o texto for igual
    setTimeout(() => {
        el.textContent = _L(
            `Loadout: ${nm(res.character)}. Perks: ${perks}. Item: ${nm(it)}.`,
            `Loadout: ${nm(res.character)}. Perks: ${perks}. Item: ${nm(it)}.`);
    }, 50);
}

// Papéis ARIA das abas (também vale para a aba "Roleta de Classes", criada por JS)
function syncTabA11y() {
    document.querySelectorAll('.dbd-nav .dbd-tab').forEach(b => {
        const m = /^tab(.+)Btn$/.exec(b.id || '');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', b.classList.contains('is-active') ? 'true' : 'false');
        if (!m) return;
        const pane = document.getElementById('tab' + m[1]);
        if (pane) {
            b.setAttribute('aria-controls', pane.id);
            pane.setAttribute('role', 'tabpanel');
            pane.setAttribute('aria-labelledby', b.id);
        }
    });
}

// Textos de acessibilidade que dependem do idioma
function applyA11yLabels() {
    const set = (id, attr, val) => { const el = $(id); if (el) el.setAttribute(attr, val); };
    const skip = $('skipLink');
    if (skip) skip.textContent = _L('Pular para o conteúdo', 'Skip to content');
    set('mainNav', 'aria-label', _L('Seções do app', 'App sections'));
    set('langPtBtn', 'aria-label', _L('Português', 'Portuguese'));
    set('langEnBtn', 'aria-label', 'English');
    set('langPtBtn', 'aria-pressed', currentLang === 'pt' ? 'true' : 'false');
    set('langEnBtn', 'aria-pressed', currentLang === 'en' ? 'true' : 'false');
    set('btnShortcuts', 'title', _L('Atalhos de teclado (?)', 'Keyboard shortcuts (?)'));
    set('btnShortcuts', 'aria-label', _L('Atalhos de teclado', 'Keyboard shortcuts'));
    set('btnSpin', 'title', _L('Atalho: Espaço ou R', 'Shortcut: Space or R'));
    const th = document.querySelector('[onclick="toggleTheme()"]');
    if (th) th.setAttribute('aria-label', _L('Alternar tema claro/escuro', 'Toggle light/dark theme'));
}

// Ícones decorativos escondidos do leitor, imagens com alt vazio e botões só-ícone com nome
function a11yScan(root) {
    if (!root || root.nodeType !== 1) return;
    const all = sel => {
        const list = [...root.querySelectorAll(sel)];
        if (root.matches && root.matches(sel)) list.unshift(root);
        return list;
    };
    all('i[class*="fa-"]:not([aria-hidden])').forEach(el => el.setAttribute('aria-hidden', 'true'));
    all('img:not([alt])').forEach(el => el.setAttribute('alt', ''));
    all('button:not([aria-label]), a.bd-btn:not([aria-label]), a.dbd-action-btn:not([aria-label])').forEach(el => {
        if (!el.textContent.trim() && el.title) el.setAttribute('aria-label', el.title);
    });
}

function initA11y() {
    if (window._bdA11yInit) return;
    window._bdA11yInit = true;
    a11yScan(document.body);

    // Só examina nós novos (barato mesmo com as listas grandes do app)
    let queue = [], scheduled = false;
    const flush = () => { scheduled = false; const q = queue; queue = []; q.forEach(a11yScan); };
    new MutationObserver(muts => {
        muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) queue.push(n); }));
        if (queue.length && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
    }).observe(document.body, { childList: true, subtree: true });

    // Setas ← → Home End navegam entre as abas
    const nav = $('mainNav');
    if (nav) nav.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const tabs = [...nav.querySelectorAll('[role="tab"]')];
        const i = tabs.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const n = e.key === 'Home' ? 0
            : e.key === 'End' ? tabs.length - 1
            : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        tabs[n].focus();
    });

    // A aba "Roleta de Classes" é criada depois: atualiza os papéis quando ela existir
    window.addEventListener('load', syncTabA11y);
}

/* ==========================================================================
   ABA "PAGUE UM CAFEZINHO" (LIVEPIX) + FOOTER AUTOMÁTICO
   ========================================================================== */
(function () {
    'use strict';

    // Se quiser deixar um link de widget fixo para todos os visitantes, coloque aqui
    const DEFAULT_WIDGET_URL = 'https://widget.livepix.gg/embed/6606ed8d-766f-449e-90f0-9c49f5a9afb9';
    // Se quiser deixar um QR Code fixo como fallback/imagem, coloque o caminho aqui (ex.: './css/img/livepix-qr.png')
    const DEFAULT_QR_SRC = '';

    const WIDGET_STORAGE_KEY = 'dbd_livepix_widget_url';
    const QR_STORAGE_KEY = 'dbd_livepix_qr_src';

    const COFFEE_CSS = `
#coffeeHandle {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  z-index: 44;
  width: 34px;
  min-height: 152px;
  padding: 10px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  background: var(--bg-surface, #12141a);
  color: var(--text-primary, #eceae4);
  border: 1px solid var(--border-subtle, rgba(255,255,255,0.12));
  border-right: none;
  border-radius: 10px 0 0 10px;
  box-shadow: -6px 0 20px rgba(0,0,0,0.45);
  transition: background 0.15s ease, border-color 0.15s ease;
}
#coffeeHandle:hover {
  background: var(--bg-elevated, #1a1d24);
  border-color: var(--accent-crimson, #b91c28);
}
#coffeeHandle .cf-icon {
  color: #f59e0b;
  font-size: 13px;
}
#coffeeHandle .cf-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: 1.1;
  max-height: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 767px) {
  #coffeeHandle {
    top: auto;
    bottom: env(safe-area-inset-bottom, 0px);
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: auto;
    max-width: calc(100vw - 24px);
    min-height: 0;
    height: 34px;
    padding: 0 14px;
    flex-direction: row;
    gap: 6px;
    border: 1px solid var(--border-subtle, rgba(255,255,255,0.14));
    border-bottom: none;
    border-radius: 10px 10px 0 0;
    box-shadow: 0 -4px 18px rgba(0,0,0,0.45);
  }
  #coffeeHandle .cf-label {
    writing-mode: horizontal-tb;
    transform: none;
    max-height: none;
    white-space: nowrap;
    font-size: 11px;
  }
  body {
    padding-bottom: calc(44px + env(safe-area-inset-bottom, 0px)) !important;
  }
}

#coffeeModal {
  position: fixed;
  inset: 0;
  z-index: 65;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(4px);
}
#coffeeModal.hidden {
  display: none;
}
.cf-card {
  width: 100%;
  max-width: 28rem;
  background: var(--bg-surface, #12141a);
  border: 1px solid var(--border-strong, rgba(255,255,255,0.18));
  border-radius: 12px;
  padding: 1.25rem;
  box-shadow: var(--shadow-pop, 0 16px 36px rgba(0,0,0,0.65));
  color: var(--text-primary, #eceae4);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.cf-widget-frame {
  width: 100%;
  aspect-ratio: 4 / 3;
  min-height: 260px;
  border-radius: 10px;
  border: 1px solid var(--border-strong, rgba(255,255,255,0.16));
  background: #ffffff;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
}
.cf-widget-frame iframe,
.cf-widget-frame img {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: contain;
}
`;

    function cfText() {
        const pt = (typeof currentLang === 'undefined' ? 'pt' : currentLang) === 'pt';
        return {
            handle: pt ? 'Gostou? Pague um cafezinho' : 'Enjoyed it? Buy me a coffee',
            modalTitle: pt
                ? 'Quer pagar um cafezinho para o Astofer?'
                : 'Want to buy Astofer a coffee?',
            modalSub: pt
                ? 'O projeto te ajudou em algo? Leia o Qrcode abaixo de deixe uma doação.'
                : 'Did this project help you? Scan the QR code below and leave a donation.',
            urlLabel: pt ? 'Link do widget LivePix' : 'LivePix widget link',
            urlPlaceholder: 'https://...',
            openBtn: pt ? 'Abrir' : 'Open',
            emptyWidget: pt
                ? 'Cole o Link do widget LivePix abaixo para exibir aqui.'
                : 'Paste the LivePix widget link below to display it here.',
            closeBtn: pt ? 'Fechar' : 'Close',
            rights: pt ? 'todos os direitos reservados' : 'all rights reserved'
        };
    }

    function getWidgetUrl() {
        try {
            return (localStorage.getItem(WIDGET_STORAGE_KEY) || DEFAULT_WIDGET_URL).trim();
        } catch (e) {
            return DEFAULT_WIDGET_URL.trim();
        }
    }

    function setWidgetUrl(val) {
        try {
            localStorage.setItem(WIDGET_STORAGE_KEY, (val || '').trim());
        } catch (e) {}
        renderCoffeeWidget();
    }

    function getQrSrc() {
        try {
            return (localStorage.getItem(QR_STORAGE_KEY) || DEFAULT_QR_SRC).trim();
        } catch (e) {
            return DEFAULT_QR_SRC.trim();
        }
    }

    function renderCoffeeWidget() {
        const frame = document.getElementById('cfWidgetIframe');
        const qrImg = document.getElementById('cfQrImg');
        const empty = document.getElementById('cfWidgetEmpty');
        const openBtn = document.getElementById('cfOpenUrlBtn');
        const url = getWidgetUrl();
        const qr = getQrSrc();
        const isValidUrl = /^https?:\/\//i.test(url);

        if (openBtn) {
            if (isValidUrl) {
                openBtn.href = url;
                openBtn.classList.remove('opacity-50', 'pointer-events-none');
            } else {
                openBtn.removeAttribute('href');
                openBtn.classList.add('opacity-50', 'pointer-events-none');
            }
        }

        if (!frame || !qrImg || !empty) return;

        if (isValidUrl) {
            frame.src = url;
            frame.classList.remove('hidden');
            qrImg.classList.add('hidden');
            empty.classList.add('hidden');
        } else if (qr) {
            frame.removeAttribute('src');
            frame.classList.add('hidden');
            qrImg.src = qr;
            qrImg.classList.remove('hidden');
            empty.classList.add('hidden');
        } else {
            frame.removeAttribute('src');
            frame.classList.add('hidden');
            qrImg.removeAttribute('src');
            qrImg.classList.add('hidden');
            empty.classList.remove('hidden');
        }
    }

    function openCoffeeModal() {
        const m = document.getElementById('coffeeModal');
        if (!m) return;
        syncCoffeeTexts();
        renderCoffeeWidget();
        m.classList.remove('hidden');
    }

    function closeCoffeeModal() {
        const m = document.getElementById('coffeeModal');
        if (m) m.classList.add('hidden');
    }

    function ensureFooter() {
        const year = new Date().getFullYear();
        const t = cfText();
        let footer = document.getElementById('siteFooter');
        if (!footer) {
            footer = document.createElement('footer');
            footer.id = 'siteFooter';
            footer.className = 'border-t border-neutral-800/80 bg-dbd-card/60 py-4 px-4 text-center text-xs text-dbd-muted';
            footer.innerHTML = `
                <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-1.5">
                    <span>© <span id="footerYear">${year}</span></span>
                    <strong class="text-white font-bold">Astofer</strong>
                    <span id="footerRights">${t.rights}</span>
                </div>`;
            const main = document.getElementById('mainContent');
            if (main && main.parentNode) {
                main.insertAdjacentElement('afterend', footer);
            } else {
                document.body.appendChild(footer);
            }
            return;
        }
        const yearEl = document.getElementById('footerYear');
        const rightsEl = document.getElementById('footerRights');
        if (yearEl) yearEl.textContent = String(year);
        if (rightsEl) rightsEl.textContent = t.rights;
    }

    function syncCoffeeTexts() {
        const t = cfText();
        const lbl = document.getElementById('cfHandleLabel');
        if (lbl) lbl.textContent = t.handle;

        const title = document.getElementById('cfModalTitle');
        const sub = document.getElementById('cfModalSub');
        const emptyTxt = document.getElementById('cfWidgetEmptyText');
        const urlLbl = document.getElementById('cfUrlLabel');
        const urlInp = document.getElementById('cfUrlInput');
        const openBtn = document.getElementById('cfOpenUrlBtn');
        const closeBtn = document.getElementById('cfCloseBtn');

        if (title) title.textContent = t.modalTitle;
        if (sub) sub.textContent = t.modalSub;
        if (emptyTxt) emptyTxt.textContent = t.emptyWidget;
        if (urlLbl) urlLbl.textContent = t.urlLabel;
        if (urlInp) urlInp.placeholder = t.urlPlaceholder;
        if (openBtn) openBtn.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> <span>${t.openBtn}</span>`;
        if (closeBtn) closeBtn.setAttribute('aria-label', t.closeBtn);

        ensureFooter();
    }

    function initCoffeeAndFooter() {
        if (!document.getElementById('coffeeStyle')) {
            const st = document.createElement('style');
            st.id = 'coffeeStyle';
            st.textContent = COFFEE_CSS;
            document.head.appendChild(st);
        }

        if (!document.getElementById('coffeeHandle')) {
            const handle = document.createElement('button');
            handle.type = 'button';
            handle.id = 'coffeeHandle';
            handle.setAttribute('aria-haspopup', 'dialog');
            handle.innerHTML = `
                <i class="fa-solid fa-mug-hot cf-icon" aria-hidden="true"></i>
                <span id="cfHandleLabel" class="cf-label"></span>
            `;
            handle.addEventListener('click', openCoffeeModal);
            document.body.appendChild(handle);
        }

        if (!document.getElementById('coffeeModal')) {
            const modal = document.createElement('div');
            modal.id = 'coffeeModal';
            modal.className = 'hidden';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'cfModalTitle');
            modal.innerHTML = `
                <div class="cf-card">
                    <div class="flex items-center justify-between border-b border-neutral-800 pb-2.5">
                        <h2 id="cfModalTitle" class="text-base font-black uppercase tracking-wider text-white flex items-center gap-2">
                            <i class="fa-solid fa-mug-hot text-amber-400"></i>
                            <span>Quer pagar um cafezinho para o Astofer?</span>
                        </h2>
                        <button type="button" id="cfCloseBtn" class="text-neutral-400 hover:text-white p-1">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <p id="cfModalSub" class="text-xs text-dbd-muted"></p>

                    <div class="cf-widget-frame">
                        <iframe id="cfWidgetIframe" title="LivePix Widget" loading="lazy" allow="payment" class="hidden"></iframe>
                        <img id="cfQrImg" alt="LivePix QR Code" class="hidden">
                        <div id="cfWidgetEmpty" class="w-full h-full flex flex-col items-center justify-center text-center text-neutral-600 px-4">
                            <i class="fa-solid fa-qrcode text-4xl mb-2"></i>
                            <div id="cfWidgetEmptyText" class="text-xs font-bold"></div>
                        </div>
                    </div>

                </div>
            `;
            document.body.appendChild(modal);

            modal.addEventListener('click', e => {
                if (e.target === modal) closeCoffeeModal();
            });
            document.getElementById('cfCloseBtn').addEventListener('click', closeCoffeeModal);

            const urlInp = document.getElementById('cfUrlInput');
            urlInp.value = getWidgetUrl();
            urlInp.addEventListener('input', () => setWidgetUrl(urlInp.value));

            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') closeCoffeeModal();
            });
        }

        if (typeof window.setLanguage === 'function' && !window._coffeeLangWrapped) {
            window._coffeeLangWrapped = true;
            const prevSetLanguage = window.setLanguage;
            window.setLanguage = function (lang) {
                prevSetLanguage(lang);
                syncCoffeeTexts();
            };
        }

        syncCoffeeTexts();
        renderCoffeeWidget();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCoffeeAndFooter);
    } else {
        initCoffeeAndFooter();
    }
})();
