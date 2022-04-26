// app.js
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const util = require("util");
const fs = require("fs-extra");
const axios = require('axios');
const mime = require('mime');


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
    //log_file.write(util.format(d) + '\n');
    log_stdout.write(util.format(d) + '\n');
    if (socket) socket.emit('update message', { data: d});
};


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


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

    // for (const [index, element] of gifElements.entries()) {
    //     const sourceImagePath = './gif/source/'+element.objectId+'.gif';
    //     const outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';
    //
    //     // console.log('Image #' +(index+1)+ ' of '+ imageElements.length +', ID: ' + element.objectId + ', URL: ' + element.image.contentUrl, socket);
    //     console.log('Image #' +(index+1)+ ' of '+ gifElements.length +', ID: ' + toHref(element.image.contentUrl, element.objectId), socket);
    //
    //     // download image
    //     await downloadImageToDisk(element.image.contentUrl, sourceImagePath);
    //
    //     //log current filesize
    //     const sourceImageStats = fs.statSync(sourceImagePath);
    //     console.log('Source Image Filesize: ' + formatSizeUnits(sourceImageStats.size), socket);
    //
    //     //optimize
    //     await optimizeGif(sourceImagePath, outputImagePath, 200);
    //
    //     //log optimized filesize
    //     const outputImageStats = fs.statSync(outputImagePath);
    //     const optimizationPercentage = 100 - ((outputImageStats.size / sourceImageStats.size)*100);
    //     console.log('Output Image Filesize: ' + formatSizeUnits(outputImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%", socket);
    //
    //     // check if optimization is more than threshold
    //     if (optimizationPercentage < 5) continue;
    //
    //     //upload via s3
    //     const uploadedGifUrl = await slidesOptimizer.uploadFileToS3(outputImagePath);
    //     console.log('Uploaded Output to S3', socket)
    //
    //     //replace url in google slides
    //     await slidesOptimizer.replaceImageUrl(newSlides.id, element.objectId, uploadedGifUrl)
    //     console.log('Replaced URL in Google Slide', socket)
    // }

    let optimizeGifPromiseArray = [];
    let sourceSize = 0, outputSize = 0;
    for (const [index, element] of gifElements.entries()) {

        optimizeGifPromiseArray.push(new Promise(async (resolve) => {

            const sourceImagePath = './gif/source/'+element.objectId+'.gif';
            const outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';

            // console.log('Image #' +(index+1)+ ' of '+ imageElements.length +', ID: ' + element.objectId + ', URL: ' + element.image.contentUrl, socket);
            //console.log('Image #' +(index+1)+ ' of '+ gifElements.length +', ID: ' + toHref(element.image.contentUrl, element.objectId), socket);

            // download image
            await downloadImageToDisk(element.image.contentUrl, sourceImagePath);

            //log current filesize
            const sourceImageStats = fs.statSync(sourceImagePath);
            //console.log('Source Image Filesize: ' + formatSizeUnits(sourceImageStats.size), socket);
            sourceSize += sourceImageStats.size;

            //optimize
            await optimizeGif(sourceImagePath, outputImagePath, 200);

            await fs.unlinkSync(sourceImagePath);

            //log optimized filesize
            const outputImageStats = fs.statSync(outputImagePath);
            const optimizationPercentage = 100 - ((outputImageStats.size / sourceImageStats.size)*100);
            outputSize += outputImageStats.size;
            //console.log('Output Image Filesize: ' + formatSizeUnits(outputImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%", socket);

            // check if optimization is more than threshold
            //if (optimizationPercentage < 5) continue;

            //upload via s3
            const uploadedGifUrl = await slidesOptimizer.uploadFileToS3(outputImagePath);
            //console.log('Uploaded Output to S3', socket)

            await fs.unlinkSync(outputImagePath);

            //replace url in google slides
            await slidesOptimizer.replaceImageUrl(newSlides.id, element.objectId, uploadedGifUrl)
            //console.log('Replaced URL in Google Slide', socket)

            console.log('#' +(index+1)+ ' of '+ gifElements.length +', Input: ' + formatSizeUnits(sourceImageStats.size) + ', Output: ' + formatSizeUnits(outputImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%, " + toHref(uploadedGifUrl, 'Link'), socket);

            resolve();
        }))
    }



    await Promise.all(optimizeGifPromiseArray);

    console.log(sourceSize )
    console.log(outputSize)
    //const optimizationAmount =
    // log that it's done
    console.log('Done. Total optimization: ' + formatSizeUnits(sourceSize - outputSize), socket);
    console.log("New Presentation URL:<br>" + toHref('https://docs.google.com/presentation/d/' + newSlides.id), socket)
}

