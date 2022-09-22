// var input = document.getElementById('input');
let count;
let socket = io({transports: ['websocket']});
let deckData;

function onSignIn(googleUser) {
    var profile = googleUser.getBasicProfile();
    var id_token = googleUser.getAuthResponse().id_token;
    window.sessionStorage.setItem('google-session', id_token);
    document.getElementById("signOutButton").style.display = "block";
    // document.getElementById("beginButton").style.display = "inline-flex";
    displayMain()
}

function signOut() {
    var auth2 = gapi.auth2.getAuthInstance();
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
        const slideId = getSlideIdFromUrl(urlInput.value);

        if (slideId) {
            document.querySelector('#form').remove();
            socket.emit('processDeck', { 'presentationId': slideId, 'token': window.sessionStorage.getItem('google-session') });
            urlInput.value = '';
        } else {
            console.log('not a valid ID / url')
        }
    }
});

function getSlideIdFromUrl(inputString) {
    try {
        let [_, url2] = inputString.split('https://docs.google.com/presentation/d/');
        let [id] = url2.split('/');
        return id;
    } catch (e) {
        return false;
    }
}

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
    var source = document.getElementById('source');
    var dest = document.getElementById('dest');
    var gif = event.target;
    var optionsColumn = gif.parentElement.nextSibling;
    var optionsContainer = document.querySelector('#optionsContainer');
    var outputGif = optionsColumn.nextSibling.firstChild;
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
        document.getElementById('instructionText').innerHTML = "Please wait while we apply optimization. <br>";
        updateDeck();
        // socket.emit('autoOptimizeAll', {
        //     deckData,
        //     factor,
        //     colourRange
        // });

    } else {

        socket.emit('manualOptimizeSingleGif', {
            factor,
            colourRange,
            gifId: sourceGif.getAttribute('gifId'),
            deckId: sourceGif.getAttribute('deckId'),
        });
    }
};

function updateDeck(event) {
    // var gifData = {};
    // document.getElementById('loader').style.display = "inline-block";
    // document.getElementById('previewTxt').style.display = "block";
    // document.getElementById('previewTxt').innerHTML = "Updating deck. Please wait."
    // let googletoken = window.sessionStorage.getItem('google-session');
    //
    // const gifElements = document.querySelectorAll('[gifid]');
    // const deckid = gifElements[0].getAttribute('deckid');
    // triggerLog()
    //
    //
    // gifElements.forEach(element => {
    //     gifData[element.getAttribute('gifid')] = element.getAttribute('src')
    // });
    //
    // socket.emit('updateCopyDeck', { 'gifData': gifData, 'deckid': deckid, 'token': googletoken });
    triggerLog();

    const factor = document.getElementById('factor').value;
    const colourRange = document.getElementById('colourRange').value;
    // const token = window.sessionStorage.getItem('google-session');

    socket.emit('autoOptimizeAll', {
        deckData,
        factor,
        colourRange
    });
};

function triggerLog(){
    document.getElementById('optimizePanel').style.display = "none";
    document.getElementById('helpTxt').style.display = "none";
    document.getElementById('finishBtn').style.display = "none";
    document.getElementById('optimizeChoice').style.display = 'none';
    choiceContainer = document.getElementById('choiceContainer');
    log = document.getElementById('log');
    log.style.position = "static";
    log.style.border = "none";
    log.style.display = "block";
    choiceContainer.parentElement.insertBefore(log, choiceContainer);
    choiceContainer.style.display = 'none';
    document.getElementById("optionsForm").style.display = "none";
    document.getElementById("messages").style.display = "block";
}

function updateSliderValue(sliderId, target) {
    var slider = document.getElementById(sliderId);
    var target = document.getElementById(target);
    target.innerHTML = slider.value;
};

function DisplayAuto() {
    auto = document.getElementById('autoLabel');
    auto.style.background = "#E0E0E0";
    auto.style.borderRadius = "4px";
    auto.style.color = "black";

    manual = document.getElementById('manLabel');
    manual.style.background = "#3C4043";
    manual.style.color = "#fff";

    document.getElementById("helpTxt").innerHTML = "Optimize all the GIFs in your deck before sharing."

    parent = document.getElementById('instructions');
    container = document.querySelector('#optionsContainer')
    parent.before(container);
    document.getElementById('optionsForm').style.display.style = "block";

    document.getElementById("applyButton").style.display = "inline-block";
    document.querySelector('#optimizePanel').style.display = 'none';
    container.style.display = 'block';
    document.querySelector('#processOptions').style.display = 'block';
    document.querySelector('#cancelBtn').style.display = 'inline-block';

    document.getElementById('instructions').style.display = 'block';
    try {document.getElementById('autoStep').styledisplay='none'} catch (e) {};
};

