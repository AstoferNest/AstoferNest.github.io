var perk_json;
var itens_json;

var tipo_selecao;
var personagens = [];
var personagens_selecionados = []; // ← novo: lista filtrada pelos checkboxes

function applyChanges() {
    var link = "https://astofernest.github.io/perkroulette/streaming-mode/embed/";

    if (document.querySelector("input#surv").checked) {
        link += "?type=surv";
    } else if (document.querySelector("input#kill").checked) {
        link += "?type=kill";
    }

    var perk_blacklist = [];
    for (var i = 0; i < perk_json.perks.length; i++) {
        var pchid = "pch-" + i;
        var checkbox = document.getElementById(pchid);
        if (checkbox.checked == false) {
            perk_blacklist.push(i);
        }
    }

    if (perk_blacklist.length != 0) {
        link += "&exclude=" + perk_blacklist;
    }

    if (document.querySelector("input[name=bg-color]").value != "transparent") {
        link += "&bg-c=" + document.querySelector("input[name=bg-color]").value;
    }
    if (document.querySelector("input[name=perk-name-color]").value != "ffffff") {
        link += "&pn-c=" + document.querySelector("input[name=perk-name-color]").value;
    }
    if (document.querySelector("input[name=char-color]").value != "ff8800") {
        link += "&ch-c=" + document.querySelector("input[name=char-color]").value;
    }
    if (document.querySelector("input[name=bg-url]").value != "Default") {
        link += "&bg-url=" + document.querySelector("input[name=bg-url]").value;
    }

    document.querySelector("#link-input").value = link;
    document.querySelector("#embed-preview").src = link;
}

// ─── Randomizar APENAS perks (iframe) ───────────────────────────────────────
function randomizarPerks() {
    applyChanges();
    // força reload do iframe para acionar nova roleta de perks
    var iframe = document.querySelector("#embed-preview");
    var src = iframe.src;
    iframe.src = "";
    setTimeout(function () { iframe.src = src; }, 50);
}

// ─── Randomizar APENAS personagem + addons ──────────────────────────────────
function randomizarPersonagem() {
    // Constrói lista de personagens marcados
    personagens_selecionados = [];
    var checkboxes = document.querySelectorAll("#char-list input[name='char-check']");
    checkboxes.forEach(function (cb) {
        if (cb.checked) {
            personagens_selecionados.push(cb.dataset.name);
        }
    });

    if (personagens_selecionados.length === 0) {
        alert("Selecione ao menos um personagem!");
        return;
    }

    var personagem_select = seleciona_personagem();
    if (!personagem_select) return;

    var personagem_upper = personagem_select.toUpperCase();
    document.getElementById('tipo-exibido').textContent = personagem_upper;

    const imagem_item   = document.getElementById('imagem-item');
    const imagem_addon1 = document.getElementById('imagem-addon-1');
    const imagem_addon2 = document.getElementById('imagem-addon-2');

    imagem_item.src   = "";
    imagem_addon1.src = "";
    imagem_addon2.src = "";

    if (tipo_selecao == 'surv') {
        var request2 = new XMLHttpRequest();
        request2.open("GET", "../json/itens-surv.json", false);
        request2.send(null);
        itens_json = JSON.parse(request2.responseText);

        const itens = sortearItemEComplementos(itens_json);
        const nome_item    = itens['item'].toLowerCase().replace(/\s+/g, '-') + '.png';
        const nome_addon_1 = itens['complementos'][0].toLowerCase().replace(/\s+/g, '-') + '.png';
        const nome_addon_2 = itens['complementos'][1].toLowerCase().replace(/\s+/g, '-') + '.png';

        imagem_item.title  = itens['item'];
        imagem_item.src    = `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/${format(nome_item)}`;
        imagem_addon1.title = itens['complementos'][0];
        imagem_addon2.title = itens['complementos'][1];
        imagem_addon1.src  = `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/complementos/${format(nome_addon_1)}`;
        imagem_addon2.src  = `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/complementos/${format(nome_addon_2)}`;

    } else {
        var request2 = new XMLHttpRequest();
        request2.open("GET", "../json/itens-kill.json", false);
        request2.send(null);
        itens_json = JSON.parse(request2.responseText);

        let personagem_key = personagem_upper.toLowerCase();
        let itens_lower = Object.fromEntries(
            Object.entries(itens_json).map(([k, v]) => [k.toLowerCase(), v])
        );

        if (!itens_lower[personagem_key]) {
            console.log(`Personagem '${personagem_upper}' não encontrado.`);
        } else {
            const item        = itens_lower[personagem_key];
            const complementos = item[0].complementos;
            const nome_poder  = item[0].nome;

            if (complementos.length < 2) {
                console.log(`Não há complementos suficientes para ${personagem_upper}`);
            } else {
                const indice1 = Math.floor(Math.random() * complementos.length);
                let indice2;
                do { indice2 = Math.floor(Math.random() * complementos.length); }
                while (indice2 === indice1);

                const complemento1 = complementos[indice1];
                const complemento2 = complementos[indice2];
                const nome_addon_1 = format(complemento1.toLowerCase().replace(/\s+/g, '-')) + '.png';
                const nome_addon_2 = format(complemento2.toLowerCase().replace(/\s+/g, '-')) + '.png';

                imagem_item.title   = nome_poder;
                imagem_item.src     = `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/poderes/${format(nome_poder)}.png`;
                imagem_addon1.title = complemento1;
                imagem_addon2.title = complemento2;
                imagem_addon1.src   = `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/${format(personagem_upper)}/${nome_addon_1}`;
                imagem_addon2.src   = `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/${format(personagem_upper)}/${nome_addon_2}`;
            }
        }
    }
}

