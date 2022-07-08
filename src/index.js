// app.js
const app = require('express')();
express = require('express');
const http = require('http').Server(app);
const io = require('socket.io')(http);
const util = require("util");
const fs = require("fs-extra");
const axios = require('axios');
const mime = require('mime');
const sizeOf = util.promisify(require('image-size'))

const GoogleSlidesOptimizer = require("./util/GoogleSlidesImageOptimizer");

const getCredentials = require("./util/getCredentials");
const downloadImageToDisk = require("./util/downloadImageToDisk");
const formatSizeUnits = require("./util/formatSizeUnits");
const optimizeGif = require("./util/optimizeGif");
const checkIfGif = require("./util/checkIfGif");
const cropGif = require("./util/cropGif");

const port = process.env.PORT || 3000;
const log_stdout = process.stdout;

const toHref = (url, label) => '<a target="_blank" href="'+url+'">' + (label || url) + '</a>';

(async () => {
    console.log('Checking Credentials')
    const credentials = await getCredentials('./creds.json');

    http.listen(port, () => {
        console.log(`Deck Optimmizer - Server running at http://localhost:${port}/`);
    });

})();

console.log = function(d, socket) { 
    log_stdout.write(util.format(d) + '\n');
    if (socket) socket.emit('update message', { data: d});
};

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.use(express.static(__dirname + '/public'));

