let count;
let socket = io({transports: ['websocket']});
let deckData;

function onSignIn(googleUser) {
    const profile = googleUser.getBasicProfile();
    const id_token = googleUser.getAuthResponse().id_token;
    window.sessionStorage.setItem('google-session', id_token);
    document.getElementById("signOutButton").style.display = "block";
    displayMain()
}

function signOut() {
    const auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(function () {
        document.getElementById("signOutButton").style.display = "none";
    });
}

function displayMain() {
    document.getElementById("helpTxt").style.display = "flex";
    document.getElementById("form").style.display = "block";
    document.getElementById("welcome").remove();
    document.getElementById('choiceContainer').style.display = "none";
}

document.getElementById("form").addEventListener('submit', function (e) {
    e.preventDefault();
    const urlInput = document.getElementById("input");

    if (urlInput.value) {
        let [_, url2] = urlInput.value.split('https://docs.google.com/presentation/d/');
        const [slideId] = url2.split('/');

        if (slideId) {
            document.querySelector('#form').remove();
            socket.emit('processDeck', { 'presentationId': slideId, 'token': window.sessionStorage.getItem('google-session') });
            urlInput.value = '';
        } else {
            console.log('not a valid ID / url')
        }
    }
});

function toggleSelection(event) {
    if (event.target.id === "autoLabel") {
        document.getElementById("AutoOptimize").checked = true;
        document.getElementById("applyButton").innerHTML = "Optimize all";
        document.getElementById("finishBtn").style.display = "none";
        DisplayAuto()
    } else {
        document.getElementById("ManualOptimize").checked = true;
        document.getElementById("applyButton").innerHTML = "Optimize";
        DisplayManual()
    }
}

async function displayOptions(event) {
    //clear on every gif clicked
    const source = document.getElementById('source');
    const dest = document.getElementById('dest');
    const gif = event.target;
    const optionsColumn = gif.parentElement.nextSibling;
    const optionsContainer = document.querySelector('#optionsContainer');
    const outputGif = optionsColumn.nextSibling.firstChild;
    document.getElementById('applyButton').innerHTML = "Optimize"

    try {
        source.id = "";
        dest.id = "";
    } catch { };

    optionsColumn.append(optionsContainer);
    optionsContainer.style.display = 'block';
    document.getElementById("applyButton").style.display = "inline-block";
    gif.id = 'source';
    outputGif.id = 'dest';
};


async function optimizeGif(event) {
    const sourceGif = document.getElementById('source');
    const factor = document.getElementById('factor').value;
    const colourRange = document.getElementById('colourRange').value;
    const auto = document.querySelector('#AutoOptimize').checked;

    const button = document.getElementById('applyButton')
    const img = document.createElement('img');
    img.src = "./img/loader1.gif"
    img.style.width = "40px"
    button.innerHTML = ""
    button.appendChild(img)

    if (auto) {
        updateDeck();

    } else {
        socket.emit('manualOptimizeSingleGif', {
            factor,
            colourRange,
            sourceUrl: sourceGif.src,
            gifId: sourceGif.getAttribute('gifId'),
            deckId: sourceGif.getAttribute('deckId'),
        });
    }
};

function updateDeck(e) {
    triggerLog();
    document.getElementById('instructionText').innerHTML = "Please wait while we apply optimization. <br>";

    const factor = document.getElementById('factor').value;
    const colourRange = document.getElementById('colourRange').value;

    socket.emit('autoOptimizeAll', {
        deckData,
        factor,
        colourRange
    });
}

function updateSliderValue(sliderId, target) {
    const sliderEl = document.getElementById(sliderId);
    const targetEl = document.getElementById(target);
    targetEl.innerHTML = sliderEl.value;
};

