const app = require('express')();
const express = require('express');
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    pingInterval: 10000,
    pingTimeout: 30000
});
const util = require("util");
const fs = require("fs");
const sizeOf = util.promisify(require('image-size'))
const cliProgress = require('cli-progress');

const GoogleSlidesOptimizer = require("./util/GoogleSlidesImageOptimizer");
const getCredentials = require("./util/getCredentials");
const downloadImageToDisk = require("./util/downloadImageToDisk");
const formatSizeUnits = require("./util/formatSizeUnits");
const optimizeGif = require("./util/optimizeGif");
const cropGif = require("./util/cropGif");
const getOptimizationStats = require("./util/getOptimizationStats")
const getCropAndResizeLines = require("./util/getCropAndResizeLines")

const port = process.env.PORT || 3000;
const log_stdout = process.stdout;

const toHref = (url, label) => '<a target="_blank" href="' + url + '">' + (label || url) + '</a>';

console.log = function (d, socket) {
    log_stdout.write(util.format(d) + '\n');
    if (socket) socket.emit('update message', {data: d});
};

app.use(express.static(__dirname + '/html/'));
app.use('/gif', express.static(__dirname + '/html/gif/'));
app.use('/html/gif/', express.static(__dirname + '/html/gif/'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/html/index.html');
});


