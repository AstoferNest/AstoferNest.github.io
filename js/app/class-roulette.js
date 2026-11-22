/* ==========================================================================
   ROLETA DE CLASSES
   Sorteia sempre 1 perk de cada classe (4 classes por lado).
   Depende do randomizer.js (carregue este arquivo DEPOIS dele) e do campo
   "classe_rpg" nos JSON de perks (lido em buildPerks como p.classe).
   Cria sozinha a aba e o botão do menu: não precisa de HTML no index.html.
   ========================================================================== */
(function () {
    'use strict';

    // ---- Classes de cada lado (a ordem define a ordem dos 4 slots) ----
    const SLOTS = {
        survivor: [
            {
                k: 'Healer', pt: 'Healer', en: 'Healer', icon: 'fa-kit-medical',
                descPt: 'Cura, recuperação, velocidade de cura e bênçãos de cura.',
                descEn: 'Healing, recovery, healing speed, and healing boons.'
            },
            {
                k: 'Tank', pt: 'Tank', en: 'Tank', icon: 'fa-shield-halved',
                descPt: 'Sobrevivência, resistência, fuga de gancho e todos os perks ofensivos contra o killer (atordoar, cegar, lentidão, armadilhas, bloquear, sabotar).',
                descEn: 'Survivability, endurance, hook escapes, and all offensive perks against the killer (stun, blind, hinder, traps, bodyblock, sabotage).'
            },
            {
                k: 'Suporte', pt: 'Suporte', en: 'Support', icon: 'fa-handshake-angle',
                descPt: 'Auras e visão, furtividade, mobilidade, itens e baús, buffs de equipe e utilidades.',
                descEn: 'Auras and vision, stealth, mobility, items and chests, team buffs, and utility.'
            },
            {
                k: 'Objetivo', pt: 'Objetivo', en: 'Objective', icon: 'fa-bolt',
                descPt: 'Geradores, testes de perícia, totens, portões e fim de jogo ligado ao objetivo.',
                descEn: 'Generators, skill checks, totems, exit gates, and objective-focused endgame.'
            }
        ],
        killer: [
            {
                k: 'Assassino', pt: 'Assassino', en: 'Assassin', icon: 'fa-skull',
                descPt: 'Dano e burst: Exposto, mori, ataques e ganchos mais rápidos.',
                descEn: 'Damage and burst: Exposed, mori, attacks, and faster hooks.'
            },
            {
                k: 'Controlador', pt: 'Controlador', en: 'Controller', icon: 'fa-hat-wizard',
                descPt: 'Regressão e bloqueio de geradores, feitiços, anti-cura e debuffs (Exaustão, Cegueira, Quebrado).',
                descEn: 'Generator regression and blocking, hexes, anti-healing, and debuffs (Exhausted, Blindness, Broken).'
            },
            {
                k: 'Batedor', pt: 'Batedor', en: 'Scout', icon: 'fa-eye',
                descPt: 'Auras, alertas e furtividade (Indetectável, Alheio, Raio de Terror).',
                descEn: 'Auras, alerts, and stealth (Undetectable, Oblivious, Terror Radius).'
            },
            {
                k: 'Tank', pt: 'Tank', en: 'Tank', icon: 'fa-shield-halved',
                descPt: 'Celeridade, imunidade a atordoamento, cegueira e barricadas, e velocidade em perseguição.',
                descEn: 'Haste, stun/blind/pallet resistance, and chase speed.'
            }
        ]
    };
    // tank azul, cura verde, batedor laranja, suporte amarelo, assassino vermelho sangue, controlador/objetivo marrom
    const COLORS = {
        Tank: '#3b82f6', Healer: '#22c55e', Batedor: '#f97316', Suporte: '#eab308',
        Assassino: '#b3121c', Controlador: '#a8683a', Objetivo: '#a8683a'
    };
    const INK = { Suporte: '#1a1400' };   // texto escuro sobre o amarelo

    const CR_HISTORY_MAX = 10;
    let crRole = 'survivor';
    let crResult = null;
    let crSpinning = false;
    let crLocks = { char: false, perks: [false, false, false, false], item: false };

    const t = (pt, en) => (currentLang === 'pt' ? pt : en);
    const slotLabel = s => (currentLang === 'pt' ? s.pt : s.en);
    const classOf = (p, role) => {
        const v = norm(p.classe || '');
        const s = SLOTS[role].find(x => norm(x.k) === v);
        return s ? s.k : null;
    };

    // ---------- Pools ----------
    function pools(role) {
        const all = perksByRole(role).filter(p => !excludedPerks.has(p.id) && (includePtb() || !isPtb(p)));
        return SLOTS[role].map(s => all.filter(p => classOf(p, role) === s.k));
    }
    function chars(role) {
        return charsByRole(role).filter(c => !excludedCharacters.has(c.id) && (includePtb() || !isPtb(c)));
    }

    // ---------- Textos ----------
    const LABELS = {
        crNav: ['Roleta de Classes', 'Class Roulette'],
        crLblChar: ['Randomizar Personagem', 'Randomize Character'],
        crLblItems: ['Item / Poder + Addons', 'Item / Power + Add-ons'],
        crLblSound: ['Efeito Sonoro de Roleta', 'Roulette Sound Effect'],
        crLblSpin: ['GIRAR ROLETA DE CLASSES', 'SPIN CLASS ROULETTE'],
        crLblHint: ['Sempre 1 perk de cada classe:', 'Always 1 perk from each class:'],
        crLblResult: ['Resultado por Classes', 'Class Loadout Result'],
        crBtnSave: ['Salvar Build', 'Save Build'],
        crBtnImg: ['Imagem', 'Image'],
        crBtnLink: ['Compartilhar Link', 'Share Link'],
        crLblPerks: ['Vantagens (1 por classe)', 'Perks (1 per class)'],
        crLblItemTitle: ['Item / Poder', 'Item / Power'],
        crTip: ['Os filtros do Acervo de Conteúdo também valem aqui.', 'Content Pool filters also apply here.'],
        crHistTitle: ['Histórico de Sorteios', 'Roll History'],
        crHistClear: ['Limpar histórico', 'Clear history'],
        crObsTitle: ['Overlay para OBS (Modo Streamer)', 'OBS Overlay (Streamer Mode)'],
        crObsHint: ['Adicione cada link como "Fonte de Navegador" no OBS. Cada vez que a página carrega (ou você atualiza a fonte), sai uma build por classes nova. Clicar na página ou apertar R também sorteia de novo.', 'Add each link as a "Browser Source" in OBS. Every time the page loads (or you refresh the source) a new class build is rolled. Clicking the page or pressing R also rerolls.'],
        crObsLblSurv: ['Link Survivor', 'Survivor link'],
        crObsLblKill: ['Link Killer', 'Killer link'],
        crObsOptSpin: ['Animação de roleta', 'Roulette animation'],
        crObsOptNames: ['Mostrar nomes', 'Show names'],
        crObsLblScale: ['Tamanho', 'Size'],
        crObsLblLayout: ['Layout', 'Layout'],
        crObsLblAuto: ['Sortear sozinho a cada (s, 0 = não)', 'Auto-roll every (s, 0 = off)']       
    };
    function applyLabels() {
        Object.keys(LABELS).forEach(id => { const el = $(id); if (el) el.textContent = t(LABELS[id][0], LABELS[id][1]); });
    }

// ---------- HTML da aba (alinhado ao novo Design System) ----------
    const slotHtml = i => `
        <div id="crSlot${i}" class="flex flex-col items-center text-center group">
            <div id="crRing${i}" class="cr-ring my-2">
                <div id="crDiamond${i}" class="perk-diamond is-empty">
                    <div class="perk-diamond-inner" id="crInner${i}">
                        <img id="crImg${i}" src="" class="w-full h-full object-contain hidden">
                        <i id="crIcon${i}" class="fa-solid fa-shield-halved text-4xl text-purple-300"></i>
                    </div>
                </div>
            </div>
            <span id="crName${i}" class="text-xs font-bold text-neutral-300 line-clamp-2 w-36 mt-1">Slot ${i + 1}</span>
            <span id="crChip${i}" class="cr-chip"></span>
            <div class="bd-slot-actions">
                <button type="button" id="crLockPerk${i}" class="bd-lock" title="Travar" aria-label="Travar" aria-pressed="false"><i class="fa-solid fa-lock-open"></i></button>
                <button type="button" id="crRerollPerk${i}" class="bd-reroll" title="Rerrolar só este perk" aria-label="Rerrolar só este perk"><i class="fa-solid fa-dice"></i></button>
            </div>
        </div>`;

    const PANE_HTML = `
        <div class="dbd-control-bar">
            <div class="dbd-segmented">
                <button id="crRoleSurvBtn" type="button" class="dbd-seg-btn is-surv is-active">
                    <img src="./css/img/surv.png" alt=""> <span>Survivor</span>
                </button>
                <button id="crRoleKillBtn" type="button" class="dbd-seg-btn is-kill">
                    <img src="./css/img/killer.png" alt=""> <span>Killer</span>
                </button>
            </div>

            <div class="dbd-toggle-group">
                <label class="dbd-toggle">
                    <input type="checkbox" id="crChkChar" checked>
                    <span id="crLblChar">Randomizar Personagem</span>
                </label>
                <label class="dbd-toggle">
                    <input type="checkbox" id="crChkItems" checked>
                    <span id="crLblItems">Item / Poder + Addons</span>
                </label>
                <label class="dbd-toggle">
                    <input type="checkbox" id="crChkSound" checked>
                    <span id="crLblSound">Efeito Sonoro</span>
                </label>
            </div>

            <div class="flex items-center gap-3 ml-auto">
                <button id="crBtnSpin" type="button" class="dbd-spin-btn">
                    <i class="fa-solid fa-dice-five"></i> <span id="crLblSpin">GIRAR ROLETA DE CLASSES</span>
                </button>
            </div>
        </div>

        <div class="dbd-control-bar" style="padding:0.65rem 1rem">
            <span class="dbd-section-label" id="crLblHint">Sempre 1 perk de cada classe:</span>
            <div id="crLegend" class="cr-legend"></div>
        </div>

        <div class="dbd-stage">
            <div class="dbd-stage-head">
                <h2 class="text-base font-bold text-white uppercase tracking-wider" id="crLblResult">Resultado por Classes</h2>
                <div class="flex flex-wrap items-center gap-2">
                    <button type="button" id="crSave" class="dbd-action-btn">
                        <i class="fa-solid fa-floppy-disk"></i> <span id="crBtnSave">Salvar Build</span>
                    </button>
                    <button type="button" id="crImage" class="dbd-action-btn">
                        <i class="fa-solid fa-image"></i> <span id="crBtnImg">Imagem</span>
                    </button>
                    <button type="button" id="crLink" class="dbd-action-btn is-primary">
                        <i class="fa-solid fa-link"></i> <span id="crBtnLink">Compartilhar Link</span>
                    </button>
                </div>
            </div>

            <div class="dbd-stage-body">
                <div class="dbd-char-col space-y-4">
                    <div id="crCharFrame" class="char-card w-52 relative flex items-center justify-center text-dbd-cyan">
                        <img id="crCharImg" src="" alt="Character" class="w-full h-full object-contain hidden">
                        <i id="crCharIcon" class="fa-solid fa-user-ninja text-8xl text-neutral-600"></i>
                    </div>
                    <div>
                        <h3 id="crCharName" class="text-2xl font-bold text-white uppercase tracking-wide">--</h3>
                        <span id="crCharRole" class="text-xs text-dbd-cyan font-bold uppercase tracking-widest block mt-0.5">Survivor</span>
                        <div class="bd-slot-actions">
                            <button type="button" id="crLockChar" class="bd-lock" title="Travar" aria-label="Travar" aria-pressed="false"><i class="fa-solid fa-lock-open"></i></button>
                            <button type="button" id="crRerollChar" class="bd-reroll" title="Rerrolar só o personagem" aria-label="Rerrolar só o personagem"><i class="fa-solid fa-dice"></i></button>
                        </div>
                    </div>
                </div>

                <div class="dbd-loadout-col">
                    <div class="dbd-perks-zone">
                        <label class="dbd-section-label mb-3 block text-center md:text-left" id="crLblPerks">Vantagens (1 por classe)</label>
                        <div class="grid grid-cols-2 xl:grid-cols-4 gap-4 items-start justify-items-center">
                            ${[0, 1, 2, 3].map(slotHtml).join('')}
                        </div>
                    </div>

                    <div class="dbd-items-zone">
                        <div class="flex items-center gap-4">
                            <div id="crItemBox" class="w-20 h-20 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-dbd-cyan overflow-hidden p-1.5 shrink-0">
                                <img id="crItemImg" src="" class="w-full h-full object-contain hidden">
                                <i id="crItemIcon" class="fa-solid fa-toolbox text-3xl"></i>
                            </div>
                            <div>
                                <div class="dbd-section-label" id="crLblItemTitle">Item / Poder</div>
                                <div id="crItemName" class="text-sm font-bold text-white mt-0.5">Nenhum</div>
                                <div class="bd-slot-actions">
                                    <button type="button" id="crLockItem" class="bd-lock" title="Travar" aria-label="Travar" aria-pressed="false"><i class="fa-solid fa-lock-open"></i></button>
                                    <button type="button" id="crRerollItem" class="bd-reroll" title="Rerrolar só o item" aria-label="Rerrolar só o item"><i class="fa-solid fa-dice"></i></button>
                                </div>
                            </div>
                        </div>
                        <div class="flex items-start gap-4">
                            <div class="flex flex-col items-center w-24 text-center gap-1.5">
                                <div id="crAddon1" class="w-16 h-16 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 p-1.5" title="Add-on 1">
                                    <img id="crAddonImg1" src="" class="w-full h-full object-contain hidden">
                                    <i class="fa-solid fa-puzzle-piece text-lg"></i>
                                </div>
                                <span id="crAddonName1" class="text-[11px] font-semibold text-neutral-400 line-clamp-2">Add-on 1</span>
                                <button type="button" id="crRerollAddon1" class="bd-reroll bd-reroll-sm" title="Rerrolar só este add-on" aria-label="Rerrolar só este add-on"><i class="fa-solid fa-dice"></i></button>
                            </div>
                            <div class="flex flex-col items-center w-24 text-center gap-1.5">
                                <div id="crAddon2" class="w-16 h-16 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 p-1.5" title="Add-on 2">
                                    <img id="crAddonImg2" src="" class="w-full h-full object-contain hidden">
                                    <i class="fa-solid fa-puzzle-piece text-lg"></i>
                                </div>
                                <span id="crAddonName2" class="text-[11px] font-semibold text-neutral-400 line-clamp-2">Add-on 2</span>
                                <button type="button" id="crRerollAddon2" class="bd-reroll bd-reroll-sm" title="Rerrolar só este add-on" aria-label="Rerrolar só este add-on"><i class="fa-solid fa-dice"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="dbd-stage-foot">
                <span id="crTip">Os filtros do Acervo de Conteúdo também valem aqui.</span>
            </div>
        </div>

        <!-- HISTÓRICO -->
        <div class="bg-dbd-card p-5 rounded-xl border border-neutral-800 space-y-3 shadow-xl">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap">
                <h3 class="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <i class="fa-solid fa-clock-rotate-left text-dbd-cyan"></i> <span id="crHistTitle">Histórico de Sorteios</span>
                    <span id="crHistoryCount" class="bd-badge surv">0</span>
                </h3>
                <button type="button" id="crHistClearBtn" class="bd-btn bd-btn-sm bd-btn-danger">
                    <i class="fa-solid fa-trash"></i> <span id="crHistClear">Limpar histórico</span>
                </button>
            </div>
            <div id="crHistoryList" class="bd-hist-list"></div>
        </div>

        <!-- OVERLAY OBS (MODO STREAMER) -->
        <details class="bd-details">
            <summary><i class="fa-solid fa-tv" style="color:var(--accent-purple)"></i> <span id="crObsTitle">Overlay para OBS (Modo Streamer)</span></summary>
            <p class="bd-hint" id="crObsHint" style="margin-bottom:.9rem"></p>
            <div class="bd-form-grid">
                <div class="bd-span-2">
                    <label class="bd-label" for="crObsLinkSurv" id="crObsLblSurv">Link Survivor</label>
                    <div class="bd-url-row">
                        <input type="text" id="crObsLinkSurv" class="bd-field" readonly onclick="this.select()">
                        <button type="button" id="crObsCopySurv" class="bd-btn" title="Copiar"><i class="fa-solid fa-copy"></i></button>
                        <a class="bd-btn" id="crObsOpenSurv" target="_blank" rel="noopener" title="Abrir"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                    </div>
                </div>
                <div class="bd-span-2">
                    <label class="bd-label" for="crObsLinkKill" id="crObsLblKill">Link Killer</label>
                    <div class="bd-url-row">
                        <input type="text" id="crObsLinkKill" class="bd-field" readonly onclick="this.select()">
                        <button type="button" id="crObsCopyKill" class="bd-btn" title="Copiar"><i class="fa-solid fa-copy"></i></button>
                        <a class="bd-btn" id="crObsOpenKill" target="_blank" rel="noopener" title="Abrir"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                    </div>
                </div>
            </div>
            <div class="bd-opts">
                <label class="bd-check"><input type="checkbox" id="crObsSpin" checked> <span id="crObsOptSpin">Animação de roleta</span></label>
                <label class="bd-check"><input type="checkbox" id="crObsNames" checked> <span id="crObsOptNames">Mostrar nomes</span></label>
                <div>
                    <label class="bd-label" for="crObsScale" id="crObsLblScale">Tamanho</label>
                    <select id="crObsScale" class="bd-field">
                        <option value="0.75">75%</option><option value="1" selected>100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option>
                    </select>
                </div>
                <div>
                    <label class="bd-label" for="crObsLayout" id="crObsLblLayout">Layout</label>
                    <select id="crObsLayout" class="bd-field">
                        <option value="h" selected>Horizontal</option><option value="v">Vertical</option>
                    </select>
                </div>
                <div>
                    <label class="bd-label" for="crObsAuto" id="crObsLblAuto">Sortear sozinho a cada (s, 0 = não)</label>
                    <input type="number" id="crObsAuto" class="bd-field" min="0" max="3600" value="0" style="width:7rem">
                </div>
            </div>
        </details>`;
    

    // ---------- Legenda (chips das 4 classes + quantos perks elegíveis) ----------
    function renderLegend() {
        const box = $('crLegend');
        if (!box) return;
        const p = pools(crRole);
        box.innerHTML = SLOTS[crRole].map((s, i) => `
            <span class="cr-chip" data-cr-tip="${crRole}:${s.k}" style="--cc:${COLORS[s.k]};color:${INK[s.k] || '#fff'}">
                <i class="fa-solid ${s.icon}"></i> ${esc(slotLabel(s))} <small>${p[i].length}</small>
            </span>`).join('');
    }

    // ---------- Desenho do resultado (res = null mostra os slots vazios) ----------
    function render(res, spinning, parts) {
        const slots = SLOTS[crRole];
        const item = (res && res.item) || EMPTY_ITEM;

        // personagem
        const ch = res && res.character;
        const frame = $('crCharFrame');
        $('crCharName').textContent = ch ? nm(ch) : '--';
        $('crCharRole').textContent = crRole.toUpperCase();
        setImg($('crCharImg'), ch ? entryImgs(ch) : [], (ch && ch.icon) || 'fa-user-ninja', 'text-8xl text-neutral-600');
        frame.classList.toggle('spinning-reel', !!(spinning && parts && parts.char));
        frame.classList.toggle('is-ptb', !!ch && isPtb(ch));

        // perks (borda na cor da classe)
        slots.forEach((s, i) => {
            const ring = $('crRing' + i), chip = $('crChip' + i), dia = $('crDiamond' + i);
            const inner = $('crInner' + i), name = $('crName' + i);
            const p = res && res.perks[i];
            ring.style.setProperty('--cc', COLORS[s.k]);
            chip.style.setProperty('--cc', COLORS[s.k]);
            chip.dataset.crTip = `${crRole}:${s.k}`;
            chip.style.color = INK[s.k] || '#fff';
            chip.innerHTML = `<i class="fa-solid ${s.icon}"></i> ${esc(slotLabel(s))}`;
            if (p) {
                setImg($('crImg' + i), entryImgs(p), p.icon || 'fa-shield-halved', 'text-4xl text-purple-200');
                dia.classList.remove('is-empty');
                name.textContent = nm(p);
                ring.dataset.perk = p.id;
                inner.classList.toggle('spinning-reel', !!(spinning && parts && parts.perks[i]));
            } else {
                setImg($('crImg' + i), [], s.icon, 'text-4xl text-purple-300');
                dia.classList.add('is-empty');
                name.textContent = slotLabel(s);
                ring.removeAttribute('data-perk');
                inner.classList.remove('spinning-reel');
            }
        });

        // item / poder + addons
        $('crItemBox').classList.toggle('spinning-reel', !!(spinning && parts && parts.items));
        $('crItemName').textContent = res ? nm(item) : t('Nenhum', 'None');
        setImg($('crItemImg'), res ? entryImgs(item) : [], item.icon || 'fa-toolbox', 'text-4xl text-dbd-cyan');
        [1, 2].forEach(n => {
            const a = (item.addons || [])[n - 1];
            const box = $('crAddon' + n), nameEl = $('crAddonName' + n);
            nameEl.textContent = a ? nm(a) : 'Add-on ' + n;
            box.title = a ? nm(a) : 'Add-on ' + n;
            setImg($('crAddonImg' + n), a ? entryImgs(a) : [], 'fa-puzzle-piece', 'text-xl text-neutral-400');
        });

        updateLocks();
    }

    // ---------- Travas ----------
    function resetLocks() {
        crLocks = { char: false, perks: [false, false, false, false], item: false };
        updateLocks();
    }
    function updateLocks() {
        setLockBtn('crLockChar', crLocks.char);
        const f = $('crCharFrame');
        if (f) f.classList.toggle('bd-char-locked', crLocks.char);
        [0, 1, 2, 3].forEach(i => {
            setLockBtn('crLockPerk' + i, crLocks.perks[i]);
            const box = $('crSlot' + i);
            if (box) box.classList.toggle('bd-slot-locked', crLocks.perks[i]);
        });
        setLockBtn('crLockItem', crLocks.item);
        const li = $('crLockItem');
        if (li) li.style.display = crRole === 'killer' ? 'none' : '';
        updateCrReroll();
    }

    // ---------- Rerrolar só um elemento ----------
    function updateCrReroll() {
        const set = (id, disabled, label) => {
            const b = $(id);
            if (!b) return;
            b.disabled = !!disabled;
            const tx = disabled ? t('Destrave para rerrolar', 'Unlock to reroll') : label;
            b.title = tx;
            b.setAttribute('aria-label', tx);
        };
        const killer = crRole === 'killer';
        set('crRerollChar', crLocks.char, killer
            ? t('Rerrolar só o personagem (o poder muda junto)', 'Reroll only the character (the power changes too)')
            : t('Rerrolar só o personagem', 'Reroll only the character'));
        [0, 1, 2, 3].forEach(i => set('crRerollPerk' + i, crLocks.perks[i], t('Rerrolar só este perk', 'Reroll only this perk')));
        set('crRerollItem', crLocks.item, killer
            ? t('Rerrolar os add-ons do poder', 'Reroll the power add-ons')
            : t('Rerrolar só o item (e add-ons)', 'Reroll only the item (and add-ons)'));
        [1, 2].forEach(n => set('crRerollAddon' + n, crLocks.item, t('Rerrolar só este add-on', 'Reroll only this add-on')));
    }

    function crRerollOne(kind, idx) {
        if (crSpinning) return;
        const cur = crResult;
        if (!cur || cur.role !== crRole) {
            showToast(t('Gire a roleta antes de rerrolar!', 'Spin the roulette before rerolling!'), 'error');
            return;
        }
        const role = crRole;
        const locked = (kind === 'char' && crLocks.char)
            || (kind === 'perk' && crLocks.perks[idx])
            || ((kind === 'item' || kind === 'addon') && crLocks.item);
        if (locked) {
            showToast(t('Esse slot está travado. Destrave para rerrolar.', 'This slot is locked. Unlock it to reroll.'), 'error');
            return;
        }

        const parts = { char: false, perks: [false, false, false, false], items: false };
        let candidate;

        if (kind === 'char') {
            const pool = chars(role).filter(c => !cur.character || c.id !== cur.character.id);
            if (!pool.length) {
                showToast(t('Não há outro personagem ativo no acervo.', 'No other active character in the pool.'), 'error');
                return;
            }
            parts.char = true;
            parts.items = role === 'killer';
            candidate = () => {
                const character = pick(pool);
                return {
                    ...cur,
                    character,
                    item: role === 'killer' ? (rollItem(role, character) || { ...EMPTY_ITEM }) : cur.item
                };
            };
        } else if (kind === 'perk') {
            const mine = cur.perks[idx] && cur.perks[idx].id;
            const pool = pools(role)[idx].filter(p => p.id !== mine);
            if (!pool.length) {
                showToast(t(`Não há outro perk ativo da classe ${slotLabel(SLOTS[role][idx])}.`, `No other active ${slotLabel(SLOTS[role][idx])} perk.`), 'error');
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

        crSpinning = true;
        animateReroll(
            candidate,
            tmp => { crResult = tmp; render(tmp, true, parts); },
            final => {
                crSpinning = false;
                if (!final) return;
                crResult = { ...final, date: new Date().toLocaleDateString() };
                render(crResult, false, parts);
                addCrHistory(crResult);
                announceBuild(crResult);
                beep(880);
                showToast(t('Rerrolado!', 'Rerolled!'), 'success');
            },
            beep,
            () => crRole === role
        );
    }
    function toggleLock(kind, idx) {
        if (!crResult || crResult.role !== crRole) {
            showToast(t('Gire a roleta antes de travar!', 'Spin the roulette before locking!'), 'error');
            return;
        }
        if (kind === 'char') crLocks.char = !crLocks.char;
        else if (kind === 'perk') crLocks.perks[idx] = !crLocks.perks[idx];
        else crLocks.item = !crLocks.item;
        updateLocks();
    }


// ---------- Lado ----------
    function setCrRole(role) {
        if (crSpinning || role === crRole) return;
        crRole = role;
        crResult = null;
        resetLocks();
        $('crRoleSurvBtn').className = role === 'survivor'
            ? "dbd-seg-btn is-surv is-active"
            : "dbd-seg-btn is-surv";
        $('crRoleKillBtn').className = role === 'killer'
            ? "dbd-seg-btn is-kill is-active"
            : "dbd-seg-btn is-kill";
        render(null);
        renderLegend();
    }

    // ---------- Som ----------
    function beep(freq) {
        if (!$('crChkSound').checked) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.04, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.04);
        } catch (e) {}
    }

    // ---------- Sorteio: 1 perk de cada classe ----------
    function spin() {
        if (crSpinning) return;
        const role = crRole;
        const slots = SLOTS[role];

        const prev = (crResult && crResult.role === role) ? crResult : null;
        if (!prev) resetLocks();

        const chkChar = $('crChkChar').checked, chkItems = $('crChkItems').checked;
        const rollChar = chkChar && !crLocks.char;
        const rollSlots = slots.map((s, i) => !(crLocks.perks[i] && prev && prev.perks[i]));
        const rollItemFlag = (chkItems && !crLocks.item) || (role === 'killer' && rollChar);

        if (!rollChar && !rollSlots.some(Boolean) && !rollItemFlag) {
            showToast(t('Tudo está travado!', 'Everything is locked!'), 'error');
            return;
        }

        // perks sem classe no JSON?
        if (!perksByRole(role).some(p => classOf(p, role))) {
            showToast(t('Os JSON de perks ainda não têm o campo "classe_rpg".', 'The perk JSON files have no "classe_rpg" field yet.'), 'error');
            return;
        }
        const pl = pools(role);
        const empty = slots.findIndex((s, i) => rollSlots[i] && !pl[i].length);
        if (empty >= 0) {
            showToast(t(`Nenhum perk ativo da classe ${slotLabel(slots[empty])} no acervo!`, `No active ${slotLabel(slots[empty])} perk in the pool!`), 'error');
            return;
        }

        const cl = chars(role);
        let fixedChar = null;
        if (rollChar) {
            if (!cl.length) { showToast(t('Selecione ao menos 1 personagem ativo no acervo!', 'Enable at least 1 character in the pool!'), 'error'); return; }
        } else {
            fixedChar = prev ? prev.character : null;
            if (!fixedChar) {
                if (!cl.length) { showToast(t('Selecione ao menos 1 personagem ativo no acervo!', 'Enable at least 1 character in the pool!'), 'error'); return; }
                fixedChar = pick(cl);
            }
        }

        const keepItem = (!rollItemFlag && prev) ? prev.item : null;
        const parts = { char: rollChar, perks: rollSlots, items: rollItemFlag };

        crSpinning = true;
        const btn = $('crBtnSpin');
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');

        let steps = 22, speed = 50;
        (function step() {
            beep(300 + (22 - steps) * 15);

            const character = rollChar ? pick(cl) : fixedChar;
            const perks = slots.map((s, i) => rollSlots[i] ? pick(pl[i]) : prev.perks[i]);
            const item = keepItem || rollItem(role, character) || EMPTY_ITEM;

            crResult = { role, character, perks, item, classes: slots.map(s => s.k), date: new Date().toLocaleDateString() };
            render(crResult, true, parts);

            steps--;
            if (steps > 0) {
                speed += 14;
                setTimeout(step, speed);
            } else {
                crSpinning = false;
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                render(crResult, false, parts);
                addCrHistory(crResult);
                announceBuild(crResult);
                beep(880);               
                beep(880);
                showToast(t('Novo Loadout por classes gerado!', 'New class loadout generated!'), 'success');
            }
        })();
    }

    // ---------- Botões do resultado ----------
    function saveBuild() {
        if (!crResult) { showToast(t('Gire a roleta primeiro!', 'Spin the roulette first!'), 'error'); return; }
        savedBuilds.unshift({ id: Date.now(), ...crResult });
        persistSavedBuilds();
        renderSavedBuilds();
        showToast(t('Build salva com sucesso!', 'Build saved!'), 'success');
    }
    async function shareImage() {
        if (!crResult) { showToast(t('Gire a roleta antes de gerar a imagem!', 'Spin the roulette first!'), 'error'); return; }
        const backup = currentRollResult;
        currentRollResult = crResult;       // shareBuildImage lê currentRollResult
        try { await shareBuildImage(); } finally { currentRollResult = backup; }
    }
    function shareLink() {
        if (!crResult) { showToast(t('Gire a roleta antes de compartilhar!', 'Spin the roulette before sharing!'), 'error'); return; }
        if (typeof window.copyBuildLink === 'function') window.copyBuildLink(crResult);
    }

// ---------- Tooltip das classes (mesma caixinha de .perk-tip) ----------
    function initClassTooltip() {
        if ($('crClassTip')) return;
        const tip = document.createElement('div');
        tip.id = 'crClassTip';
        tip.className = 'perk-tip cr-tip';
        document.body.appendChild(tip);
        let cur = null;

        function show(el) {
            const [role, key] = (el.dataset.crTip || '').split(':');
            const slot = (SLOTS[role] || []).find(s => s.k === key);
            if (!slot) return hide();

            const pt = currentLang === 'pt';
            const roleLabel = role === 'survivor' ? 'Survivor' : 'Killer';
            const desc = pt ? slot.descPt : slot.descEn;

            tip.style.setProperty('--cc', COLORS[slot.k] || '#888');
            tip.innerHTML = `
                <div class="perk-tip-head">
                    <div class="perk-tip-name"><i class="fa-solid ${slot.icon}"></i> ${esc(slotLabel(slot))}</div>
                    <div class="perk-tip-sub">
                        <span>${pt ? 'Classe RPG' : 'RPG Class'}</span>
                        <span>${roleLabel}</span>
                    </div>
                </div>
                <div class="perk-tip-body"><p>${esc(desc)}</p></div>`;
            tip.classList.add('show');
            cur = el;
        }

        function hide() {
            tip.classList.remove('show');
            cur = null;
        }

        function place(e) {
            const pad = 16, w = tip.offsetWidth, h = tip.offsetHeight;
            let x = e.clientX + pad, y = e.clientY + pad;
            if (x + w > innerWidth - 8) x = e.clientX - w - pad;
            if (y + h > innerHeight - 8) y = innerHeight - h - 8;
            tip.style.left = Math.max(8, x) + 'px';
            tip.style.top = Math.max(8, y) + 'px';
        }

        document.addEventListener('mouseover', e => {
            const el = e.target.closest && e.target.closest('[data-cr-tip]');
            if (!el) return;
            if (el !== cur) show(el);
            place(e);
        });
        document.addEventListener('mouseout', e => {
            if (cur && !cur.contains(e.relatedTarget)) hide();
        });
        document.addEventListener('mousemove', e => {
            if (!cur) return;
            if (!cur.isConnected) return hide();
            place(e);
        });
        document.addEventListener('scroll', hide, true);
    }   


// ---------- Histórico da Roleta de Classes ----------
    const CR_HIST_KEY = 'dbd_class_history';
    let crHistory = [];
    try { crHistory = JSON.parse(localStorage.getItem(CR_HIST_KEY) || '[]'); } catch (e) { crHistory = []; }

    function addCrHistory(result) {
        crHistory.unshift({
            id: Date.now(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            role: result.role,
            character: result.character,
            perks: result.perks,
            item: result.item,
            classes: result.classes,
            date: result.date
        });
        crHistory = crHistory.slice(0, CR_HISTORY_MAX);
        try { localStorage.setItem(CR_HIST_KEY, JSON.stringify(crHistory)); } catch (e) {}
        renderCrHistory();
    }

    function renderCrHistory() {
        const box = $('crHistoryList');
        if (!box) return;
        $('crHistoryCount').textContent = crHistory.length;
        if (!crHistory.length) {
            box.innerHTML = `<div class="bd-hint">${t('Nenhum sorteio ainda. Gire a roleta!', 'No rolls yet. Spin the roulette!')}</div>`;
            return;
        }
        box.innerHTML = crHistory.map((h, i) => {
            const perks = h.perks.map(p => `
                <div class="perk-diamond perk-diamond-xs" data-perk="${esc(p.id)}">
                    <div class="perk-diamond-inner">${imgTag(entryImgs(p), 'w-full h-full object-contain', p.icon || 'fa-shield-halved', 'text-purple-200 text-xs')}</div>
                </div>`).join('');
            const it = h.item || EMPTY_ITEM;
            return `
            <button type="button" class="bd-hist" data-cr-hist="${i}" title="${t('Voltar para esta build', 'Restore this build')}">
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

    function clearCrHistory() {
        crHistory = [];
        try { localStorage.removeItem(CR_HIST_KEY); } catch (e) {}
        renderCrHistory();
        showToast(t('Histórico limpo!', 'History cleared!'), 'info');
    }

    // ---------- Links do Overlay para OBS ----------
    function crObsUrl(role) {
        const q = new URLSearchParams();
        q.set('role', role);
        q.set('mode', 'classes');
        if (!$('crObsSpin').checked) q.set('spin', '0');
        if (!$('crObsNames').checked) q.set('names', '0');
        const scale = $('crObsScale').value;
        if (scale && scale !== '1') q.set('scale', scale);
        if ($('crObsLayout').value === 'v') q.set('layout', 'v');
        const auto = parseInt($('crObsAuto').value, 10);
        if (auto > 0) q.set('auto', auto);
        return new URL('overlay.html', location.href).href.split('#')[0] + '?' + q.toString();
    }

    function updateCrObsLinks() {
        if (!$('crObsLinkSurv')) return;
        const s = crObsUrl('survivor'), k = crObsUrl('killer');
        $('crObsLinkSurv').value = s;
        $('crObsLinkKill').value = k;
        $('crObsOpenSurv').href = s;
        $('crObsOpenKill').href = k;
    }

    async function copyCrObsLink(which) {
        const text = $(which === 'surv' ? 'crObsLinkSurv' : 'crObsLinkKill').value;
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
        }
        showToast(t('Link do overlay copiado!', 'Overlay link copied!'), 'success');
    }   

    // ---------- Montagem ----------
    function init() {
        if ($('tabClasses') || !$('tabMain') || !$('tabMainBtn')) return;

        if (!TABS.includes('classes')) TABS.push('classes');

        const pane = document.createElement('div');
        pane.id = 'tabClasses';
        pane.className = 'hidden space-y-4';
        pane.innerHTML = PANE_HTML;
        $('tabMain').after(pane);

        const btn = document.createElement('button');
        btn.id = 'tabClassesBtn';
        btn.className = TAB_BTN_OFF;
        btn.setAttribute('onclick', "switchTab('classes')");
        btn.innerHTML = '<i class="fa-solid fa-layer-group"></i> <span id="crNav">Roleta de Classes</span>';
        $('tabMainBtn').after(btn);

        $('crRoleSurvBtn').addEventListener('click', () => setCrRole('survivor'));
        $('crRoleKillBtn').addEventListener('click', () => setCrRole('killer'));
        $('crBtnSpin').addEventListener('click', spin);
        $('crSave').addEventListener('click', saveBuild);
        $('crImage').addEventListener('click', shareImage);
        $('crLink').addEventListener('click', shareLink);
        $('crLockChar').addEventListener('click', () => toggleLock('char'));
        $('crLockItem').addEventListener('click', () => toggleLock('item'));
        [0, 1, 2, 3].forEach(i => $('crLockPerk' + i).addEventListener('click', () => toggleLock('perk', i)));
        $('crRerollChar').addEventListener('click', () => crRerollOne('char'));
        $('crRerollItem').addEventListener('click', () => crRerollOne('item'));
        [0, 1, 2, 3].forEach(i => $('crRerollPerk' + i).addEventListener('click', () => crRerollOne('perk', i)));
        [1, 2].forEach(n => $('crRerollAddon' + n).addEventListener('click', () => crRerollOne('addon', n)));

        // atalhos de teclado desta aba (o roteador fica no randomizer.js)
        window.crKeysApi = {
            spin,
            lock: (kind, i) => {
                if (kind === 'item' && crRole === 'killer') return;
                toggleLock(kind, i);
            },
            reroll: crRerollOne,
            save: saveBuild,
            role: () => { if (!crSpinning) setCrRole(crRole === 'survivor' ? 'killer' : 'survivor'); }
        };
         $('crHistClearBtn').addEventListener('click', clearCrHistory);
        $('crHistoryList').addEventListener('click', e => {
            const b = e.target.closest('[data-cr-hist]');
            if (!b) return;
            const h = crHistory[parseInt(b.dataset.crHist, 10)];
            if (!h) return;
            if (h.role !== crRole) setCrRole(h.role);
            crResult = h;
            render(crResult);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        $('crObsCopySurv').addEventListener('click', () => copyCrObsLink('surv'));
        $('crObsCopyKill').addEventListener('click', () => copyCrObsLink('kill'));
        ['crObsSpin', 'crObsNames', 'crObsScale', 'crObsLayout', 'crObsAuto'].forEach(id => {
            $(id).addEventListener('change', updateCrObsLinks);
        });       

        // idioma e abertura da aba
        const origLang = window.setLanguage;
        window.setLanguage = function (l) {
            origLang(l);
            applyLabels();
            render(crResult);
            renderLegend();
        };
        const origTab = window.switchTab;
        window.switchTab = function (tab) {
            origTab(tab);
            if (tab === 'classes') renderLegend();
        };

        applyLabels();
        render(null);
        renderLegend();
        renderCrHistory();
        updateCrObsLinks();
        initClassTooltip();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
