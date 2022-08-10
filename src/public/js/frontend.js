

function displayMain() {
    document.getElementById("helpTxt").style.display = "flex";
    document.getElementById("form").style.display = "block";
    document.getElementById("welcome").remove();
    document.getElementById('choiceContainer').style.display = "none";
}

function toggleSelection(event) {
    var click = event.target;
    if (click.id == "autoLabel") {
        document.getElementById("AutoOptimize").checked = true;
        DisplayAuto()
    } else {
        document.getElementById("ManualOptimize").checked = true;
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
    var sourceGif = document.getElementById('source');
    var applyLossy = document.querySelector('#applyLossy').checked;
    var factor = document.getElementById('factor').value;
    var applyColourCorrect = document.querySelector('#applyColourCorrect').checked;
    var colourRange = document.getElementById('colourRange').value;
    var auto = document.querySelector('#AutoOptimize').checked;

    if (auto) {
        triggerLog()
        document.getElementById('instructionText').innerHTML = "Please wait while we apply optimization. <br>";
        gifElements = document.querySelectorAll('[gifid]');
        optimizeArray = [];
        let ids = [];

        window.sessionStorage.setItem('optimizationCount', 0);

        for (let index = 0; index < gifElements.length; ++index) {
            const element = gifElements[index];
            sourceGif = element.getAttribute('src')
            gifid = element.getAttribute('gifid')

            if (ids.includes(gifid)) { }
            else {
                optimizeArray.push(new Promise(async (resolve) => {
                    socket.emit('applyOptimizeSettings', { 'auto': auto, 'applyLossy': applyLossy, 'factor': factor, 'applyColourCorrect': applyColourCorrect, 'colourRange': colourRange, 'gifId': gifid, 'src': sourceGif, 'count': index/2, 'total': gifElements.length/2 });
                    resolve();
                }))
            }
            ids.push(gifid)
        }

        window.sessionStorage.setItem('optimizationLength', optimizeArray.length);
        await Promise.all(optimizeArray);

    } else {
        socket.emit('applyOptimizeSettings', { 'auto': auto, 'applyLossy': applyLossy, 'factor': factor, 'applyColourCorrect': applyColourCorrect, 'colourRange': colourRange, 'gifId': sourceGif.getAttribute('gifId'), 'src': sourceGif.src});
    }
    document.getElementById('finishBtn').style.display = "inline-block";
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