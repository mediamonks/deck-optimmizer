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
            const presentation = await optimizeGifsInPresentation(msg, socket);
        } catch (e) {  }
    });
});

async function optimizeGifsInPresentation(url, socket) {
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

    let optimizeGifPromiseArray = [];
    let sourceSize = 0, outputSize = 0;

    for (const [index, element] of gifElements.entries()) {

        optimizeGifPromiseArray.push(new Promise(async (resolve) => {

            const sourceImagePath = './gif/source/'+element.objectId+'.gif';
            const outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';

            // download image
            await downloadImageToDisk(element.image.contentUrl, sourceImagePath);

            // Display source preview
            if (socket) socket.emit('DisplayGif', { path: element.image.contentUrl, target:'sourceGifs'});

            //log current filesize
            const sourceImageStats = fs.statSync(sourceImagePath);
            sourceSize += sourceImageStats.size;

            //check image dimensions
            const imgDimensions = await sizeOf(sourceImagePath);
            const imgWidth = imgDimensions.width;
            const imgHeight = imgDimensions.height;
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

            //determine if resizing of the image is required (when a image is placed at 0.95 scale or lower)
            if (renderedImgWidth / imgWidth < 0.95 || renderedImgHeight / imgHeight < 0.95) {
                resizeLine = Math.round(renderedImgWidth) + 'x' +  Math.round(renderedImgHeight);
            }

            // determine if cropping is required
            if (element.image.imageProperties.hasOwnProperty('cropProperties')) {
                console.log('found image with custom crop');

                const cropProps = {
                    leftOffset: 0, rightOffset: 0, topOffset: 0, bottomOffset: 0, // make sure all required props are in the object
                    ...element.image.imageProperties.cropProperties // overwrite if necessary with props from google's object
                };

                // construct the cropLine to pass in the optimizeGif function
                const cropX1 = Math.round(cropProps.leftOffset * imgWidth);
                const cropY1 = Math.round(cropProps.topOffset * imgHeight);
                const cropX2 = Math.round(imgWidth - (cropProps.rightOffset * imgWidth));
                const cropY2 = Math.round(imgHeight - (cropProps.bottomOffset * imgHeight));
                cropLine = cropX1+','+cropY1+'-'+cropX2+','+cropY2;

                // additional check to see if resize is actually needed by calculating the full rendered image dimensions, without crop
                const fullWidth = (renderedImgWidth / ((1 - (cropProps.leftOffset + cropProps.rightOffset)) * 100)) * 100;
                const fullHeight = (renderedImgHeight / ((1 - (cropProps.topOffset + cropProps.bottomOffset)) * 100)) * 100;
                console.log('rendered image dimensions without crop: ' + Math.round(fullWidth) + 'x' + Math.round(fullHeight))

                if (fullWidth / imgWidth < 0.95 || fullHeight / imgHeight < 0.95) {

                } else {
                    console.log('no resize required. uncropped image is not actually scaled down.')
                    resizeLine = '';
                }
            }

            //optimize gif and remove source image after its done
            await optimizeGif(sourceImagePath, outputImagePath, 200, cropLine, resizeLine);
            await fs.unlinkSync(sourceImagePath);

            //log optimized filesize
            const outputImageStats = fs.statSync(outputImagePath);
            const optimizationPercentage = 100 - ((outputImageStats.size / sourceImageStats.size)*100);
            outputSize += outputImageStats.size;

            //upload via s3 and remove output image after its done
            const uploadedGifUrl = await slidesOptimizer.uploadFileToS3(outputImagePath);
            await fs.unlinkSync(outputImagePath);

            if (socket) socket.emit('Expand', { empty: null });
            if (socket) socket.emit('DisplayGif', { path: uploadedGifUrl, target:'outputGifs'});
            //replace url in google slides
            await slidesOptimizer.replaceImageUrl(newSlides.id, element.objectId, uploadedGifUrl)

            console.log('#' +(index+1)+ ' of '+ gifElements.length +', Input: ' + formatSizeUnits(sourceImageStats.size) + ', Output: ' + formatSizeUnits(outputImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%, " + toHref(uploadedGifUrl, 'Link'), socket);
            resolve();
        }))
    }

    await Promise.all(optimizeGifPromiseArray);

    // log that it's done
    console.log('Done. Total optimization: ' + formatSizeUnits(sourceSize - outputSize), socket);
    console.log("New Presentation URL:<br>" + toHref('https://docs.google.com/presentation/d/' + newSlides.id), socket)
}