io.on('connection', async (socket) => {
    console.log('Client Connected')

    socket.on('presentationId', async msg => {
        console.log(msg, socket)

        try {
            const presentation = await loadGifsInPresentation(msg, socket);
        } catch (e) {  }
    });
    
    socket.on('applyOptimizeSettings', async msg => {
        const sourceImagePath = './gif/source/'+msg.gifId+'.gif';
        const outputImagePath = './gif/output/'+msg.gifId+'_optimized.gif';
        const sourceUrl = msg.src;

        // download image
        await downloadImageToDisk(sourceUrl, sourceImagePath);

        //optimize gif and remove source image after its done
        console.log('Optimizing gif...', socket);
        await optimizeGif(sourceImagePath, outputImagePath, msg.applyLossy, msg.factor, msg.applyColourCorrect, msg.colourRange, msg.adjustFrameRate, msg.frameRate);
        

        await fs.copyFile(outputImagePath, './src/public/gif/'+msg.gifId+'_optimized.gif');
        //fs.unlinkSync(sourceImagePath);
        
        if (msg.auto == false){
            if (socket) socket.emit('replaceGif', {'output': './gif/'+msg.gifId+'_optimized.gif'});
        }
    });

    socket.on('deleteGifs', async msg => {
        // get credentials, create if they don't exist
        const credentials = await getCredentials('./creds.json');

        // create new instance of class
        const slidesOptimizer = new GoogleSlidesOptimizer(credentials);

        gifs = msg.gifIds;

        //delete gifs if they exist
        for (id in gifs){
            if(fs.existsSync('./gif/source/'+gifs[id]+'.gif')){
                await fs.unlinkSync('./gif/source/'+gifs[id]+'.gif');
            }
            if(fs.existsSync('./gif/output/'+gifs[id]+'_optimized.gif')){
                await fs.unlinkSync('./gif/output/'+gifs[id]+'_optimized.gif');
            }
        }
        slidesOptimizer.deleteSlides(msg.deckid);
    });

    socket.on('updateCopyDeck', async msg =>{
        // get credentials, create if they don't exist
        const credentials = await getCredentials('./creds.json');

        // create new instance of class
        const slidesOptimizer = new GoogleSlidesOptimizer(credentials);

        //get original slides data
        const presentationId = msg.deckid;

        console.log('Presentation id:' + presentationId);

        // get all slides data
        const slidesData = await slidesOptimizer.getSlides(presentationId);

        // fish out all the images in slides data
        const imageElements = slidesOptimizer.getImageElements(slidesData);

        let gifElements = [];
        let checkIfGifPromiseArray = [];
        // prevent socket timeout for large decks
        socket.emit('', '');
        for (const [imageElement] of imageElements.entries()) {
            console.log(imageElement)
            checkIfGifPromiseArray.push(new Promise(async (resolve) => {
                isGif = await checkIfGif(imageElements[imageElement].image.contentUrl);
                if (isGif) {
                    console.log(isGif)
                    gifElements.push(imageElements[imageElement]);
                }
                resolve();
            }))
    }

    await Promise.all(checkIfGifPromiseArray);
    
    optimizedGifs = fs.readdirSync("./src/public/gif/");

    let optimizeGifPromiseArray = [];
    let totalSourceSize = 0, outputSize = 0;

    for (const [index, element] of gifElements.entries()) {
        optimizeGifPromiseArray.push(new Promise(async (resolve) => {
            sourceImageId = element.objectId;

            match = optimizedGifs.some(e =>e.includes(sourceImageId));
            
            if (match){
                sourceImagePath = './gif/source/'+element.objectId+'.gif';
                outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';
                sourceSize = fs.statSync(sourceImagePath).size;
            }else{
                sourceImagePath = './gif/source/'+element.objectId+'.gif';
                outputImagePath = './gif/output/'+element.objectId+'.gif';
                sourceSize = fs.statSync(sourceImagePath).size;
                
                // download image
                await downloadImageToDisk(element.image.contentUrl, outputImagePath);
                outputImageStats = fs.statSync(outputImagePath);
            }
            totalSourceSize += sourceSize

            // Display source preview
            sourceUrl = element.image.contentUrl;

            //log current filesize
            sourceImageStats = fs.statSync(sourceImagePath);

            //check image dimensions
            imgDimensions = await sizeOf(sourceImagePath);
            imgWidth = imgDimensions.width;
            imgHeight = imgDimensions.height;
            console.log('Source image dimensions: '+imgWidth + 'x' + imgHeight)

            // set "trueScale", name I came up with for the actual scale when a image is 1:1 pixels in fullscreen presenting mode
            const trueScaleX = 190.5; // 381/2 and 381x25 = 9525
            const trueScaleY = 190.5;

            // determine what resolution the image is actually rendered at in the slide
            let renderedImgWidth = ((element.size.width.magnitude / 25) * element.transform.scaleX) / trueScaleX;
            let renderedImgHeight = ((element.size.height.magnitude / 25) * element.transform.scaleY) / trueScaleY;
            console.log('Rendered image dimensions: '+ Math.round(renderedImgWidth) + 'x' + Math.round(renderedImgHeight))

            // declare resize/crop string to pass in the optimizeGif function
            let resizeLine = '';
            let cropLine = '';

            // //determine if resizing of the image is required (when a image is placed at 0.95 scale or lower)
            if (renderedImgWidth / imgWidth < 0.95 || renderedImgHeight / imgHeight < 0.95) {
                resizeLine = Math.round(renderedImgWidth) + 'x' +  Math.round(renderedImgHeight);
            }
            // TODO: Some crops are invaid and do not fit the source image - this brakes the optimization
            // determine if cropping is required
            if (element.image.imageProperties.hasOwnProperty('cropProperties')) {
                console.log('Found image with custom crop', socket);

                const cropProps = {
                    leftOffset: 0, rightOffset: 0, topOffset: 0, bottomOffset: 0, // make sure all required props are in the object
                    ...element.image.imageProperties.cropProperties // overwrite if necessary with props from google's object
                };

                // construct the cropLine to pass in the optimizeGif function
                cropX1 = Math.round(cropProps.leftOffset * imgWidth);
                cropY1 = Math.round(cropProps.topOffset * imgHeight);
                cropX2 = Math.round(imgWidth - (cropProps.rightOffset * imgWidth));
                cropY2 = Math.round(imgHeight - (cropProps.bottomOffset * imgHeight));

                // Address negative crop coords
                if ((parseInt(cropX1) || parseInt(cropY1)) < 0 ){
                    cropLine = ""
                } else {
                    cropLine = cropX1+','+cropY1+'-'+cropX2+','+cropY2;
                }

                // additional check to see if resize is actually needed by calculating the full rendered image dimensions, without crop
                fullWidth = (renderedImgWidth / ((1 - (cropProps.leftOffset + cropProps.rightOffset)) * 100)) * 100;
                fullHeight = (renderedImgHeight / ((1 - (cropProps.topOffset + cropProps.bottomOffset)) * 100)) * 100;
                console.log('Rendered image dimensions without crop: ' + Math.round(fullWidth) + 'x' + Math.round(fullHeight))

                if ((fullWidth / imgWidth < 0.95 || fullHeight / imgHeight < 0.95) && (cropLine != "")){
                    try{
                        if (match) {
                            await cropGif(outputImagePath, outputImagePath, cropLine, resizeLine);
                        } else {
                            await cropGif(sourceImagePath, outputImagePath, cropLine, resizeLine);
                        }
                    } catch (error) {
                        console.log('err: ' + error);
                    }
                    
                } else {
                    console.log('No resize required', socket);
                }
            }
            outputImageStats = fs.statSync(outputImagePath);

            //log optimized filesize
            optimizationPercentage = 100 - ((outputImageStats.size / sourceImageStats.size)*100);
            outputSize += outputImageStats.size;
            
            uploadedGifUrl = await slidesOptimizer.uploadFileToS3(outputImagePath);

            //replace url in google slides
            try{
                await slidesOptimizer.replaceImageUrl(presentationId, sourceImageId, uploadedGifUrl)
            } catch (error) {
                console.error(error);
            };

            console.log('#' +(index+1)+ ' of '+ gifElements.length +', Input: ' + formatSizeUnits(sourceSize) + ', Output: ' + formatSizeUnits(outputImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%, " + toHref(uploadedGifUrl, 'Link'), socket);
            resolve();
        }))
        await Promise.all(optimizeGifPromiseArray);
    }

    // log that it's done
    console.log('Done. Total optimization: ' + formatSizeUnits(totalSourceSize - outputSize), socket);

    tokenData = await slidesOptimizer.verifyToken(msg.token)
    payload = tokenData.getPayload()
    console.log(payload)
    
    // give permissions to target user
    //await slidesOptimizer.changeOwnership(presentationId, payload['email']);

    console.log("New Presentation URL:<br>" + toHref('https://docs.google.com/presentation/d/' + presentationId), socket)
    //TODO: Remove this tmp function
    //await slidesOptimizer.deleteSlides(presentationId);
    });

});

async function loadGifsInPresentation(url, socket){        
    // get credentials, create if they don't exist
    const credentials = await getCredentials('./creds.json');

    // create new instance of class
    const slidesOptimizer = new GoogleSlidesOptimizer(credentials);

    //get original slides data
    const presentationId = slidesOptimizer.getSlideIdFromUrl(url);
    console.log('Received source slides with ID: ' + presentationId, socket)

    // copy source slides to new slides
    const newSlides = await slidesOptimizer.copySlides(presentationId)

    // log URL to new slides
    console.log('Copied source slides to new presentation with ID: ' + newSlides.id, socket)

    // get all slides data
    const slidesData = await slidesOptimizer.getSlides(newSlides.id);

    // fish out all the images in slides data
    const imageElements = slidesOptimizer.getImageElements(slidesData);
    console.log('Found images in slides:' + imageElements.length, socket);

    let gifElements = [];
    let checkIfGifPromiseArray = [];
    for (const [index, imageElement] of imageElements.entries()) {
        checkIfGifPromiseArray.push(new Promise(async (resolve) => {
            // const mimeType = await getMimeType(imageElement.image.contentUrl)
            const isGif = await checkIfGif(imageElement.image.contentUrl);
            if (isGif) {
                //console.log(index + ': found GIF, adding to array');
                gifElements.push(imageElement);
            }
            resolve();
        }))
    }

    await Promise.all(checkIfGifPromiseArray);
    console.log('Found GIF images in slides: ' + gifElements.length, socket);

    let gifs = {};
    let sourceSize = 0, outputSize = 0;

    console.log('Downloading gifs. Please wait.', socket);
    for (const [index, element] of gifElements.entries()) {
            
            const sourceImagePath = './gif/source/'+element.objectId+'.gif';
            //const outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';

            // download image
            await downloadImageToDisk(element.image.contentUrl, sourceImagePath);

            // Display source preview
            const sourceUrl = element.image.contentUrl;

            gifs[element.objectId] = {id:element.objectId, source:sourceUrl, output: sourceUrl, id:element.objectId, deckId:newSlides.id}

        }
    console.log("Loading gif preview...", socket);
    if (socket) socket.emit('DisplayGif', { gifarray: gifs});
}
