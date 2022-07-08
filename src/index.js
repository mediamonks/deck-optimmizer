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
const cliProgress = require('cli-progress');

const GoogleSlidesOptimizer = require("./util/GoogleSlidesImageOptimizer");

const getCredentials = require("./util/getCredentials");
const downloadImageToDisk = require("./util/downloadImageToDisk");
const formatSizeUnits = require("./util/formatSizeUnits");
const optimizeGif = require("./util/optimizeGif");
const checkIfGif = require("./util/checkIfGif");
const cropGif = require("./util/cropGif");

const port = process.env.PORT || 3000;
const log_stdout = process.stdout;
//const log_file = fs.createWriteStream(__dirname + '/debug.log', {flags : 'w'});
const toHref = (url, label) => '<a target="_blank" href="'+url+'">' + (label || url) + '</a>';

(async () => {
    console.log('Checking Credentials')
    const credentials = await getCredentials('./creds.json');

    http.listen(port, () => {
        console.log(`Deck Optimmizer - Server running at http://localhost:${port}/`);
    });

})();

console.log = function(d, socket) { //
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
 
        //display loading screen
        if (socket) socket.emit('displayWait', { msg: '' });

        //optimize gif and remove source image after its done
        await optimizeGif(sourceImagePath, outputImagePath, msg.applyLossy, msg.factor, msg.applyColourCorrect, msg.colourRange, msg.adjustFrameRate, msg.frameRate);

        await fs.copyFile(outputImagePath, './src/public/gif/'+msg.gifId+'_optimized.gif');
        //fs.unlinkSync(sourceImagePath);
        
        //hide loading screen
        if (socket) socket.emit('finishWait', { msg: '' });

        if (msg.auto == false){
            if (socket) socket.emit('replaceGif', {'output': './gif/'+msg.gifId+'_optimized.gif'});
        }
    });

    socket.on('deleteGifs', async msg => {
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

        // TODO: Delete s3 copy deck

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
    console.log('Found images in slides:' + imageElements.length, socket);

    let gifElements = [];
    let checkIfGifPromiseArray = [];
    for (const [index, imageElement] of imageElements.entries()) {
        checkIfGifPromiseArray.push(new Promise(async (resolve) => {
            //const mimeType = await getMimeType(imageElement.image.contentUrl)
            const isGif = await checkIfGif(imageElement.image.contentUrl);
            if (isGif) {
                //console.log(index + ': found GIF, adding to array');
                gifElements.push(imageElement);
            }
            resolve();
        }))
    }

    await Promise.all(checkIfGifPromiseArray);
    console.log('Found GIF images in slides:' + gifElements.length, socket);

    optimizedGifs = fs.readdirSync("./src/public/gif/");

    let optimizeGifPromiseArray = [];
    let sourceSize = 0, outputSize = 0;

    for (const [index, element] of gifElements.entries()) {
        optimizeGifPromiseArray.push(new Promise(async (resolve) => {
            sourceImageId = element.objectId;

            match = optimizedGifs.some(e =>e.includes(sourceImageId));

            console.log(sourceImageId + ' - ' + match)
            
            if (match){
                sourceImagePath = './src/public/gif/'+element.objectId+'_optimized.gif';
                outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';
            }else{
                sourceImagePath = './gif/source/'+element.objectId+'.gif';
                outputImagePath = './gif/output/'+element.objectId+'.gif';
                // download image
                await downloadImageToDisk(element.image.contentUrl, outputImagePath);
            }

            console.log(sourceImagePath + '  -  ' + outputImagePath);

            // Display source preview
            sourceUrl = element.image.contentUrl;

            //log current filesize
            sourceImageStats = fs.statSync(sourceImagePath);
            sourceSize += sourceImageStats.size;

            //check image dimensions
            imgDimensions = await sizeOf(sourceImagePath);
            imgWidth = imgDimensions.width;
            imgHeight = imgDimensions.height;
            console.log('source image dimensions: '+imgWidth + 'x' + imgHeight)

            // set "trueScale", name I came up with for the actual scale when a image is 1:1 pixels in fullscreen presenting mode
            const trueScaleX = 190.5; // 381/2 and 381x25 = 9525
            const trueScaleY = 190.5;

            // determine what resolution the image is actually rendered at in the slide
            let renderedImgWidth = ((element.size.width.magnitude / 25) * element.transform.scaleX) / trueScaleX;
            let renderedImgHeight = ((element.size.height.magnitude / 25) * element.transform.scaleY) / trueScaleY;
            console.log('rendered image dimensions: '+ Math.round(renderedImgWidth) + 'x' + Math.round(renderedImgHeight))

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
                console.log('found image with custom crop');

                const cropProps = {
                    leftOffset: 0, rightOffset: 0, topOffset: 0, bottomOffset: 0, // make sure all required props are in the object
                    ...element.image.imageProperties.cropProperties // overwrite if necessary with props from google's object
                };

                // construct the cropLine to pass in the optimizeGif function
                cropX1 = Math.round(cropProps.leftOffset * imgWidth);
                cropY1 = Math.round(cropProps.topOffset * imgHeight);
                cropX2 = Math.round(imgWidth - (cropProps.rightOffset * imgWidth));
                cropY2 = Math.round(imgHeight - (cropProps.bottomOffset * imgHeight));
                cropLine = cropX1+','+cropY1+'-'+cropX2+','+cropY2;

                // additional check to see if resize is actually needed by calculating the full rendered image dimensions, without crop
                fullWidth = (renderedImgWidth / ((1 - (cropProps.leftOffset + cropProps.rightOffset)) * 100)) * 100;
                fullHeight = (renderedImgHeight / ((1 - (cropProps.topOffset + cropProps.bottomOffset)) * 100)) * 100;
                console.log('rendered image dimensions without crop: ' + Math.round(fullWidth) + 'x' + Math.round(fullHeight))

                if (fullWidth / imgWidth < 0.95 || fullHeight / imgHeight < 0.95) {
                    try{
                        await cropGif(sourceImagePath, outputImagePath, cropLine, resizeLine);
                    } catch (error) {
                        console.log('err: ' + error);
                    }
                    
                } else {
                    console.log('no resize required. uncropped image is not actually scaled down.')
                }
            }

            

            //log optimized filesize
            outputImageStats = fs.statSync(outputImagePath);
            optimizationPercentage = 100 - ((outputImageStats.size / sourceImageStats.size)*100);
            outputSize += outputImageStats.size;
            
            uploadedGifUrl = await slidesOptimizer.uploadFileToS3(outputImagePath);

            //replace url in google slides
            try{
                await slidesOptimizer.replaceImageUrl(presentationId, sourceImageId, uploadedGifUrl)
            } catch (error) {
                console.error(error);
            };

            console.log('#' +(index+1)+ ' of '+ gifElements.length +', Input: ' + formatSizeUnits(sourceImageStats.size) + ', Output: ' + formatSizeUnits(outputImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%, " + toHref(uploadedGifUrl, 'Link'), socket);
            resolve();
        }))
        if (socket) socket.emit('displayWait', { msg: '' });
        await Promise.all(optimizeGifPromiseArray);
        //hide loading screen
        if (socket) socket.emit('finishWait', { msg: '' });
    }

    // log that it's done
    console.log('Done. Total optimization: ' + formatSizeUnits(sourceSize - outputSize), socket);
    console.log("New Presentation URL:<br>" + toHref('https://docs.google.com/presentation/d/' + presentationId), socket)

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
    console.log('New Slide ')

    // get all slides data
    const slidesData = await slidesOptimizer.getSlides(newSlides.id);

    // fish out all the images in slides data
    const imageElements = slidesOptimizer.getImageElements(slidesData);
    console.log('Found images in slides:' + imageElements.length, socket);

    // find all gifs in imageElements
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(imageElements.length, 0);

    const pLimit = await import('p-limit'); // using this ESM package to limit concurrency of promises
    const limit = pLimit.default(100); // set limit to 100 promises at a time

    // function to run in each promise
    const inputPromise = async (imageElement) => {
        const isGif = await checkIfGif(imageElement.image.contentUrl)

        if (isGif) {
            return imageElement;
        }
        else {
            return 'not a gif';
        }
    }

    // add all promises to array
    const imageCheckPromises = imageElements.map(imageElement => {
        return limit(() => inputPromise(imageElement).then( (result) => {
            progressBar.increment(1);
            return result;
        }))
    })

    const imageCheckingResult = await Promise.all(imageCheckPromises); // run all promises with limited concurrency

    const gifElements = imageCheckingResult.filter(result => {
        return result !== 'not a gif'; // filter results
    })

    progressBar.stop();

    console.log('Found GIF images in slides:' + gifElements.length, socket);

    let optimizeGifPromiseArray = [];
    let sourceSize = 0, outputSize = 0;

    for (const [index, element] of gifElements.entries()) {

        optimizeGifPromiseArray.push(new Promise(async (resolve) => {

            const sourceImagePath = './gif/source/'+element.objectId+'.gif';
            //const outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';

            // download image
            await downloadImageToDisk(element.image.contentUrl, sourceImagePath);

            // Display source preview
            const sourceUrl = element.image.contentUrl;

            if (socket) socket.emit('DisplayGif', { source:sourceUrl, output: sourceUrl, id:element.objectId, deckId:newSlides.id});

            resolve();
        }))
    }
}

