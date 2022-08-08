function copyText() {
    var copyText = document.getElementById("shareEmailTxt");
    var button = document.getElementById("copyButton");
    var icon = document.getElementById("copyIcon");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    button.style.backgroundColor = "#5F6368";
    icon.src = "./img/check.png";
    button.innerText = "Copied!";
}

function onSignIn(googleUser) {
    var profile = googleUser.getBasicProfile();
    var id_token = googleUser.getAuthResponse().id_token;
    window.sessionStorage.setItem('google-session', id_token);
    document.getElementById("signOutButton").style.display = "block";
    document.getElementById("beginButton").style.display = "inline-flex";
}

function signOut() {
    var auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(function () {
        document.getElementById("signOutButton").style.display = "none";
    });
}

function updateDeck(event) {
    var gifData = {};
    let googletoken = window.sessionStorage.getItem('google-session');

    gifElements = document.querySelectorAll('[gifid]');
    deckid = gifElements[0].getAttribute('deckid');
    triggerLog()
    document.getElementById('instructionText').innerHTML = "Cropping & replacing gifs in deck.<br>Please wait.";
    console.log("Preparing deck. Please wait.", socket)

    gifElements.forEach(element => {
        gifData[element.getAttribute('gifid')] = element.getAttribute('src')
    });

    socket.emit('updateCopyDeck', { 'gifData': gifData, 'deckid': deckid, 'token': googletoken });
};

function cancelOptimization(event) {
    // Delete all stored gifs & copy of slides
    gifElements = document.querySelectorAll('[gifid]');
    var gifIds = [];

    try{
        deckid = gifElements[0].getAttribute('deckid');
        gifElements.forEach(element => {
            gifIds.push(element.getAttribute('gifid'))
        });
    } catch (e) {
        deckid = 0;
    }
    
    socket.emit('deleteGifs', { 'gifIds': gifIds, 'deckid': deckid });
    location.reload();
};
