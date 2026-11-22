/* ==========================================================
   thumb-assets.js — Modal "Biblioteca de Assets" do Thumbmaker
   Depende de randomizer.js (carregar DEPOIS dele).
   Abas: perks surv/killer, personagens, itens, poderes, addons, efeitos, modelos
   ========================================================== */
(function () {
    'use strict';

    // >>> TROQUE PELO SEU E-MAIL DE CONTATO <<<
    const CONTACT_EMAIL = 'astofernest@gmail.com';

    const FX_DIR = 'efeitos/';      // css/img/efeitos/
    const MODELS_DIR = 'modelos/';  // css/img/modelos/
    const MANIFEST = () => JSON_DIR + 'thumb-assets.json';
    const IMG_EXT = /\.(png|webp|jpe?g|gif|svg)$/i; // usado só para gerar o nome de exibição

    const L = {
        pt: {
            title: 'Biblioteca de Assets', open: 'Abrir Biblioteca de Assets',
            search: 'Buscar pelo nome...', hint: 'Clique em um item para adicionar ao canvas',
            added: 'adicionados nesta sessão', close: 'Fechar',
            perkSurv: 'Perks de Survivor', perkKill: 'Perks de Killer', chars: 'Personagens',
            itemSurv: 'Itens de Survivor', itemKill: 'Poderes de Killer',
            addSurv: 'Addons de Survivor', addKill: 'Addons de Killer',
            fx: 'Efeitos', models: 'Modelos',
            all: 'Todos', survs: 'Survivors', kills: 'Killers',
            none: 'Nenhum resultado.', loading: 'Carregando...',
            noImg: 'Imagem não encontrada', ok: 'adicionado!',
            noticeText: 'Os modelos e efeitos desta aba podem ter sido feitos por outras pessoas. Se você é o autor de algum deles e deseja que seja removido, entre em contato pelo e-mail',
            noticeSubject: 'Pedido de remoção - Thumbmaker',
            emptyFx: 'Nenhum efeito encontrado.', emptyModels: 'Nenhum modelo encontrado.',
            emptyHelp: 'Coloque as imagens em <code>css/img/%DIR%</code> e liste os nomes em <code>json/thumb-assets.json</code> (use o <code>editor-thumb-assets.html</code>).'
        },
        en: {
            title: 'Asset Library', open: 'Open Asset Library',
            search: 'Search by name...', hint: 'Click an item to add it to the canvas',
            added: 'added this session', close: 'Close',
            perkSurv: 'Survivor Perks', perkKill: 'Killer Perks', chars: 'Characters',
            itemSurv: 'Survivor Items', itemKill: 'Killer Powers',
            addSurv: 'Survivor Add-ons', addKill: 'Killer Add-ons',
            fx: 'Effects', models: 'Models',
            all: 'All', survs: 'Survivors', kills: 'Killers',
            none: 'No results.', loading: 'Loading...',
            noImg: 'Image not found', ok: 'added!',
            noticeText: 'The models and effects in this tab may have been made by other people. If you are the author of any of them and want it removed, please contact',
            noticeSubject: 'Removal request - Thumbmaker',
            emptyFx: 'No effects found.', emptyModels: 'No models found.',
            emptyHelp: 'Put images in <code>css/img/%DIR%</code> and list the file names in <code>json/thumb-assets.json</code> (use <code>editor-thumb-assets.html</code>).'
        }
    };
    const t = k => (L[currentLang] || L.pt)[k];

    const TABS = [
        { id: 'perkSurv', icon: 'fa-shield-halved', get: () => getPerks('survivor') },
        { id: 'perkKill', icon: 'fa-skull', get: () => getPerks('killer') },
        { id: 'chars', icon: 'fa-user', get: getChars, wide: true, subfilter: true },
        { id: 'itemSurv', icon: 'fa-toolbox', get: getSurvItems },
        { id: 'itemKill', icon: 'fa-skull-crossbones', get: getKillPowers },
        { id: 'addSurv', icon: 'fa-puzzle-piece', get: getSurvAddons },
        { id: 'addKill', icon: 'fa-puzzle-piece', get: getKillAddons },
        { id: 'fx', icon: 'fa-wand-magic-sparkles', get: () => getFolder('fx'), wide: true, async: true },
        { id: 'models', icon: 'fa-person', get: () => getFolder('models'), wide: true, async: true }
    ];

    const state = { tab: 'perkSurv', query: '', role: 'all', added: 0, built: false };
    const cache = {};          // dados de cada aba
    let current = [];          // itens renderizados (para o clique)
    let folderData = null;     // efeitos/modelos (manifest + listagem)

    // ---------- Fontes de dados ----------
    function getPerks(role) {
        const base = role === 'survivor' ? initialData.survivorPerks : initialData.killerPerks;
        const custom = (customEntries || []).filter(e => e.category === 'perk' && (e.role === 'killer') === (role === 'killer'));
        return [...(base || []), ...custom].map(p => ({
            kind: 'perk', key: 'perk:' + p.id, name: nm(p), alt: p.namePt === p.nameEn ? '' : (currentLang === 'pt' ? p.nameEn : p.namePt),
            group: p.charName && p.charName.toLowerCase() !== GENERAL_NAME ? (currentLang === 'pt' ? p.charName : (p.charNameEn || p.charName)) : (currentLang === 'pt' ? 'Perks gerais' : 'General perks'),
            cands: entryImgs(p), fa: p.icon || 'fa-shield', framed: true, ptb: !!p.ptb
        }));
    }

    function getChars() {
        const survs = (initialData.survivors || []).map(c => ({ c, role: 'surv' }));
        const kills = (initialData.killers || []).map(c => ({ c, role: 'kill' }));
        const custom = (customEntries || []).filter(e => e.category === 'character')
            .map(c => ({ c, role: c.role === 'killer' ? 'kill' : 'surv' }));
        return [...survs, ...kills, ...custom].map(({ c, role }) => ({
            kind: 'char', key: 'char:' + c.id, name: nm(c), alt: '', role,
            group: '', cands: entryImgs(c), fa: c.icon || 'fa-user', badge: role
        }));
    }

    const survTypeLabel = tipo => currentLang === 'pt' ? tipo : (ITEM_TYPE_EN[tipo] || tipo);

    function getSurvItems() {
        const out = [];
        Object.keys(itemsData.surv || {}).forEach(tipo => {
            (itemsData.surv[tipo] || []).forEach(it => out.push({
                kind: 'item', key: 'si:' + it.nome, name: itemLabel(it), alt: '',
                group: survTypeLabel(tipo),
                cands: imgPaths('itens/surv/' + fmt(it.nome) + '.png'),
                fa: ITEM_TYPE_ICON[tipo] || 'fa-toolbox'
            }));
        });
        return out;
    }

    // chave de itemsData.kill (minúscula) -> nome bonito do killer
    function killerDisplayName(key) {
        const found = (initialData.killers || []).find(k => norm(k.namePt) === norm(key));
        return found ? nm(found) : key.replace(/\b\w/g, c => c.toUpperCase());
    }

    function getKillPowers() {
        const out = [];
        Object.keys(itemsData.kill || {}).forEach(key => {
            (itemsData.kill[key] || []).forEach(p => out.push({
                kind: 'item', key: 'kp:' + key + ':' + p.nome, name: itemLabel(p), alt: '',
                group: killerDisplayName(key),
                cands: imgPaths('itens/kill/poderes/' + fmt(p.nome) + '.png'),
                fa: 'fa-skull'
            }));
        });
        return out;
    }

    function getSurvAddons() {
        const out = [], seen = new Set();
        Object.keys(itemsData.surv || {}).forEach(tipo => {
            (itemsData.surv[tipo] || []).forEach(it => {
                addonPairs(it).forEach(a => {
                    const rel = 'itens/surv/complementos/' + fmt(a.pt) + '.png';
                    if (seen.has(rel)) return;
                    seen.add(rel);
                    out.push({
                        kind: 'addon', key: 'sa:' + rel, name: currentLang === 'pt' ? a.pt : a.en, alt: '',
                        group: itemLabel(it), cands: imgPaths(rel), fa: 'fa-puzzle-piece'
                    });
                });
            });
        });
        return out;
    }

    function getKillAddons() {
        const out = [], seen = new Set();
        Object.keys(itemsData.kill || {}).forEach(key => {
            const killerName = killerDisplayName(key);
            (itemsData.kill[key] || []).forEach(p => {
                addonPairs(p).forEach(a => {
                    const rel = 'itens/kill/' + fmt(key) + '/' + fmt(a.pt) + '.png';
                    if (seen.has(rel)) return;
                    seen.add(rel);
                    out.push({
                        kind: 'addon', key: 'ka:' + rel, name: currentLang === 'pt' ? a.pt : a.en, alt: '',
                        group: killerName, cands: imgPaths(rel), fa: 'fa-puzzle-piece'
                    });
                });
            });
        });
        return out;
    }

    // ---------- Efeitos / Modelos (lista manual em json/thumb-assets.json) ----------
    // Formato: { "efeitos": ["a.png", {"file":"b.png","name":"Nome"}], "modelos": [...] }
    // Use o editor-thumb-assets.html para editar esse arquivo no seu PC.
    async function loadFolders() {
        if (folderData) return folderData;
        let manifest = {};
        try {
            const r = await fetch(MANIFEST(), { cache: 'no-cache' });
            if (r.ok) manifest = await r.json();
        } catch (e) { console.warn('thumb-assets.json não carregado:', e.message); }

        const clean = arr => (arr || [])
            .map(x => typeof x === 'string' ? { file: x } : x)
            .filter(x => x && typeof x.file === 'string' && x.file.trim());
        folderData = { fx: clean(manifest.efeitos), models: clean(manifest.modelos) };
        return folderData;
    }

    async function getFolder(which) {
        const data = await loadFolders();
        const dir = which === 'fx' ? FX_DIR : MODELS_DIR;
        return (data[which] || []).map(x => ({
            kind: which === 'fx' ? 'fx' : 'model',
            key: which + ':' + x.file,
            name: x.name || x.file.replace(IMG_EXT, '').replace(/[-_]+/g, ' '),
            alt: '', group: '',
            cands: imgPaths(dir + x.file),
            fa: which === 'fx' ? 'fa-wand-magic-sparkles' : 'fa-person'
        }));
    }

    // ---------- Modal (DOM) ----------
    function build() {
        if (state.built) return;
        const wrap = document.createElement('div');
        wrap.id = 'taOverlay';
        wrap.className = 'ta-overlay';
        wrap.innerHTML = `
          <div class="ta-modal" role="dialog" aria-modal="true" aria-labelledby="taTitle">
            <div class="ta-head">
              <span class="ta-title" id="taTitle"><i class="fa-solid fa-images" style="color:var(--accent-survivor)"></i> <span data-ta="title"></span></span>
              <label class="ta-search"><i class="fa-solid fa-magnifying-glass"></i>
                <input type="search" id="taSearch" autocomplete="off"></label>
              <button type="button" class="ta-close" id="taClose" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="ta-tabs" id="taTabs" role="tablist"></div>
            <div class="ta-sub" id="taSub"></div>
            <div class="ta-notice" id="taNotice"></div>
            <div class="ta-body" id="taBody"></div>
            <div class="ta-foot">
              <span id="taHint"></span>
              <span><b id="taAdded">0</b> <span data-ta="added"></span></span>
            </div>
          </div>`;
        document.body.appendChild(wrap);

        wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
        $('taClose').addEventListener('click', close);
        $('taSearch').addEventListener('input', e => { state.query = e.target.value; renderBody(); });
        $('taTabs').addEventListener('click', e => {
            const b = e.target.closest('[data-tab]');
            if (b) setTab(b.dataset.tab);
        });
        $('taSub').addEventListener('click', e => {
            const b = e.target.closest('[data-role]');
            if (b) { state.role = b.dataset.role; renderSub(); renderBody(); }
        });
        $('taBody').addEventListener('click', e => {
            const cell = e.target.closest('.ta-cell');
            if (cell) addEntry(current[+cell.dataset.i], cell);
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && wrap.classList.contains('is-open')) close();
        });
        state.built = true;
    }

    function applyLabels() {
        document.querySelectorAll('#taOverlay [data-ta]').forEach(el => { el.textContent = t(el.dataset.ta); });
        $('taSearch').placeholder = t('search');
        $('taHint').textContent = t('hint');
        $('taClose').title = t('close');
    }

    function renderTabs() {
        $('taTabs').innerHTML = TABS.map(tb => {
            const n = cache[tb.id] ? ` <small>${cache[tb.id].length}</small>` : '';
            return `<button type="button" role="tab" data-tab="${tb.id}" class="ta-tab ${tb.id === state.tab ? 'is-active' : ''}">
                <i class="fa-solid ${tb.icon}"></i> ${esc(t(tb.id))}${n}</button>`;
        }).join('');
    }

    function renderNotice() {
        const el = $('taNotice');
        const show = state.tab === 'fx' || state.tab === 'models';
        el.classList.toggle('is-visible', show);
        if (!show) { el.innerHTML = ''; return; }
        const subject = encodeURIComponent(t('noticeSubject'));
        el.innerHTML = `<i class="fa-solid fa-circle-info"></i><span>${esc(t('noticeText'))}
            <a href="mailto:${esc(CONTACT_EMAIL)}?subject=${subject}">${esc(CONTACT_EMAIL)}</a>.</span>`;
    }

    function renderSub() {
        renderNotice();
        const tb = TABS.find(x => x.id === state.tab);
        const el = $('taSub');
        el.classList.toggle('is-visible', !!(tb && tb.subfilter));
        if (!tb || !tb.subfilter) return;
        el.innerHTML = [['all', 'all'], ['surv', 'survs'], ['kill', 'kills']].map(([r, k]) =>
            `<button type="button" data-role="${r}" class="${state.role === r ? 'is-active' : ''}">${esc(t(k))}</button>`).join('');
    }

    async function setTab(id) {
        state.tab = id;
        renderTabs();
        renderSub();
        await renderBody(true);
    }

    async function renderBody(resetScroll) {
        const tb = TABS.find(x => x.id === state.tab);
        const body = $('taBody');
        if (!tb) return;
        const tabId = tb.id;
        if (resetScroll) body.scrollTop = 0;

        if (!cache[tabId]) {
            body.innerHTML = `<div class="ta-empty"><i class="fa-solid fa-spinner fa-spin"></i>${esc(t('loading'))}</div>`;
            try { cache[tabId] = await tb.get(); } catch (e) { cache[tabId] = []; console.warn('thumb-assets:', e); }
            renderTabs();
            if (state.tab !== tabId) return; // usuário trocou de aba enquanto carregava
        }

        const q = norm(state.query);
        let list = cache[tabId];
        if (tb.subfilter && state.role !== 'all') list = list.filter(x => x.role === state.role);
        if (q) list = list.filter(x => norm(x.name).includes(q) || norm(x.alt).includes(q) || norm(x.group).includes(q));

        if (!list.length) {
             let msg = esc(t('none')), icon = 'fa-magnifying-glass';
             if (!cache[tabId].length && (tabId === 'fx' || tabId === 'models')) {
                 icon = 'fa-folder-open';
                 msg = esc(t(tabId === 'fx' ? 'emptyFx' : 'emptyModels'));
             }
             body.innerHTML = `<div class="ta-empty"><i class="fa-solid ${icon}"></i>${msg}</div>`;
             current = [];
             return;
         }

        current = list;
        // agrupa preservando a ordem
        const groups = new Map();
        list.forEach((x, i) => {
            if (!groups.has(x.group)) groups.set(x.group, []);
            groups.get(x.group).push(i);
        });

        const cell = i => {
            const x = list[i];
            const badge = x.badge ? `<span class="ta-badge ${x.badge}">${x.badge === 'surv' ? 'SURV' : 'KILL'}</span>` : '';
            return `<button type="button" class="ta-cell" data-i="${i}" title="${esc(x.name)}">
                ${badge}
                <span class="ta-thumb ${x.framed ? 'is-perk' : ''}">${imgTag(x.cands, '', x.fa, 'ta-fa')}</span>
                <span class="ta-name">${esc(x.name)}</span>
            </button>`;
        };

        body.innerHTML = [...groups.entries()].map(([g, idxs]) =>
            (g ? `<div class="ta-group-title">${esc(g)}</div>` : '') +
            `<div class="ta-grid ${tb.wide ? 'is-wide' : ''}">${idxs.map(cell).join('')}</div>`
        ).join('');
    }

    // ---------- Adicionar ao canvas ----------
    // Testa as URLs candidatas (local -> remoto) e devolve a primeira que carrega.
    async function resolveSrc(cands) {
        for (const src of cands) {
            if (await loadThumbImageElement(src)) return src;
        }
        return '';
    }

    async function addEntry(x, cellEl) {
        if (!x) return;
        const src = await resolveSrc(x.cands);
        if (!src) { showToast(`${x.name}: ${t('noImg')}`, 'error'); return; }

        const n = thumbState.items.filter(i => i.kind === x.kind).length;
        const off = (n % 5) * 0.05;
        const base = { visible: true, rot: 0, opacity: 1, scale: 1.0, src, label: String(x.name).slice(0, 14), kind: x.kind };
        let layer;

        switch (x.kind) {
            case 'perk':
                layer = { ...base, id: uidThumb('perk'), type: 'perk', x: Math.min(0.85, 0.25 + off), y: 0.40, showFrame: true, showIcon: true, iconScale: 1.0 };
                break;
            case 'char':
                layer = { ...base, id: uidThumb('char'), type: 'char', x: Math.min(0.85, 0.35 + off * 1.6), y: 0.55 };
                break;
            case 'model': // personagem em outra pose: mesmo comportamento/tamanho de personagem
                layer = { ...base, id: uidThumb('char'), type: 'char', x: Math.min(0.85, 0.35 + off * 1.6), y: 0.55 };
                break;
            case 'item':
                layer = { ...base, id: uidThumb('img'), type: 'image', x: Math.min(0.9, 0.2 + off), y: 0.7, scale: 0.5 };
                break;
            case 'addon':
                layer = { ...base, id: uidThumb('img'), type: 'image', x: Math.min(0.9, 0.15 + off), y: 0.85, scale: 0.3 };
                break;
            default: // fx
                layer = { ...base, id: uidThumb('img'), type: 'image', x: 0.5, y: 0.5 };
        }

        thumbState.items.push(layer);
        selectThumbLayer(layer.id);
        pushThumbHistory();

        state.added++;
        $('taAdded').textContent = state.added;
        if (cellEl) {
            cellEl.classList.add('is-flash');
            setTimeout(() => cellEl.classList.remove('is-flash'), 700);
        }
    }

    // ---------- API pública ----------
    function open(tabId) {
        build();
        applyLabels();
        state.added = 0;
        $('taAdded').textContent = '0';
        $('taOverlay').classList.add('is-open');
        document.body.style.overflow = 'hidden';
        // listas dependem de idioma/cadastros: recalcula a cada abertura
        Object.keys(cache).forEach(k => { if (k !== 'fx' && k !== 'models') delete cache[k]; });
        setTab(tabId || state.tab);
        setTimeout(() => $('taSearch').focus(), 50);
    }

    function close() {
        const o = $('taOverlay');
        if (o) o.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    // Reaplica o idioma se o modal estiver aberto/construído ao trocar PT/EN
    window.refreshThumbAssetsLang = function () {
        if (!state.built) return;
        applyLabels();
        Object.keys(cache).forEach(k => { if (k !== 'fx' && k !== 'models') delete cache[k]; });
        setTab(state.tab);
    };
    window.openThumbAssets = open;
    window.closeThumbAssets = close;
    // Chame depois de adicionar arquivos às pastas sem recarregar a página
    window.reloadThumbFolders = function () { folderData = null; delete cache.fx; delete cache.models; };
})();
