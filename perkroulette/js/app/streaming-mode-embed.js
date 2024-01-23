var perk_json;
var active_type;
let url_vars = new URL(document.location).searchParams;

function customColors() {
    if (url_vars.has("bg-c")) {
        if (url_vars.get("bg-c").includes("rgb")) {
            document.querySelector("#streaming-mode-embed").style.background = `${url_vars.get("bg-c")}`;
        } else {
            document.querySelector("#streaming-mode-embed").style.background = `#${url_vars.get("bg-c")}`;
        }
    }
    if (url_vars.has("pn-c")) {
        var x, i;
        x = document.querySelectorAll(".perk_name");
        for (i = 0; i < x.length; i++) {
            if (url_vars.get("pn-c").includes("rgb")) {
                x[i].style.color = `${url_vars.get("pn-c")}`;
            } else {
                x[i].style.color = `#${url_vars.get("pn-c")}`;
            }
        }
    }
    if (url_vars.has("ch-c")) {
        var x, i;
        x = document.querySelectorAll(".perk_character");
        for (i = 0; i < x.length; i++) {
            if (url_vars.get("ch-c").includes("rgb")) {
                x[i].style.color = `${url_vars.get("ch-c")}`;
            } else {
                x[i].style.color = `#${url_vars.get("ch-c")}`;
            }
        }
    }
}

function loadPerks() {
    if (url_vars.get("type").substring(0, 4) == "surv") {
        var request = new XMLHttpRequest();
        request.open("GET", "/perkroulette/json/survivor-perks.json", false);
        request.send(null);
        perk_json = JSON.parse(request.responseText);
        active_type = "surv";

    } else if (url_vars.get("type").substring(0, 4) == "kill") {
        var request = new XMLHttpRequest();
        request.open("GET", "/perkroulette/json/killer-perks.json", false);
        request.send(null);
        perk_json = JSON.parse(request.responseText);
        active_type = "kill";
    }

    //  --- Sort perks alphabetically ---
    perk_json.perks.sort(function (a, b) {
        return a.perk_name.localeCompare(b.perk_name);
    });
}

function pickRandomPerk() {
    customColors();
    loadPerks();

    if (url_vars.get("type").substring(6, 13) == "exclude") {
        var perk_blacklist = url_vars.get("exclude").split(",").map(Number);
    } else {
        perk_blacklist = [];
    }

    if (perk_blacklist.length > (perk_json.perks.length - 4)) {

        // TODO: Error: Not enough perks selected

    } else {
        var sel_perks = [];
        while (sel_perks.length < 4) {
            var randomnumber = Math.floor(Math.random() * (perk_json.perks.length));
            if (perk_blacklist.indexOf(randomnumber) > -1) continue;
            if (sel_perks.indexOf(randomnumber) > -1) continue;
            sel_perks[sel_perks.length] = randomnumber;
        }

        var i = 0;
        while (i < 4) {
            var id = 'p' + i.toString();
            if (url_vars.has("bg-url")) {
                document.getElementById(id).style.backgroundImage = `url("${url_vars.get("bg-url")}")`;
            } else {
                document.getElementById(id).style.backgroundImage = `url("/perkroulette/css/img/perk_purple.png")`;
            }
            i++;

        }

        for (var i = 0; i < 4; i++) {
            document.getElementById("pn" + i).innerHTML = perk_json.perks[sel_perks[i]].perk_name;
            document.getElementById("pc" + i).innerHTML = perk_json.perks[sel_perks[i]].character;
            document.getElementById("pi" + i).style.backgroundImage = "url(/perkroulette/css/img/" + active_type + "/iconperks-" + perk_json.perks[sel_perks[i]].perk_name.toString().toLowerCase().normalize("NFD").replace(/ /gi, '').replace(/'/gi, '').replace(/-/gi, '').replace(/&/gi, 'and').replace(/!/gi, '').replace(/:/gi, '').replace(/\p{Diacritic}/gu, '') + ".png)";

            document.getElementById("pn" + i).classList.add('transparent');
            document.getElementById("pc" + i).classList.add('transparent');
            document.getElementById("p" + i).classList.add('transparent');
        }

        window.setTimeout(perk1an, 250);
    }
}

function perk1an() {
    document.getElementById("p0").classList.remove('transparent');

    document.getElementById("p0").classList.add('animate1');
    document.getElementById("pn0").classList.add('animate2');
    document.getElementById("pc0").classList.add('animate3');

    window.setTimeout(perk2an, 1000);
}

function perk2an() {
    document.getElementById("p1").classList.remove('transparent');

    document.getElementById("p1").classList.add('animate1');
    document.getElementById("pn1").classList.add('animate2');
    document.getElementById("pc1").classList.add('animate3');

    window.setTimeout(perk3an, 1000);
}

function perk3an() {
    document.getElementById("p2").classList.remove('transparent');

    document.getElementById("p2").classList.add('animate1');
    document.getElementById("pn2").classList.add('animate2');
    document.getElementById("pc2").classList.add('animate3');

    window.setTimeout(perk4an, 1000);
}

function perk4an() {
    document.getElementById("p3").classList.remove('transparent');

    document.getElementById("p3").classList.add('animate1');
    document.getElementById("pn3").classList.add('animate2');
    document.getElementById("pc3").classList.add('animate3');
}

function cleanup() {
    document.getElementById("p0").classList.remove('animate1');
    document.getElementById("p1").classList.remove('animate1');
    document.getElementById("p2").classList.remove('animate1');
    document.getElementById("p3").classList.remove('animate1');

    document.getElementById("pn0").classList.remove('animate2');
    document.getElementById("pn1").classList.remove('animate2');
    document.getElementById("pn2").classList.remove('animate2');
    document.getElementById("pn3").classList.remove('animate2');

    document.getElementById("pc0").classList.remove('animate3');
    document.getElementById("pc1").classList.remove('animate3');
    document.getElementById("pc2").classList.remove('animate3');
    document.getElementById("pc3").classList.remove('animate3');
}
