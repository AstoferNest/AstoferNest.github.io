var perk_json;
var itens_json;

var tipo_selecao;
var personagens = [];

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
    
    var personagem_select = seleciona_personagem().toUpperCase();
    
    document.getElementById('tipo-exibido').textContent = "";
    document.getElementById('tipo-exibido').textContent = `${personagem_select}`;    
    

    const imagem_item = document.getElementById('imagem-item');
    
    const imagem_addon1 = document.getElementById('imagem-addon-1');
    const imagem_addon2 = document.getElementById('imagem-addon-2');
    
    imagem_item.src = "";
    imagem_addon1.src = "";
    imagem_addon2.src = "";


    if (tipo_selecao == 'surv'){
        var request2 = new XMLHttpRequest();
        request2.open("GET", "../json/itens-surv.json", false);
        request2.send(null);
        itens_json = JSON.parse(request2.responseText); 
        
        const itens = sortearItemEComplementos(itens_json);
        
        console.log(tipo_selecao)
        const nome_item = itens['item'].toLowerCase().replace(/\s+/g, '-') + '.png';
        
        const nome_addon_1 = itens['complementos'][0].toLowerCase().replace(/\s+/g, '-') + '.png';
        
        const nome_addon_2 = itens['complementos'][1].toLowerCase().replace(/\s+/g, '-') + '.png';
        
        imagem_item.title = `${itens['item']}`;
        imagem_item.src= `https://astofer.com/DBD/perkroulette/css/img/itens/${tipo_selecao}/${format(nome_item)}`;
        
        imagem_addon1.title = `${itens['complementos'][0]}`;
        imagem_addon2.title = `${itens['complementos'][1]}`;
        imagem_addon1.src= `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/complementos/${format(nome_addon_1)}`;
        imagem_addon2.src= `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/complementos/${format(nome_addon_2)}`;
    } else {
        var request2 = new XMLHttpRequest();
        request2.open("GET", "../json/itens-kill.json", false);
        request2.send(null);
        itens_json = JSON.parse(request2.responseText); 
        
        // Normaliza para lowercase
        let personagem_key = personagem_select.toLowerCase();
        let itens_lower = Object.fromEntries(
          Object.entries(itens_json).map(([k, v]) => [k.toLowerCase(), v])
        );
        
        if (!itens_lower[personagem_key]) {
          console.log(`Personagem '${personagem_select}' não encontrado.`);
        } else {
          const item = itens_lower[personagem_key];
          
          console.log(item);
          const complementos = item[0].complementos;
          const nome_poder = item[0].nome;
        
          if (complementos.length < 2) {
            console.log(`Não há complementos suficientes para ${personagem_select}`);
          } else {
            // Sorteia dois índices diferentes
            const indice1 = Math.floor(Math.random() * complementos.length);
            let indice2;
            do {
              indice2 = Math.floor(Math.random() * complementos.length);
            } while (indice2 === indice1);
        
            const complemento1 = complementos[indice1];
            const complemento2 = complementos[indice2];
        

            const nome_addon_1 = format(complemento1.toLowerCase().replace(/\s+/g, '-')) + '.png';
            
            const nome_addon_2 = format(complemento2.toLowerCase().replace(/\s+/g, '-')) + '.png';
            

            imagem_item.title = `${nome_poder}`;
            imagem_item.src= `https://astofer.com/DBD/perkroulette/css/img/itens/${tipo_selecao}/poderes/${format(nome_poder)}.png`;
            
            imagem_addon1.title = `${complemento1}`;
            imagem_addon2.title = `${complemento2}`;
            imagem_addon1.src= `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/${format(personagem_select)}/${nome_addon_1}`;
            imagem_addon2.src= `https://astofernest.github.io/perkroulette/css/img/itens/${tipo_selecao}/${format(personagem_select)}/${nome_addon_2}`; 
          }
        }
        
    }
}

function loadPerks() {
    personagens = []
    var list = document.getElementById('perk-list');
    list.innerHTML = "";

    if (document.querySelector("input#surv").checked) {
        var request = new XMLHttpRequest();
        request.open("GET", "../json/survivor-perks.json", false);
        request.send(null);
        perk_json = JSON.parse(request.responseText);
        tipo_selecao = 'surv';
        
    } else if (document.querySelector("input#kill").checked) {
        var request = new XMLHttpRequest();
        request.open("GET", "../json/killer-perks.json", false);
        request.send(null);
        perk_json = JSON.parse(request.responseText);
        
        tipo_selecao = 'kill';
        const imagem_item = document.getElementById('imagem-item');
        
        const imagem_addon1 = document.getElementById('imagem-addon-1');
        const imagem_addon2 = document.getElementById('imagem-addon-2');
        
        imagem_item.src = "";
        imagem_addon1.src = "";
        imagem_addon2.src = "";        
        
    }

    //  --- Sort perks alphabetically ---

    perk_json.perks.sort(function (a, b) {
        return a.perk_name.localeCompare(b.perk_name);
    });

    for (var i = 0; i < perk_json.perks.length; i++) {
        var pn = perk_json.perks[i].perk_name;
        var pc = perk_json.perks[i].character.replace(/Perk ensinável de /gi, '');

        // ✅ Adiciona o personagem ao array, se ainda não existir
        if (pc.toLowerCase() !== 'perk ensinável geral' && !personagens.includes(pc)) {
            personagens.push(pc);
        }

        var newLabel = document.createElement('label');
        newLabel.id = 'element-' + i;
        newLabel.classList.add('perk-list-item');

        var pchid = "pch-" + i;
        newLabel.setAttribute("for", pchid);
        newLabel.innerHTML = "<input type=\"checkbox\" name=\"perk-check\" id=\"pch-" + i + "\" checked><span class=\"perk-name\">" + pn + "<\/span><span class=\"perk-character\">" + pc + "<\/span>";

        list.appendChild(newLabel);
    }
    applyChanges();
}