// ─── Carrega perks + monta lista de personagens ──────────────────────────────
function loadPerks() {
    personagens = [];
    personagens_selecionados = [];
    var list = document.getElementById('perk-list');
    list.innerHTML = "";

    if (document.querySelector("input#surv").checked) {
        var request = new XMLHttpRequest();
        request.open("GET", "../json/survivor-perks.json", false);
        request.send(null);
        perk_json    = JSON.parse(request.responseText);
        tipo_selecao = 'surv';
    } else if (document.querySelector("input#kill").checked) {
        var request = new XMLHttpRequest();
        request.open("GET", "../json/killer-perks.json", false);
        request.send(null);
        perk_json    = JSON.parse(request.responseText);
        tipo_selecao = 'kill';

        const imagem_item   = document.getElementById('imagem-item');
        const imagem_addon1 = document.getElementById('imagem-addon-1');
        const imagem_addon2 = document.getElementById('imagem-addon-2');
        imagem_item.src   = "";
        imagem_addon1.src = "";
        imagem_addon2.src = "";
    }

    perk_json.perks.sort(function (a, b) {
        return a.perk_name.localeCompare(b.perk_name);
    });

    for (var i = 0; i < perk_json.perks.length; i++) {
        var pn = perk_json.perks[i].perk_name;
        var pc = perk_json.perks[i].character.replace(/Perk ensinável de /gi, '');

        if (pc.toLowerCase() !== 'perk ensinável geral' && !personagens.includes(pc)) {
            personagens.push(pc);
        }

        var newLabel = document.createElement('label');
        newLabel.id  = 'element-' + i;
        newLabel.classList.add('perk-list-item');
        var pchid = "pch-" + i;
        newLabel.setAttribute("for", pchid);
        newLabel.innerHTML = `<input type="checkbox" name="perk-check" id="${pchid}" checked><span class="perk-name">${pn}</span><span class="perk-character">${pc}</span>`;
        list.appendChild(newLabel);
    }

    // ← monta lista de personagens na sidebar
    buildCharList();
    applyChanges();
    randomizarPersonagem();
}

// ─── Constrói o seletor de personagens ──────────────────────────────────────
function buildCharList() {
    var charList = document.getElementById('char-list');
    if (!charList) return;
    charList.innerHTML = "";

    var sorted = [...personagens].sort(function (a, b) {
        return a.localeCompare(b);
    });

    sorted.forEach(function (nome) {
        var label = document.createElement('label');
        label.classList.add('perk-list-item');

        var id = 'char-' + format(nome);
        label.setAttribute('for', id);
        label.innerHTML = `<input type="checkbox" name="char-check" id="${id}" data-name="${nome}" checked><span class="perk-name">${nome}</span>`;
        charList.appendChild(label);
    });

    personagens_selecionados = [...personagens];
}

// ─── Seleciona personagem da lista filtrada ──────────────────────────────────
function seleciona_personagem() {
    var pool = personagens_selecionados.length > 0 ? personagens_selecionados : personagens;

    if (pool.length === 0) {
        console.warn("A lista de personagens está vazia!");
        return null;
    }

    var indiceAleatorio   = Math.floor(Math.random() * pool.length);
    var personagemEscolhido = pool[indiceAleatorio];
    var nome_foto_char    = personagemEscolhido.toLowerCase().replace(/\s+/g, '-') + '.png';

    var foto_char       = document.getElementById("personagem");
    var fundo_foto_char = document.getElementById("fundo");
    fundo_foto_char.src = `https://astofernest.github.io/perkroulette/css/img/personagens/fundo_pdbd.png`;
    foto_char.src       = `https://astofernest.github.io/perkroulette/css/img/personagens/${nome_foto_char}`;

    return personagemEscolhido;
}

