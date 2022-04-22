// app.js
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const port = process.env.PORT || 3000;

const getCredentials = require("./util/getCredentials");
const {google} = require("googleapis");
const copyGoogleSlides = require("./util/copyGoogleSlides");
const downloadImageToDisk = require("./util/downloadImageToDisk");
const fs = require("fs-extra");
const filetype = require("file-type-cjs");
const formatSizeUnits = require("./util/formatSizeUnits");
const optimizeGif = require("./util/optimizeGif");
const uploadImageToS3 = require("./util/uploadImageToS3");
const replaceImageInGoogleSlides = require("./util/replaceImageInGoogleSlides");

const credsFilePath = './creds.json';

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});


io.on('connection', async (socket) => {
    console.log('Client Connected')

    socket.on('presentationId', async msg => {
        try {

            const presentation = await optimizeGifsInPresentation(msg, socket);

        } catch (e) {

        }
    });
});

const findAllImages = slidesData => {
    const imagesArray = [];
    slidesData.data.slides.forEach(slide => {
        if (slide.hasOwnProperty('pageElements')) {
            slide.pageElements.forEach(pageElement => {
                if (pageElement.image) imagesArray.push(pageElement);
            });
        }
    })

    return imagesArray;
}

const logme = (string, socket) => {
    console.log(string);
    socket.emit('update message', { data: string});
}

const optimizeGifsInPresentation = async (sourcePresentationId, socket) => {
    // get necessary credentials
    const credentials = await getCredentials(credsFilePath);

    const auth = new google.auth.GoogleAuth({
        credentials: credentials.google,
        scopes: [
            'https://www.googleapis.com/auth/presentations',
            'https://www.googleapis.com/auth/drive'
        ],
    });

    // copy existing google slides
    logme('copying: ' + sourcePresentationId, socket)
    const optimizedPresentation = await copyGoogleSlides(sourcePresentationId, auth); //returns new presentation

    logme('new presentation: ' + optimizedPresentation.data.presentationId, socket)


    // get all images from new google slides presentation
    const imagesArray = findAllImages(optimizedPresentation);
    logme('images array length: ' + imagesArray.length, socket);

    // repeat this step for every image
    for (const imageToReplace of imagesArray) {
        logme('image to replace: ' + imageToReplace.objectId, socket);

        const imageObjectId = imageToReplace.objectId;
        const originalImageUrl = imageToReplace.image.contentUrl;
        const tempImagePath = './gif/source/'+imageObjectId+'.gif';
        const newImagePath = './gif/output/'+imageObjectId+'.gif';

        // download the gif and save to disk
        await downloadImageToDisk(originalImageUrl, tempImagePath)

        //check if gif!
        const fileBuffer = await fs.readFileSync(tempImagePath);
        const fileType = await filetype.fromBuffer(fileBuffer);
        if (fileType.ext !== 'gif') continue; // skip this iteration if it's not a gif

        // log original filesize
        const fileStats = fs.statSync(tempImagePath);
        logme('original file size: ' + formatSizeUnits(fileStats.size), socket);

        // optimize gif
        await optimizeGif(tempImagePath, newImagePath, 200);

        // log new filesize & optimization %
        const newFileStats = fs.statSync(newImagePath);
        const optimizationPercentage = 100 - ((newFileStats.size / fileStats.size)*100);
        logme('new file size: ' + formatSizeUnits(newFileStats.size) + ', optimization: ' + Math.round(optimizationPercentage) + "%", socket);

        // check if optimization is more than threshold
        if (optimizationPercentage < 5) continue;

        // upload gif to s3 bucket
        const newImageUrl = await uploadImageToS3(newImagePath, credentials.aws.accessKeyId, credentials.aws.secretAccessKey, credentials.aws.bucket)
        logme('new image url: ' + newImageUrl, socket);

        //replace image URL in google slide
        await replaceImageInGoogleSlides(optimizedPresentation.data.presentationId, imageObjectId, newImageUrl, auth);
    }

    logme('https://docs.google.com/presentation/d/' + optimizedPresentation.data.presentationId, socket);
    //res.send('https://docs.google.com/presentation/d/' + optimizedPresentation.data.presentationId);

    return optimizedPresentation;
}


http.listen(port, () => {
    console.log(`Socket.IO server running at http://localhost:${port}/`);
});