(async () => {
    // set up plimit
    const pLimit = await import('p-limit'); // using this ESM package to limit concurrency of promises
    const limit = pLimit.default(128); // set limit to 100 promises at a time
    const gifOptimizeLimit = pLimit.default(16); // smaller limit for the gif optimize

    // create a new progressbar
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

    io.on('connection', async (socket) => {
        console.log('Socket connection established. Socket id: ' + socket.id)
        const credentials = await getCredentials();
        const slidesOptimizer = new GoogleSlidesOptimizer(credentials);

        socket.on('processDeck', async ({presentationId, token}) => {
            // makes a copy of the deck, finds+downloads all images, finds all gif images
            const tokenData = await slidesOptimizer.verifyToken(token)
            const payload = tokenData.getPayload()

            // extract slides ID from string
            console.log('presentationId:' + presentationId)
            console.log(`Making a temporary copy of slides with ID ${presentationId}...`, socket)
            socket.emit('DisplayTxt', {txt: `Making a temporary copy of slides with ID ${presentationId}...`});

            // copy source slides to new slides
            let newSlidesId = await slidesOptimizer.copySlides(presentationId, payload['email'])
            console.log('Copied source slides to new presentation with ID: ' + newSlidesId, socket)

            // get all slides data
            const slidesData = await slidesOptimizer.getSlides(newSlidesId);

            // Fish out all the images in slides data
            const imageElements = slidesOptimizer.getImageElements(slidesData);
            console.log(`Found ${imageElements.length} images in slides..`, socket);

            progressBar.start(imageElements.length, 0);

            let counter = 0;
            const downloadedImages = await Promise.all(imageElements.map(element => {
                return limit(async () => {
                    const url = element.image.contentUrl;
                    const path = `${__dirname}/gif/source/${newSlidesId}/`;
                    const downloadedImage = await downloadImageToDisk(url, path, element.objectId);

                    counter += 1;
                    progressBar.increment(1);
                    socket.emit('DisplayTxt', {txt: `Downloaded #${counter} of ${imageElements.length} images...`});

                    if (downloadedImage.ext === 'gif') {
                        return {
                            ...element,
                            source: url,
                            output: url,
                        }
                    } else {
                        fs.unlinkSync(downloadedImage.path); // get rid of image if not gif
                        return 'not a gif';
                    }
                });
            }))

            const gifs = downloadedImages.filter(deckImage => deckImage !== 'not a gif');

            if (socket) {
                socket.emit('TriggerDisplayOptions', "");

                socket.emit('DisplayGif', {
                    name: "Optimized copy of " + slidesData.data.title.match(/\|(.*)\|/).pop(),
                    owner: payload['email'],
                    id: newSlidesId,
                    gifs
                });
            }

            progressBar.stop();
        });

        socket.on('autoOptimizeAll', async ({deckData, factor, colourRange}) => {
            console.log(`Applying automatic optimization to ${deckData.gifs.length} GIFs using ${factor} compression factor and limiting colors to ${colourRange}`, socket);
            let cumulativeSourceSize = 0, cumulativeOutputSize = 0, counter = 0;

            // optimize all gifs with limited concurrency
            let optimizedGifsArray = await Promise.all(deckData.gifs.map((element) => {
                return gifOptimizeLimit(async () => {
                    const sourceImagePath = `${__dirname}/gif/source/${deckData.id}/${element.objectId}.gif`;
                    const outputImagePath = `${__dirname}/gif/output/${deckData.id}/${element.objectId}_optimized.gif`;

                    const { cropLine, resizeLine } = await getCropAndResizeLines(sourceImagePath, element);

                    //optimize gif and remove source image after its done
                    await optimizeGif(sourceImagePath, outputImagePath, factor, colourRange, cropLine, resizeLine);
                    const stats = await getOptimizationStats(sourceImagePath, outputImagePath)
                    cumulativeSourceSize += stats.sourceSize;
                    cumulativeOutputSize += stats.outputSize;

                    counter+=1;
                    console.log(`# ${counter} of ${deckData.gifs.length}, Input: ${formatSizeUnits(stats.sourceSize)}, Output: ${formatSizeUnits(stats.outputSize)}, Optimization: ${Math.round(stats.optimizationPercentage)}%`, socket);

                    return {
                        id: element.objectId,
                        outputImagePath,
                        ...stats
                    }
                });
            }));

            // remove gifs that are > 50mb
            optimizedGifsArray = optimizedGifsArray.filter(optimizedGif => optimizedGif.outputSize < 50000000);

            // upload all to S3
            console.log(`Uploading ${optimizedGifsArray.length} images to s3 bucket...`, socket)
            let requestsArray = await Promise.all(optimizedGifsArray.map((element) => {
                return limit(async () => {
                    //upload to s3
                    let uploadedGifUrl = await slidesOptimizer.uploadFileToS3(element.outputImagePath);

                    return {
                        id: element.id,
                        url: uploadedGifUrl
                    }
                });
            }));

            console.log(`Sending request to Slides API to batch replace ${requestsArray.length} images...`, socket)
            const result = await slidesOptimizer.batchReplaceImageUrl(deckData.id, requestsArray);

            console.log(`Changing ownership of deck to ${deckData.owner}...`, socket)
            let ownership_res = await slidesOptimizer.changeOwnership(deckData.id, deckData.owner, deckData.name, requestsArray.length, cumulativeSourceSize-cumulativeOutputSize);

            socket.emit(`finishProcess`, {'link': 'https://docs.google.com/presentation/d/' + deckData.id});

            console.log(`All done! Deck Optimmizer saved ${formatSizeUnits(cumulativeSourceSize-cumulativeOutputSize)} which is a ${Math.round(100 - ((cumulativeOutputSize / cumulativeSourceSize) * 100))}% reduction!`, socket);
            console.log(`New Presentation URL:<br>${toHref('https://docs.google.com/presentation/d/' + deckData.id)}`, socket);
        });

        socket.on('deleteGifs', async msg => {
            let gifs = msg.gifIds;
            let dirname = __dirname;
            for (let id in gifs) {
                try {
                    if (fs.existsSync(dirname + '/gif/source/' + gifs[id] + '.gif')) {
                        await fs.unlinkSync(dirname + '/gif/source/' + gifs[id] + '.gif');
                    }
                    if (fs.existsSync(dirname + '/gif/output/' + gifs[id] + '_optimized.gif')) {
                        await fs.unlinkSync(dirname + '/gif/output/' + gifs[id] + '_optimized.gif');
                    }
                    if (fs.existsSync(dirname + '/html/gif/' + gifs[id] + '_optimized.gif')) {
                        await fs.unlinkSync(dirname + '/html/gif/' + gifs[id] + '_optimized.gif');
                    }
                } catch (e) {
                }
            }
        });

        socket.on('updateCopyDeck', async msg => {
            let dirname = __dirname;
            // get credentials, create if they don't exist
            const credentials = await getCredentials();

            // create new instance of class
            const slidesOptimizer = new GoogleSlidesOptimizer(credentials);

            //get original slides data
            const presentationId = msg.deckid;

            console.log('Presentation id:' + presentationId);

            // get all slides data
            const slidesData = await slidesOptimizer.getSlides(presentationId);

            // fish out all the images in slides data
            const imageElements = await slidesOptimizer.getImageElements(slidesData);

            let gifElements = Object.entries(msg.gifData).map(([key, value]) => {
                return imageElements.find(imageEl => imageEl.objectId === key);
            });

            let optimizedGifs = fs.readdirSync(dirname + '/html/gif/');

            let totalSourceSize = 0, outputSize = 0;

            // add everything into array of functions to run with limited concurrency
            const pLimit = await import('p-limit'); // using this ESM package to limit concurrency of promises
            const limit = pLimit.default(20); // set limit to 100 promises at a time

            const doEveryThing = async (element, index) => {
                let sourceImageId = element.objectId;
                let sourceSize, sourceImagePath, outputImagePath, outputImageStats;

                // Check if
                let match = optimizedGifs.some(e => e.includes(sourceImageId));

                if (match) {
                    sourceImagePath = dirname + '/gif/source/' + element.objectId + '.gif';
                    outputImagePath = dirname + '/gif/output/' + element.objectId + '_optimized.gif';
                    sourceSize = fs.statSync(sourceImagePath).size;
                } else {
                    console.log('not a match')
                    console.log(sourceImageId)
                    sourceImagePath = dirname + '/gif/source/' + element.objectId + '.gif';
                    outputImagePath = dirname + '/gif/output/' + element.objectId + '.gif';

                    sourceSize = fs.statSync(sourceImagePath).size;
                    // download image

                    fs.copyFileSync(sourceImagePath, outputImagePath);
                    outputImageStats = fs.statSync(outputImagePath);
                }

                totalSourceSize += sourceSize

                // Display source preview
                // let sourceUrl = element.image.contentUrl;

                //log current filesize
                let sourceImageStats = fs.statSync(sourceImagePath);

                //check image dimensions
                let imgDimensions = await sizeOf(sourceImagePath);
                let imgWidth = imgDimensions.width;
                let imgHeight = imgDimensions.height;

                // set "trueScale", name I came up with for the actual scale when a image is 1:1 pixels in fullscreen presenting mode
                const trueScaleX = 190.5; // 381/2 and 381x25 = 9525
                const trueScaleY = 190.5;

                // determine what resolution the image is actually rendered at in the slide
                let renderedImgWidth = ((element.size.width.magnitude / 25) * element.transform.scaleX) / trueScaleX;
                let renderedImgHeight = ((element.size.height.magnitude / 25) * element.transform.scaleY) / trueScaleY;

                // declare resize/crop string to pass in the optimizeGif function
                let resizeLine = '';
                let cropLine = '';

                // //determine if resizing of the image is required (when a image is placed at 0.95 scale or lower)
                if (renderedImgWidth / imgWidth < 0.95 || renderedImgHeight / imgHeight < 0.95) {
                    resizeLine = Math.round(renderedImgWidth) + 'x' + Math.round(renderedImgHeight);
                }

                if (element.image.imageProperties.hasOwnProperty('cropProperties')) {
                    const cropProps = {
                        leftOffset: 0, rightOffset: 0, topOffset: 0, bottomOffset: 0, // make sure all required props are in the object
                        ...element.image.imageProperties.cropProperties // overwrite if necessary with props from google's object
                    };

                    // construct the cropLine to pass in the optimizeGif function
                    let cropX1 = Math.round(cropProps.leftOffset * imgWidth);
                    let cropY1 = Math.round(cropProps.topOffset * imgHeight);
                    let cropX2 = Math.round(imgWidth - (cropProps.rightOffset * imgWidth));
                    let cropY2 = Math.round(imgHeight - (cropProps.bottomOffset * imgHeight));

                    // Address negative crop coords
                    if ((parseInt(cropX1) || parseInt(cropY1)) < 0) {
                        cropLine = ""
                    } else {
                        cropLine = cropX1 + ',' + cropY1 + '-' + cropX2 + ',' + cropY2;
                    }

                    // additional check to see if resize is actually needed by calculating the full rendered image dimensions, without crop
                    let fullWidth = (renderedImgWidth / ((1 - (cropProps.leftOffset + cropProps.rightOffset)) * 100)) * 100;
                    let fullHeight = (renderedImgHeight / ((1 - (cropProps.topOffset + cropProps.bottomOffset)) * 100)) * 100;
                    console.log('Rendered image dimensions without crop: ' + Math.round(fullWidth) + 'x' + Math.round(fullHeight))

                    if ((fullWidth / imgWidth < 0.95 || fullHeight / imgHeight < 0.95) && (cropLine != "")) {
                        try {
                            if (match) {
                                await cropGif(outputImagePath, outputImagePath, cropLine, resizeLine);
                            } else {
                                await cropGif(sourceImagePath, outputImagePath, cropLine, resizeLine);
                            }
                        } catch (error) {
                            console.log('err: ' + error);
                        }
                    }
                } else {
                    try {
                        if (match) {
                            await cropGif(outputImagePath, outputImagePath, cropLine, resizeLine);
                        } else {
                            await cropGif(sourceImagePath, outputImagePath, cropLine, resizeLine);
                        }
                    } catch (error) {
                    }
                }

                outputImageStats = fs.statSync(outputImagePath);

                //log optimized filesize
                let optimizationPercentage = 100 - ((outputImageStats.size / sourceImageStats.size) * 100);
                outputSize += outputImageStats.size;

                let uploadedGifUrl = await slidesOptimizer.uploadFileToS3(outputImagePath);

                //replace url in google slides
                if ((outputImageStats.size < 50000000) && (Math.round(optimizationPercentage) > 0)) {
                    try {
                        await slidesOptimizer.replaceImageUrl(presentationId, sourceImageId, uploadedGifUrl);
                    } catch (error) {
                        console.error(error);

                    }
                } else {
                }

                try {
                    await fs.unlinkSync(sourceImagePath);
                    await fs.unlinkSync(outputImagePath);
                    await fs.unlinkSync(dirname + '/src/gif/' + element.objectId + '_optimized.gif');

                } catch (e) {
                }
                ;
                if (Math.round(optimizationPercentage) > 0) {
                    console.log('#' + (index + 1) + ' of ' + gifElements.length + ', Input: ' + formatSizeUnits(sourceSize) + ', Output: ' + formatSizeUnits(outputImageStats.size) + ', Optimization: ' + Math.round(optimizationPercentage) + "%", socket);
                }
            }

            const listOfPromises = gifElements.map((gifElement, index) => {
                return limit(() => doEveryThing(gifElement, index));
            })

            await Promise.all(listOfPromises);
            //progressBar.stop();


            // log that it's done
            let filesize_reduction = totalSourceSize - outputSize
            console.log('Done. Total optimization: ' + formatSizeUnits(filesize_reduction), socket);

            let tokenData = await slidesOptimizer.verifyToken(msg.token)
            let payload = tokenData.getPayload()

            let newName = "Optimized copy of " + slidesData.data.title.match(/\|(.*)\|/).pop();

            // give permissions to target user
            let ownership_res = await slidesOptimizer.changeOwnership(presentationId, payload['email'], newName, gifElements.length, filesize_reduction);
            if (ownership_res != '200') {
                await slidesOptimizer.generateAccessToken();
                await slidesOptimizer.changeOwnership(presentationId, payload['email'], newName, gifElements.length, filesize_reduction);
            }
            socket.emit("finishProcess", {'link': 'https://docs.google.com/presentation/d/' + presentationId});
            console.log("New Presentation URL:<br>" + toHref('https://docs.google.com/presentation/d/' + presentationId), socket)
        });
    });


    http.listen(port, () => {
        console.log(`Deck Optimmizer - Server running at http://localhost:${port}/`);
    });

})();