function DisplayAuto() {
    const auto = document.getElementById('autoLabel');
    auto.style.background = "#E0E0E0";
    auto.style.borderRadius = "4px";
    auto.style.color = "black";

    const manual = document.getElementById('manLabel');
    manual.style.background = "#3C4043";
    manual.style.color = "#fff";

    document.getElementById("helpTxt").innerHTML = "Optimize all the GIFs in your deck before sharing."

    const parent = document.getElementById('instructions');
    const container = document.querySelector('#optionsContainer')
    parent.before(container);
    document.getElementById('optionsForm').style.display = "block";

    document.getElementById("applyButton").style.display = "inline-block";
    document.querySelector('#optimizePanel').style.display = 'none';
    container.style.display = 'block';
    document.querySelector('#processOptions').style.display = 'block';
    document.querySelector('#cancelBtn').style.display = 'inline-block';

    document.getElementById('instructions').style.display = 'block';
    try {document.getElementById('autoStep').styledisplay='none'} catch (e) {};
};

function DisplayManual() {
    const manual = document.getElementById('manLabel');
    manual.style.background = "#E0E0E0";
    manual.style.borderRadius = "4px";
    manual.style.color = "black";

    const auto = document.getElementById('autoLabel');
    auto.style.background = "#3C4043";
    auto.style.color = "#fff";

    document.getElementById("helpTxt").innerHTML = "Choose which gifs you want to optimize before sharing."

    document.querySelector('#optimizePanel').style.display = 'block';
    document.querySelector('#optionsContainer').style.display = 'none';
    document.querySelector('#processOptions').style.display = 'block';
    document.getElementById('instructions').style.display = 'block';
    document.getElementById('finishBtn').style.display = 'inline-block';

    if (document.getElementById("autoStep")){} else{
        const ol = document.getElementById("instructList");
        const li = document.createElement("li");
        li.id = "autoStep"
        li.appendChild(document.createTextNode("Once all of your chosen GIFs are optimized click 'Finalize Deck' to continue."));
        ol.appendChild(li);
    }
};

function copyText() {
    const copyText = document.getElementById("shareEmailTxt");
    const button = document.getElementById("copyButton");
    const icon = document.getElementById("copyIcon");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    button.style.backgroundColor = "#5F6368";
    icon.src = "./img/check.png";
    button.innerText = "Copied!";
}

function cancelOptimization(event) {
    socket.emit('deleteGifs', { deckId: deckData.id });
    location.reload();
};

function triggerLog(){
    document.getElementById('optimizePanel').style.display = "none";
    document.getElementById('helpTxt').style.display = "none";
    document.getElementById('finishBtn').style.display = "none";
    document.getElementById('optimizeChoice').style.display = 'none';
    const choiceContainer = document.getElementById('choiceContainer');
    const log = document.getElementById('log');
    log.style.position = "static";
    log.style.border = "none";
    log.style.display = "block";
    choiceContainer.parentElement.insertBefore(log, choiceContainer);
    choiceContainer.style.display = 'none';
    document.getElementById("optionsForm").style.display = "none";
    document.getElementById("messages").style.display = "block";
}