function seleciona_personagem(){
    if (personagens.length === 0) {
        console.warn("A lista de personagens está vazia!");
        return null;
    }

    var indiceAleatorio = Math.floor(Math.random() * personagens.length);
    var personagemEscolhido = personagens[indiceAleatorio];
    const nome_foto_char = personagemEscolhido.toLowerCase().replace(/\s+/g, '-') + '.png';
    
    console.log(nome_foto_char)
    const foto_char = document.getElementById("personagem");
    const fundo_foto_char = document.getElementById("fundo");
    fundo_foto_char.src= `https://astofernest.github.io/perkroulette/css/img/personagens/fundo_pdbd.png`;
    foto_char.src = `https://astofernest.github.io/perkroulette/css/img/personagens/${nome_foto_char}`;
    return personagemEscolhido;
}

function selAll() {
    for (var i = 0; i < perk_json.perks.length; i++) {
        var pchid = "pch-" + i;
        var checkbox = document.getElementById(pchid);

        checkbox.checked = true;
    }
}
function selNone() {
    for (var i = 0; i < perk_json.perks.length; i++) {
        var pchid = "pch-" + i;
        var checkbox = document.getElementById(pchid);

        checkbox.checked = false;
    }
}

function format(s) {
    var r = s.toString().toLowerCase().normalize("NFD").replace(/ /gi, '').replace(/'/gi, '').replace(/-/gi, '').replace(/:/gi, '').replace(/\p{Diacritic}/gu, '');
    return r;
}


function filter() {
    var input = document.getElementById("search-input");
    var perk_elements = document.getElementById("perk-list").getElementsByTagName("label");
    var filter = format(input.value);

    for (var i = 0; i < perk_elements.length; i++) {
        var perk_name = format(perk_elements[i].getElementsByTagName("span")[0].innerHTML);
        var perk_char = format(perk_elements[i].getElementsByTagName("span")[1].innerHTML);
        var stringToCompare = perk_name + perk_char;

        if (stringToCompare) {
            if (stringToCompare.indexOf(filter) != -1) {
                perk_elements[i].classList.remove('hidden');
            } else {
                perk_elements[i].classList.add('hidden');
            }
        }
    }

    if (input.value == "") {
        document.getElementById("search-clear").classList.add('hidden');
    } else {
        document.getElementById("search-clear").classList.remove('hidden');
    }
}

function resetFilter() {
    var perk_elements = document.getElementById("perk-list").getElementsByTagName("label");

    for (i = 0; i < perk_elements.length; i++) {
        perk_elements[i].classList.remove('hidden');
    }
    document.getElementById("search-clear").classList.add('hidden');
}

function copyToClipboard() {
    var copyText = document.getElementById("link-input");
    var copyTextBtn = document.getElementById("link-copy-btn");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    document.execCommand("copy");
    copyTextBtn.value = "Copiado";
}


function sortearItemEComplementos(data) {
  // Obtem todos os tipos (Chaves, Lanternas, etc.)
  const tipos = Object.keys(data);

  // Sorteia um tipo
  const tipoAleatorio = tipos[Math.floor(Math.random() * tipos.length)];
  const itensDoTipo = data[tipoAleatorio];

  // Sorteia um item do tipo
  const itemAleatorio = itensDoTipo[Math.floor(Math.random() * itensDoTipo.length)];

  // Pega complementos do item e sorteia dois diferentes
  const complementosDisponiveis = [...itemAleatorio.complementos];

  if (complementosDisponiveis.length < 2) {
    console.error("Complementos insuficientes para sortear dois.");
    return null;
  }

  // Embaralha os complementos e pega os dois primeiros
  const embaralhados = complementosDisponiveis.sort(() => 0.5 - Math.random());
  const [complemento1, complemento2] = embaralhados;

  // Retorno
  return {
    tipo: tipoAleatorio,
    item: itemAleatorio.nome,
    complementos: [complemento1, complemento2]
  };
}

