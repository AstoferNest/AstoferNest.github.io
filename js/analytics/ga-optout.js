
window.addEventListener("load", function() {

    var banner = document.getElementById('cookie-banner');

    if (document.cookie.indexOf("showCookieBanner=false") > -1) {
        banner.style = "display: none;";
    } else {
        banner.style = "display: flex;";
    }

});

function denyCookies() {
    document.cookie = "showCookieBanner=false; expires=Thu, 31 Dec 2099 23:59:59 UTC; path=/";

    var banner = document.getElementById('cookie-banner');
    banner.style = "display: none;";

    if (window.location.href.indexOf("privacy") > -1) {
        var optoutbutton = document.getElementById('optOutButton');
        optoutbutton.innerHTML = "OPT-OUT SET";
    }

    gtag('consent', 'update', {'analytics_storage': 'denied'});
}

function acceptCookies() {
    document.cookie = "showCookieBanner=false; expires=Thu, 31 Dec 2099 23:59:59 UTC; path=/";

    var banner = document.getElementById('cookie-banner');
    banner.style = "display: none;";

    gtag('consent', 'update', {'analytics_storage': 'granted'});
}
