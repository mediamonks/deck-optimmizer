const fs = require('fs-extra');
const filetype = require('file-type-cjs');
const inquirer = require('inquirer')

const getOAuth2Client = require('./util/getOAuth2Client');
const formatSizeUnits = require('./util/formatSizeUnits');
const copyGoogleSlides = require('./util/copyGoogleSlides')
const replaceImageInGoogleSlides = require('./util/replaceImageInGoogleSlides')
const uploadImageToS3 = require('./util/uploadImageToS3');
const optimizeGif = require('./util/optimizeGif');
const downloadImageToDisk = require('./util/downloadImageToDisk')
const getCredentials = require('./util/getCredentials')

//const sourcePresentationId = '1PLKS9xHHszj6Go8E2kaWd0kQFVYk16LNd3_NeQe5vY8';

function findAllImages(slidesData) {
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

module.exports = async function optimizeGifsInPresentation(sourcePresentationId) {
    // get necessary credentials
    const credsFilePath = './creds.json';
    const credentials = await getCredentials(credsFilePath);

    // get oAuth2 client
    const oAuth2Client = await getOAuth2Client(
        credentials.google.client_id,
        credentials.google.client_secret,
        credentials.google.redirect_uris[0],
        [
            'https://www.googleapis.com/auth/presentations',
            'https://www.googleapis.com/auth/drive'
        ]
    );



    // copy existing google slides
    console.log('copying', sourcePresentationId)
    const optimizedPresentation = await copyGoogleSlides(sourcePresentationId, oAuth2Client); //returns new presentation




    console.log('new presentation', optimizedPresentation.data.presentationId)
    console.log('presentation url', optimizedPresentation);

    // get all images from new google slides presentation
    const imagesArray = findAllImages(optimizedPresentation);
    console.log('images array length', imagesArray.length);

    // repeat this step for every image
    for (const imageToReplace of imagesArray) {
        console.log('image to replace', imageToReplace.objectId);

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
        console.log('original file size', formatSizeUnits(fileStats.size));

        // optimize gif
        await optimizeGif(tempImagePath, newImagePath, 200);

        // log new filesize & optimization %
        const newFileStats = fs.statSync(newImagePath);
        const optimizationPercentage = 100 - ((newFileStats.size / fileStats.size)*100);
        console.log('new file size', formatSizeUnits(newFileStats.size), ', optimization', Math.round(optimizationPercentage), "%");

        // check if optimization is more than threshold
        if (optimizationPercentage < 5) continue;

        // upload gif to s3 bucket
        const newImageUrl = await uploadImageToS3(newImagePath, credentials.aws.accessKeyId, credentials.aws.secretAccessKey, credentials.aws.bucket)
        console.log('new image url', newImageUrl);

        //replace image URL in google slide
        await replaceImageInGoogleSlides(optimizedPresentation.data.presentationId, imageObjectId, newImageUrl, oAuth2Client);
    }

    return optimizedPresentation;
}