// ─── Selecionar todos / nenhum (perks) ──────────────────────────────────────
function selAll() {
    for (var i = 0; i < perk_json.perks.length; i++) {
        document.getElementById("pch-" + i).checked = true;
    }
}
function selNone() {
    for (var i = 0; i < perk_json.perks.length; i++) {
        document.getElementById("pch-" + i).checked = false;
    }
}

// ─── Selecionar todos / nenhum (personagens) ────────────────────────────────
function selAllChars() {
    document.querySelectorAll("#char-list input[name='char-check']").forEach(function (cb) {
        cb.checked = true;
    });
    personagens_selecionados = [...personagens];
}
function selNoneChars() {
    document.querySelectorAll("#char-list input[name='char-check']").forEach(function (cb) {
        cb.checked = false;
    });
    personagens_selecionados = [];
}

// ─── Format helper ──────────────────────────────────────────────────────────
function format(s) {
    return s.toString().toLowerCase()
        .normalize("NFD")
        .replace(/ /gi, '')
        .replace(/'/gi, '')
        .replace(/-/gi, '')
        .replace(/:/gi, '')
        .replace(/\p{Diacritic}/gu, '');
}

// ─── Filtro de busca (perks) ─────────────────────────────────────────────────
function filter() {
    var input   = document.getElementById("search-input");
    var elements = document.getElementById("perk-list").getElementsByTagName("label");
    var f       = format(input.value);

    for (var i = 0; i < elements.length; i++) {
        var pn  = format(elements[i].getElementsByTagName("span")[0].innerHTML);
        var pc  = format(elements[i].getElementsByTagName("span")[1].innerHTML);
        var str = pn + pc;
        if (str.indexOf(f) != -1) {
            elements[i].classList.remove('hidden');
        } else {
            elements[i].classList.add('hidden');
        }
    }

    if (input.value == "") {
        document.getElementById("search-clear").classList.add('hidden');
    } else {
        document.getElementById("search-clear").classList.remove('hidden');
    }
}

// ─── Filtro de busca (personagens) ──────────────────────────────────────────
function filterChars() {
    var input    = document.getElementById("char-search-input");
    var elements = document.getElementById("char-list").getElementsByTagName("label");
    var f        = format(input.value);

    for (var i = 0; i < elements.length; i++) {
        var name = format(elements[i].getElementsByTagName("span")[0].innerHTML);
        if (name.indexOf(f) != -1) {
            elements[i].classList.remove('hidden');
        } else {
            elements[i].classList.add('hidden');
        }
    }

    if (input.value == "") {
        document.getElementById("char-search-clear").classList.add('hidden');
    } else {
        document.getElementById("char-search-clear").classList.remove('hidden');
    }
}

function resetFilter() {
    var elements = document.getElementById("perk-list").getElementsByTagName("label");
    for (var i = 0; i < elements.length; i++) elements[i].classList.remove('hidden');
    document.getElementById("search-clear").classList.add('hidden');
}

function resetCharFilter() {
    var elements = document.getElementById("char-list").getElementsByTagName("label");
    for (var i = 0; i < elements.length; i++) elements[i].classList.remove('hidden');
    document.getElementById("char-search-clear").classList.add('hidden');
}

function copyToClipboard() {
    var copyText    = document.getElementById("link-input");
    var copyTextBtn = document.getElementById("link-copy-btn");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    document.execCommand("copy");
    copyTextBtn.value = "Copiado";
}

function sortearItemEComplementos(data) {
    const tipos        = Object.keys(data);
    const tipoAleatorio = tipos[Math.floor(Math.random() * tipos.length)];
    const itensDoTipo  = data[tipoAleatorio];
    const itemAleatorio = itensDoTipo[Math.floor(Math.random() * itensDoTipo.length)];
    const complementosDisponiveis = [...itemAleatorio.complementos];

    if (complementosDisponiveis.length < 2) {
        console.error("Complementos insuficientes para sortear dois.");
        return null;
    }

    const embaralhados   = complementosDisponiveis.sort(() => 0.5 - Math.random());
    const [complemento1, complemento2] = embaralhados;

    return {
        tipo: tipoAleatorio,
        item: itemAleatorio.nome,
        complementos: [complemento1, complemento2]
    };
}
