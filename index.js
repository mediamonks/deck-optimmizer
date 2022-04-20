const fs = require('fs-extra');
const {google} = require('googleapis');
const getOAuth2Client = require('./util/getOAuth2Client');
const axios = require('axios');
const AWS = require('aws-sdk');
const {execFile} = require('child_process');
const gifsicle = require('gifsicle');
const inquirer = require('inquirer');
const filetype = require('file-type-cjs');

const sourcePresentationId = '1PLKS9xHHszj6Go8E2kaWd0kQFVYk16LNd3_NeQe5vY8';

function formatSizeUnits(bytes){
    if      (bytes >= 1073741824) { bytes = (bytes / 1073741824).toFixed(2) + " GB"; }
    else if (bytes >= 1048576)    { bytes = (bytes / 1048576).toFixed(2) + " MB"; }
    else if (bytes >= 1024)       { bytes = (bytes / 1024).toFixed(2) + " KB"; }
    else if (bytes > 1)           { bytes = bytes + " bytes"; }
    else if (bytes === 1)          { bytes = bytes + " byte"; }
    else                          { bytes = "0 bytes"; }
    return bytes;
}

(async () => {
    // set up the slides/drive API services
    const credentials = await fs.readJson('./creds/credentials.json');
    const oAuth2Client = await getOAuth2Client(credentials);
    const slidesService = google.slides({version: 'v1', auth: oAuth2Client});
    const driveService = google.drive({version: 'v3', auth: oAuth2Client});


    //copy the existing presentation
    const originalPresentation = await slidesService.presentations.get({presentationId: sourcePresentationId});

    console.log('copying', originalPresentation.data.title, 'with id', originalPresentation.data.presentationId)

    const presentationId = await new Promise((resolve) => {
        driveService.files.copy({
            fileId: originalPresentation.data.presentationId,
            supportsAllDrives: true,
            resource: {
                name: 'Optimized Copy of ' + originalPresentation.data.title,
            },
        }, (err, driveResponse) => {
            if (err) console.log(err)
            resolve(driveResponse.data.id);
        });
    })

    // load new presentation
    const slidesData = await slidesService.presentations.get({presentationId});
    console.log('slides length', slidesData.data.slides.length)

    const imagesArray = [];
    slidesData.data.slides.forEach(slide => {
        if (slide.hasOwnProperty('pageElements')) {
            slide.pageElements.forEach(pageElement => {
                if (pageElement.image) imagesArray.push(pageElement);
            });
        }
    })

    console.log('images array length', imagesArray.length)

    for (const imageToReplace of imagesArray) {
        console.log('image to replace', imageToReplace.objectId);

        const originalImageUrl = imageToReplace.image.contentUrl;
        const imageObjectId = imageToReplace.objectId;
        const imageReplaceMethod = 'CENTER_INSIDE';

        // download the gif
        const originalImageFile = await axios({
            url: originalImageUrl,
            method: 'GET',
            responseType: 'stream'
        })

        // write gif to disk
        const tempImagePath = './gif/source/'+imageObjectId+'.gif';
        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(tempImagePath)
            originalImageFile.data.pipe(writer)
            writer.on('finish', resolve)
            writer.on('error', reject)
        })

        const fileBuffer = await fs.readFileSync(tempImagePath);
        const fileType = await filetype.fromBuffer(fileBuffer);

        // check if gif
        if (fileType.ext !== 'gif') {
            console.log('not a gif, deleting');
            fs.unlinkSync(tempImagePath);
            continue; // skip
        }

        // log original filesize
        const fileStats = fs.statSync(tempImagePath);
        console.log('original file size', formatSizeUnits(fileStats.size));

        // optimize gif
        const newImagePath = './gif/output/'+imageObjectId+'.gif';
        await new Promise((resolve) => {
            execFile(gifsicle, [ // http://www.lcdf.org/gifsicle/man.html
                '--lossy=200',
                '-o', newImagePath,
                tempImagePath], (error, stdout) => {

                if (error) {
                    throw error;
                }

                resolve(stdout);
            });
        });

        // log new filesize & optimization %
        const newFileStats = fs.statSync(newImagePath);
        const optimizationPercentage = 100 - ((newFileStats.size / fileStats.size)*100);
        console.log('new file size', formatSizeUnits(newFileStats.size), ', optimization', Math.round(optimizationPercentage), "%");

        // check if optimization is more than threshold
        if (optimizationPercentage < 5) {
            console.log('barely any optimization')
            continue;

            // const question = await inquirer.prompt({
            //     type: 'confirm',
            //     name: 'skip',
            //     message: 'Skip this one?'
            // });
            //
            // if (question.skip) {
            //     continue; //skip
            // } else {
            //     console.log('not skipping')
            // }
        }

        // upload gif to s3 bucket
        const fileContent = fs.readFileSync(newImagePath);
        const s3 = new AWS.S3({
            accessKeyId: credentials.aws.accessKeyId,
            secretAccessKey: credentials.aws.secretAccessKey
        });

        const params = {
            Bucket: credentials.aws.bucket,
            Key: imageObjectId+'.gif', // File name you want to save as in S3
            Body: fileContent
        };

        const newImageUrl = await new Promise((resolve) => {
            s3.upload(params, function (err, data) {
                if (err) {
                    throw err;
                }
                resolve(data.Location);
            });
        });

        console.log('new image url', newImageUrl);

        // replace image URL in slides
        let requests = [{
            replaceImage: {
                imageObjectId: imageObjectId,
                imageReplaceMethod: imageReplaceMethod,
                url: newImageUrl
            }
        }];

        const imgUpdateRequest = await new Promise(resolve => {
            try {
                slidesService.presentations.batchUpdate({
                    presentationId,
                    resource: {requests},
                }, (err, response) => {
                    if (err) {
                        throw err;
                    }

                    resolve(response);
                });
            } catch (e) {
                console.log(e);
            }
        })
        console.log('result', imgUpdateRequest.statusText);
    }

})();