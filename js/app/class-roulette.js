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
        crTip: ['Os filtros do Acervo de Conteúdo também valem aqui.', 'Content Pool filters also apply here.']
    };
    function applyLabels() {
        Object.keys(LABELS).forEach(id => { const el = $(id); if (el) el.textContent = t(LABELS[id][0], LABELS[id][1]); });
    }

    // ---------- HTML da aba (mesmo desenho da Roleta principal) ----------
    const slotHtml = i => `
        <div id="crSlot${i}" class="flex flex-col items-center text-center group">
            <div id="crRing${i}" class="cr-ring my-4">
                <div id="crDiamond${i}" class="perk-diamond is-empty">
                    <div class="perk-diamond-inner" id="crInner${i}">
                        <img id="crImg${i}" src="" class="w-full h-full object-contain hidden">
                        <i id="crIcon${i}" class="fa-solid fa-shield-halved text-4xl text-purple-300"></i>
                    </div>
                </div>
            </div>
            <span id="crName${i}" class="text-sm font-bold text-neutral-300 line-clamp-2 w-36">Slot ${i + 1}</span>
            <span id="crChip${i}" class="cr-chip"></span>
            <button type="button" id="crLockPerk${i}" class="bd-lock" title="Travar" aria-label="Travar" aria-pressed="false"><i class="fa-solid fa-lock-open"></i></button>
        </div>`;

    const PANE_HTML = `
        <div class="bg-dbd-card px-4 py-3 rounded-xl border border-neutral-800 shadow-xl flex flex-wrap items-center gap-x-4 gap-y-3">
            <div class="flex items-center gap-2">
                <button id="crRoleSurvBtn" type="button" class="px-4 py-2 rounded-lg border-2 border-dbd-cyan bg-dbd-cyan/10 text-dbd-cyan text-xs font-bold flex items-center justify-center gap-2 transition hover:bg-dbd-cyan/20">
                    <img src="./css/img/surv.png" style="width:35px"> <span>Survivor</span>
                </button>
                <button id="crRoleKillBtn" type="button" class="px-4 py-2 rounded-lg border-2 border-neutral-800 text-neutral-400 text-xs font-bold flex items-center justify-center gap-2 transition hover:border-dbd-red hover:text-dbd-red">
                    <img src="./css/img/killer.png" style="width:35px"> <span>Killer</span>
                </button>
            </div>
            <div class="hidden md:block w-px h-8 bg-neutral-800"></div>
            <div class="flex flex-wrap items-center gap-2">
                <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer hover:text-white bg-neutral-900/80 px-3 py-2 rounded-lg border border-neutral-800">
                    <input type="checkbox" id="crChkChar" checked class="w-4 h-4 accent-dbd-red rounded">
                    <i class="fa-solid fa-user-gear text-dbd-muted"></i> <span id="crLblChar">Randomizar Personagem</span>
                </label>
                <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer hover:text-white bg-neutral-900/80 px-3 py-2 rounded-lg border border-neutral-800">
                    <input type="checkbox" id="crChkItems" checked class="w-4 h-4 accent-dbd-red rounded">
                    <i class="fa-solid fa-box-open text-dbd-muted"></i> <span id="crLblItems">Item / Poder + Addons</span>
                </label>
                <label class="flex items-center gap-2 text-xs font-semibold cursor-pointer hover:text-white bg-neutral-900/50 px-3 py-2 rounded-lg border border-neutral-800">
                    <input type="checkbox" id="crChkSound" checked class="w-4 h-4 accent-dbd-red rounded">
                    <i class="fa-solid fa-volume-high text-dbd-muted"></i> <span id="crLblSound">Efeito Sonoro de Roleta</span>
                </label>
            </div>
            <div class="flex items-center gap-4 ml-auto">
                <button id="crBtnSpin" type="button" class="px-7 py-3 bg-dbd-red hover:bg-dbd-redHover text-white font-black text-sm uppercase tracking-widest rounded-xl shadow-lg shadow-dbd-red/40 glow-pulse transition flex items-center justify-center gap-2">
                    <i class="fa-solid fa-dice-five text-lg"></i> <span id="crLblSpin">GIRAR ROLETA DE CLASSES</span>
                </button>
            </div>
        </div>

        <div class="bg-dbd-card px-4 py-3 rounded-xl border border-neutral-800 shadow-xl flex flex-wrap items-center gap-3">
            <span class="text-[10px] font-bold uppercase text-dbd-muted flex items-center gap-2">
                <i class="fa-solid fa-layer-group text-dbd-cyan"></i> <span id="crLblHint">Sempre 1 perk de cada classe:</span>
            </span>
            <div id="crLegend" class="cr-legend"></div>
        </div>

        <div class="bg-dbd-card p-6 md:p-8 rounded-xl border border-neutral-800 flex flex-col justify-between fog-overlay shadow-2xl min-h-[640px]">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
                <h2 class="text-sm font-black text-white uppercase tracking-wider" id="crLblResult">Resultado por Classes</h2>
                <div class="flex items-center gap-2">
                    <button type="button" id="crSave" class="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded border border-neutral-700 text-white flex items-center gap-1.5 transition">
                        <i class="fa-solid fa-floppy-disk text-dbd-cyan"></i> <span id="crBtnSave">Salvar Build</span>
                    </button>
                    <button type="button" id="crImage" class="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold rounded border border-neutral-700 text-white flex items-center gap-1.5 transition">
                        <i class="fa-solid fa-image text-dbd-cyan"></i> <span id="crBtnImg">Imagem</span>
                    </button>
                    <button type="button" id="crLink" class="px-3 py-1.5 bg-dbd-red hover:bg-dbd-redHover text-xs font-bold rounded border border-neutral-700 text-white flex items-center gap-1.5 transition">
                        <i class="fa-solid fa-link"></i> <span id="crBtnLink">Compartilhar Link</span>
                    </button>
                </div>
            </div>

            <div class="my-6 flex-grow flex items-center">
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full items-stretch">

                    <div class="lg:col-span-4 flex flex-col items-center justify-center text-center space-y-4 bg-neutral-950/80 p-6 rounded-xl border border-neutral-800 shadow-inner">
                        <div id="crCharFrame" class="char-card w-52 md:w-64 relative flex items-center justify-center text-dbd-cyan">
                            <img id="crCharImg" src="" alt="Character" class="w-full h-full object-contain hidden">
                            <i id="crCharIcon" class="fa-solid fa-user-ninja text-8xl text-neutral-600"></i>
                        </div>
                        <div>
                            <h3 id="crCharName" class="text-2xl font-black text-white uppercase tracking-wide">--</h3>
                            <span id="crCharRole" class="text-xs text-dbd-cyan font-bold uppercase tracking-wider">Survivor</span>
                            <div><button type="button" id="crLockChar" class="bd-lock" title="Travar" aria-label="Travar" aria-pressed="false"><i class="fa-solid fa-lock-open"></i></button></div>
                        </div>
                    </div>

                    <div class="lg:col-span-8 flex flex-col gap-4">
                        <div class="bg-neutral-950/80 p-5 rounded-xl border border-neutral-800 flex-grow">
                            <label class="block text-xs font-bold text-dbd-muted uppercase text-center md:text-left" id="crLblPerks">Vantagens (1 por classe)</label>
                            <div class="grid grid-cols-2 xl:grid-cols-4 gap-x-4 items-start justify-items-center">
                                ${[0, 1, 2, 3].map(slotHtml).join('')}
                            </div>
                        </div>

                        <div class="bg-neutral-950/80 p-4 rounded-xl border border-neutral-800 flex flex-wrap items-center justify-between gap-4">
                            <div class="flex items-center gap-4">
                                <div id="crItemBox" class="w-24 h-24 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-dbd-cyan overflow-hidden p-1.5 shrink-0">
                                    <img id="crItemImg" src="" class="w-full h-full object-contain hidden">
                                    <i id="crItemIcon" class="fa-solid fa-toolbox text-4xl"></i>
                                </div>
                                <div>
                                    <div class="text-[11px] text-dbd-muted uppercase font-bold" id="crLblItemTitle">Item / Poder</div>
                                    <div id="crItemName" class="text-base font-bold text-white">Nenhum</div>
                                    <button type="button" id="crLockItem" class="bd-lock" title="Travar" aria-label="Travar" aria-pressed="false"><i class="fa-solid fa-lock-open"></i></button>
                                </div>
                            </div>
                            <div class="flex items-start gap-4">
                                <div class="flex flex-col items-center w-28 text-center gap-1.5">
                                    <div id="crAddon1" class="w-20 h-20 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-400 p-1.5" title="Add-on 1">
                                        <img id="crAddonImg1" src="" class="w-full h-full object-contain hidden">
                                        <i class="fa-solid fa-puzzle-piece text-xl"></i>
                                    </div>
                                    <span id="crAddonName1" class="text-[11px] font-semibold text-neutral-300 line-clamp-2">Add-on 1</span>
                                </div>
                                <div class="flex flex-col items-center w-28 text-center gap-1.5">
                                    <div id="crAddon2" class="w-20 h-20 rounded-xl bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-400 p-1.5" title="Add-on 2">
                                        <img id="crAddonImg2" src="" class="w-full h-full object-contain hidden">
                                        <i class="fa-solid fa-puzzle-piece text-xl"></i>
                                    </div>
                                    <span id="crAddonName2" class="text-[11px] font-semibold text-neutral-300 line-clamp-2">Add-on 2</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="text-xs text-neutral-500 text-center border-t border-neutral-800/80 pt-3">
                <i class="fa-solid fa-circle-info text-dbd-cyan"></i> <span id="crTip">Os filtros do Acervo de Conteúdo também valem aqui.</span>
            </div>
        </div>`;

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
            ? "px-4 py-2 rounded-lg border-2 border-dbd-cyan bg-dbd-cyan/10 text-dbd-cyan text-xs font-bold flex items-center justify-center gap-2 transition hover:bg-dbd-cyan/20"
            : "px-4 py-2 rounded-lg border-2 border-neutral-800 text-neutral-400 text-xs font-bold flex items-center justify-center gap-2 transition hover:border-dbd-cyan hover:text-dbd-cyan";
        $('crRoleKillBtn').className = role === 'killer'
            ? "px-4 py-2 rounded-lg border-2 border-dbd-red bg-dbd-red/10 text-dbd-red text-xs font-bold flex items-center justify-center gap-2 transition hover:bg-dbd-red/20"
            : "px-4 py-2 rounded-lg border-2 border-neutral-800 text-neutral-400 text-xs font-bold flex items-center justify-center gap-2 transition hover:border-dbd-red hover:text-dbd-red";
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
        initClassTooltip();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