socket.on("connect", () => {
    socket.on("TriggerDisplayOptions", async function (){
        document.querySelector('#helpTxt').innerHTML = 'Optimize all the GIFs in your deck before sharing.';
        document.getElementById("helpTxt").style.display = "block";
        document.getElementById("helpTxt").style.fontSize = "18px";
        document.querySelector('#optimizeChoice').style.display = 'flex';
        document.getElementById("autoLabel").click();
    });

    socket.on('noAccess', async function (){
        let txtcontainer = document.getElementById('previewTxt');
        document.getElementById('optimizeChoice').style.display = 'none';
        document.getElementById('helpTxt').style.display = 'none';
        txtcontainer.innerHTML = "Error gaining access to the deck, please try again."
    })

    socket.on('replaceGif', async function (msg) {
        console.log(msg)
        //assign timestamp to src to refresh img (does not refresh img if src is the same url)
        document.getElementById('dest').src = (msg.output + '?random=' + new Date().getTime());

        document.getElementsByClassName(`stats ${msg.gifId}`)[0].innerHTML = `New size: ${formatSizeUnits(msg.stats.outputSize)}, optimization: ${Math.round(msg.stats.optimizationPercentage)}%`;

        if (msg.stats.optimizationPercentage < 5) {
            
        }

        document.getElementById("applyButton").innerHTML = "Gif Optimized!"
    });

    socket.on('DisplayTxt', async function (msg){
        document.getElementById('previewTxt').style.display = "block";
        document.getElementById('previewTxt').innerHTML = msg.txt;
        document.getElementById('loader').style.display = 'inline';
    })

    socket.on('DisplayGif', function (msg) {
        document.getElementById('previewTxt').style.display = "none";
        document.getElementById('loader').style.display = "none";
        document.getElementById('choiceContainer').style.display = "flex";
        document.getElementById('log').style.display = "none";

        deckData = msg;

        msg.gifs.forEach(gif => {
            const targetArea = document.getElementById('optimizePanel');
            let ul = document.createElement('ul');
            let li = document.createElement('li');
            let gifEl = document.createElement('img');
            let sourceStats = document.createElement('div');

            // Source gif
            ul.appendChild(li);
            gifEl.src = gif.source.url;
            gifEl.setAttribute('gifId', gif.sourceElement.objectId);
            gifEl.setAttribute('deckId', msg.id);
            li.appendChild(gifEl);

            sourceStats.innerHTML = `Original size: ${formatSizeUnits(gif.source.sourceSize)}`;
            sourceStats.className = 'stats';
            li.appendChild(sourceStats);

            // Options
            ul.appendChild(document.createElement('li'));

            // Output gif
            li = document.createElement('li');
            let outputGif = document.createElement('img');
            let outputStats = document.createElement('div');

            ul.appendChild(li);
            outputGif.setAttribute('gifId', gif.sourceElement.objectId);
            outputGif.setAttribute('deckId', msg.id);
            li.appendChild(outputGif);

            outputStats.innerHTML = ``;
            outputStats.className = `stats ${gif.sourceElement.objectId}`;
            outputStats.setAttribute('gifId', gif.sourceElement.objectId)
            li.appendChild(outputStats);

            gifEl.addEventListener("click", displayOptions, false);
            targetArea.appendChild(ul);
        });

        const item = document.createElement('li');
        console.log(messages)
        messages.insertBefore(item, messages.firstChild);
    });


    socket.on('finishProcess', function (msg) {
        const toHref = (url, label) => '<a target="_blank" href="'+url+'">' + (label || url) + '</a>';
        let deckUrl = toHref(msg.link)
        document.getElementById('previewTxt').innerHTML = "Process complete! You are now the owner of the optimized deck & will receive an email confirmation.<br> You can find a copy of the deck in your personal drive or by following this link: <br><br>" + deckUrl;
        document.getElementById('previewTxt').style.display = 'block';
        document.getElementById('cancelBtn').style.display = "none";
        document.getElementById('restart').style.display = "inline-block";
        document.getElementById('loader').style.display = "none";
    })

    socket.on('update message', function (msg) {
        const item = document.createElement('li');
        item.innerHTML = msg.data;
        messages.insertBefore(item, messages.firstChild);
        console.log(msg.data)
    });
});

function formatSizeUnits(bytes) {
    if      (bytes >= 1073741824) { bytes = (bytes / 1073741824).toFixed(2) + " GB"; }
    else if (bytes >= 1048576)    { bytes = (bytes / 1048576).toFixed(2) + " MB"; }
    else if (bytes >= 1024)       { bytes = (bytes / 1024).toFixed(2) + " KB"; }
    else if (bytes > 1)           { bytes = bytes + " bytes"; }
    else if (bytes === 1)          { bytes = bytes + " byte"; }
    else                          { bytes = "0 bytes"; }
    return bytes;
}