function DisplayManual() {
    manual = document.getElementById('manLabel');
    manual.style.background = "#E0E0E0";
    manual.style.borderRadius = "4px";
    manual.style.color = "black";

    auto = document.getElementById('autoLabel');
    auto.style.background = "#3C4043";
    auto.style.color = "#fff";

    document.getElementById("helpTxt").innerHTML = "Choose which gifs you want to optimize before sharing."

    document.querySelector('#optimizePanel').style.display = 'block';
    document.querySelector('#optionsContainer').style.display = 'none';
    document.querySelector('#processOptions').style.display = 'block';
    document.getElementById('instructions').style.display = 'block';
    document.getElementById('finishBtn').style.display = 'inline-block';

    if (document.getElementById("autoStep")){} else{
        var ol = document.getElementById("instructList");
        var li = document.createElement("li");
        li.id = "autoStep"
        li.appendChild(document.createTextNode("Once all of your chosen GIFs are optimized click 'Finalize Deck' to continue."));
        ol.appendChild(li);
    }
};



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

function cancelOptimization(event) {
    socket.emit('deleteGifs', { deckId: deckData.id });
    location.reload();
};



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
        console.log(msg.stats)
        //assign timestamp to src to refresh img (does not refresh img if src is the same url)
        document.getElementById('dest').src = (msg.output + '?random=' + new Date().getTime());
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

        console.log(deckData)

        msg.gifs.forEach(gifElement => {
            const targetArea = document.getElementById('optimizePanel');
            let ul = document.createElement('ul');
            let li = document.createElement('li');
            let gif = document.createElement('img');

            // Source gif
            ul.appendChild(li);
            gif.src = gifElement.s3source;
            gif.setAttribute('gifId', gifElement.objectId);
            gif.setAttribute('deckId', msg.id);
            li.appendChild(gif);

            // Options
            ul.appendChild(document.createElement('li'));

            // Output gif
            li = document.createElement('li');
            let outputGif = document.createElement('img');
            ul.appendChild(li);
            //outputGif.src = val['output'];
            outputGif.setAttribute('gifId', gifElement.objectId);
            outputGif.setAttribute('deckId', msg.id);
            li.appendChild(outputGif);

            gif.addEventListener("click", displayOptions, false);
            targetArea.appendChild(ul);
        });

        const item = document.createElement('li');
        // item.innerHTML = "Preview loaded.";
        messages.insertBefore(item, messages.firstChild);
    });

    socket.on('optimizationCompleted', function (msg) {
        current_count = parseInt(window.sessionStorage.getItem('optimizationCount'));
        total_count = parseInt(window.sessionStorage.getItem('optimizationLength'));
        var item = document.createElement('li');
        item.innerHTML = "Optimized #"+(current_count+1)+" of "+ total_count;
        messages.insertBefore(item, messages.firstChild);
        window.sessionStorage.setItem('optimizationCount', current_count + 1);
        if (current_count+1 == total_count){
            document.getElementById('finishBtn').click();
        }
    });

    socket.on('finishProcess', function (msg) {
        const toHref = (url, label) => '<a target="_blank" href="'+url+'">' + (label || url) + '</a>';
        let deckurl = toHref(msg.link)
        document.getElementById('previewTxt').innerHTML = "Process complete! You are now the owner of the optimized deck & will receive an email confirmation.<br> You can find a copy of the deck in your personal drive or by following this link: <br><br>" + deckurl;
        document.getElementById('previewTxt').style.display = 'block';
        document.getElementById('cancelBtn').style.display = "none";
        document.getElementById('restart').style.display = "inline-block";
        document.getElementById('loader').style.display = "none";
    })

    socket.on('update message', function (msg) {
        var item = document.createElement('li');
        item.innerHTML = msg.data;
        messages.insertBefore(item, messages.firstChild);
        console.log(msg.data)
    });
});
