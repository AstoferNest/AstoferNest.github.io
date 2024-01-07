var perk_json;

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
        link += "?exclude=" + perk_blacklist;
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


function loadPerks() {
    var list = document.getElementById('perk-list');
    list.innerHTML = "";

    if (document.querySelector("input#surv").checked) {
        var request = new XMLHttpRequest();
        request.open("GET", "/perkroulette/json/survivor-perks.json", false);
        request.send(null);
        perk_json = JSON.parse(request.responseText);
    } else if (document.querySelector("input#kill").checked) {
        var request = new XMLHttpRequest();
        request.open("GET", "/perkroulette/json/killer-perks.json", false);
        request.send(null);
        perk_json = JSON.parse(request.responseText);
    }

    //  --- Sort perks alphabetically ---

    perk_json.perks.sort(function (a, b) {
        return a.perk_name.localeCompare(b.perk_name);
    });

    for (var i = 0; i < perk_json.perks.length; i++) {
        var pn = perk_json.perks[i].perk_name;
        var pc = perk_json.perks[i].character.replace(/ Perk ensinável de /gi, '');

        var newLabel = document.createElement('label');
        newLabel.id = 'element-' + i;
        newLabel.classList.add('perk-list-item');

        var pchid = "pch-" + i;
        newLabel.setAttribute("for", pchid);
        newLabel.innerHTML = "<input type=\"checkbox\" name=\"perk-check\" id=\"pch-" + i + "\" checked><span class=\"perk-name\">" + pn + "<\/span><span class=\"perk-character\">" + pc + "<\/span>";

        list.appendChild(newLabel);
    }
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
function filter() {

    function format(s) {
        var r = s.toString().toLowerCase().normalize("NFD").replace(/ /gi, '').replace(/'/gi, '').replace(/-/gi, '').replace(/:/gi, '').replace(/\p{Diacritic}/gu, '');
        return r;
    }

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
