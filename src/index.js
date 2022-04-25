// app.js
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const util = require("util");
const fs = require("fs-extra");

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

async function optimizeGifsInPresentation(presentationId, socket) {

    // get credentials, create if they don't exist
    const credentials = await getCredentials('./creds.json');

    // create new instance of class
    const slidesOptimizer = new GoogleSlidesOptimizer(credentials);

    // copy source slides to new slides
    const newSlides = await slidesOptimizer.copySlides(presentationId)

    // log URL to new slides
    console.log('Copied source slides to new presentation with ID: ' + newSlides.id, socket)

    // get all slides data
    const slidesData = await slidesOptimizer.getSlides(newSlides.id);

    // fish out all the images in slides data
    const imageElements = slidesOptimizer.getImageElements(slidesData);
    console.log('Found images in slides:' + imageElements.length, socket);

    for (const [index, element] of imageElements.entries()) {
        const sourceImagePath = './gif/source/'+element.objectId+'.gif';
        const outputImagePath = './gif/output/'+element.objectId+'_optimized.gif';

        // console.log('Image #' +(index+1)+ ' of '+ imageElements.length +', ID: ' + element.objectId + ', URL: ' + element.image.contentUrl, socket);
        console.log('Image #' +(index+1)+ ' of '+ imageElements.length +', ID: ' + toHref(element.image.contentUrl, element.objectId), socket);

        // download image
        await downloadImageToDisk(element.image.contentUrl, sourceImagePath);

        //check if image is gif
        const isGif = await checkIfGif(sourceImagePath);
        if (!isGif) continue;

        //log current filesize
        const sourceImageStats = fs.statSync(sourceImagePath);
        console.log('Source Image Filesize: ' + formatSizeUnits(sourceImageStats.size), socket);

        //optimize
        await optimizeGif(sourceImagePath, outputImagePath, 200);

        //log optimized filesize
        const outputImageStats = fs.statSync(outputImagePath);
        const optimizationPercentage = 100 - ((outputImageStats.size / sourceImageStats.size)*100);
        console.log('Output Image Filesize: ' + formatSizeUnits(sourceImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%", socket);

        // check if optimization is more than threshold
        if (optimizationPercentage < 5) continue;

        //upload via s3
        const uploadedGifUrl = await slidesOptimizer.uploadFileToS3(outputImagePath);
        console.log('Uploaded Output to S3', socket)

        //replace url in google slides
        await slidesOptimizer.replaceImageUrl(newSlides.id, element.objectId, uploadedGifUrl)
        console.log('Replaced URL in Google Slide', socket)
    }

    // log that it's done
    console.log("Done. New Presentation URL:<br>" + toHref('https://docs.google.com/presentation/d/' + newSlides.id), socket)
}

