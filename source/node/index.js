const app = require('express')();
const express = require('express');
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    pingInterval: 10000,
    pingTimeout: 30000
});
const util = require("util");
const path = require('path');
const fs = require("fs");
const sizeOf = util.promisify(require('image-size'))
const cliProgress = require('cli-progress');
const packageJson = require('./package.json');

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

function removeFilesAndDirectory(directory) {
    try {
        const filesArr = fs.readdirSync(directory);
        for (const file of filesArr) {
            fs.unlinkSync(path.resolve(path.join(directory, file)));
        }
        fs.rmdirSync(directory)
    } catch (e) {
        console.error(e);
    }
}

console.log = function (d, socket) {
    log_stdout.write(util.format(d) + '\n');
    if (socket) socket.emit('update message', {data: d});
};

app.use(express.static(path.join(__dirname, "/html/")));

app.use('/gif/source', express.static(path.join(__dirname, '/gif/source/')));
app.use('/gif/output', express.static(path.join(__dirname, '/gif/output/')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "/html/index.html"));
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
        console.log(`Welcome to Deck Optimmizer ${packageJson.version}!`, socket);
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

            if (newSlidesId === 500) {
                socket.emit('noAccess', {});
                return;
            }
            console.log('Copied source slides to new presentation with ID: ' + newSlidesId, socket)

            // get all slides data
            const slidesData = await slidesOptimizer.getSlides(newSlidesId);

            // Fish out all the images in slides data
            const imageElements = slidesOptimizer.getImageElements(slidesData);
            console.log(`Found ${imageElements.length} images in slides..`, socket);

            progressBar.start(imageElements.length, 0);

            let counter = 0;
            let cumulativeSourceSize = 0;
            const downloadedImages = await Promise.all(imageElements.map(element => {
                return limit(async () => {
                    const path = `${__dirname}/gif/source/${newSlidesId}/`;
                    const downloadedImage = await downloadImageToDisk(element.image.contentUrl, path, element.objectId);
                    cumulativeSourceSize += downloadedImage.size;

                    counter += 1;
                    progressBar.increment(1);
                    socket.emit('DisplayTxt', {txt: `Downloaded #${counter} of ${imageElements.length} images...`});

                    const localGifUrl = `gif/source/${newSlidesId}/${element.objectId}.gif`;

                    if (downloadedImage.ext === 'gif') {
                        return {
                            ...element,
                            source: localGifUrl,
                            output: localGifUrl,
                            path: downloadedImage.path,
                            fileSize: downloadedImage.size
                        }
                    } else {
                        fs.unlinkSync(downloadedImage.path); // get rid of image if not gif
                        return 'not a gif';
                    }
                });
            }))

            const gifs = downloadedImages.filter(deckImage => deckImage !== 'not a gif');

            counter = 0;
            // apply initial crop/resize, which has to be done anyway
            await Promise.all(gifs.map(gif => {
                return gifOptimizeLimit(async () => {
                    const {cropLine, resizeLine} = await getCropAndResizeLines(gif.path, gif);
                    await optimizeGif(gif.path, gif.path, {cropLine, resizeLine});
                    counter+=1;
                    socket.emit('DisplayTxt', {txt: `Cropped/Resized #${counter} of ${gifs.length} images...`});
                });
            }))

            if (socket) {
                socket.emit('TriggerDisplayOptions', "");

                socket.emit('DisplayGif', {
                    name: "Optimized copy of " + slidesData.data.title.match(/\|(.*)\|/).pop(),
                    owner: payload['email'],
                    id: newSlidesId,
                    cumulativeSourceSize,
                    gifs
                });
            }

            progressBar.stop();
        });


        socket.on('manualOptimizeSingleGif', async (props) => {
            const {deckId, gifId, factor, colourRange} = props;

            const sourceImagePath = `${__dirname}/gif/source/${deckId}/${gifId}.gif`;
            const outputImagePath = `${__dirname}/gif/output/${deckId}/${gifId}_optimized.gif`;

            await optimizeGif(sourceImagePath, outputImagePath, {factor, colourRange});
            const stats = await getOptimizationStats(sourceImagePath, outputImagePath)

            socket.emit(`replaceGif`, {output: `gif/output/${deckId}/${gifId}_optimized.gif`, stats});
        });


        socket.on('autoOptimizeAll', async (props) => {
            let {deckData, factor, colourRange} = props;
            const cumulativeSourceSize = deckData.cumulativeSourceSize;
            let counter = 0;

            const sourceDir = `${__dirname}/gif/source/${deckData.id}/`;
            const outputDir = `${__dirname}/gif/output/${deckData.id}/`;

            // find out which gifs still need optimization. at this point some gifs may not have been optimized yet
            // so compare gifs in source folder vs _optimized gifs in output folder
            let unoptimizedGifsArray;
            if (fs.existsSync(outputDir)) {
                let optimizedGifsIds = fs.readdirSync(outputDir);
                optimizedGifsIds = optimizedGifsIds.map(optimizedGif => {
                    const [optimizedGifId] = optimizedGif.split(`_optimized.gif`);
                    return optimizedGifId;
                })

                unoptimizedGifsArray = deckData.gifs.filter(sourceGif => !optimizedGifsIds.includes(sourceGif.objectId));
                console.log(`Found ${unoptimizedGifsArray.length} GIF images that have not been (manually) optimized yet, optimizing now..`, socket);
            } else {
                unoptimizedGifsArray = deckData.gifs; // do them all
            }

            // optimize the remaining gifs with limited concurrency
            await Promise.all(unoptimizedGifsArray.map((element) => {
                return gifOptimizeLimit(async () => {
                    const sourceImagePath = `${sourceDir}/${element.objectId}.gif`;
                    const outputImagePath = `${outputDir}/${element.objectId}_optimized.gif`;

                    //optimize gif
                    await optimizeGif(sourceImagePath, outputImagePath, {factor, colourRange});
                    const stats = await getOptimizationStats(sourceImagePath, outputImagePath);

                    counter += 1;
                    console.log(`# ${counter} of ${unoptimizedGifsArray.length}, Input: ${formatSizeUnits(stats.sourceSize)}, Output: ${formatSizeUnits(stats.outputSize)}, Optimization: ${Math.round(stats.optimizationPercentage)}%`, socket);
                });
            }));

            let optimizedGifsArray = fs.readdirSync(outputDir);
            optimizedGifsArray = optimizedGifsArray.map(optimizedGif => {
                const [id] = optimizedGif.split(`_optimized.gif`);
                const outputImagePath = path.resolve(path.join(outputDir, optimizedGif));
                const outputSize = fs.statSync(outputImagePath).size;
                return {id, outputImagePath, outputSize}
            })

            const cumulativeOutputSize = optimizedGifsArray.reduce((totalFilesize, currentValue) => {
                totalFilesize += currentValue.outputSize;
                return totalFilesize;
            }, 0);

            console.log('totalFilesize = ' + cumulativeOutputSize);
            console.log(`optimizedGifsArray length ${optimizedGifsArray.length}`);

            // remove gifs that are > 50mb
            optimizedGifsArray = optimizedGifsArray.filter(optimizedGif => {
                if (optimizedGif.outputSize < 50000000) {
                    return optimizedGif;
                } else {
                    console.log(`Found a gif over 50mb: ${optimizedGif.id}, skipping upload (API does not allow files of this size).`, socket)
                }
            });

            // upload all to S3
            console.log(`Uploading ${optimizedGifsArray.length} images to s3 bucket...`, socket)
            let requestsArray = await Promise.all(optimizedGifsArray.map((optimizedGif) => {
                return limit(async () => {
                    //upload to s3
                    let uploadedGifUrl = await slidesOptimizer.uploadFileToS3(optimizedGif.outputImagePath);

                    return {
                        id: optimizedGif.id,
                        url: uploadedGifUrl
                    }
                });
            }));

            console.log(`Sending request to Slides API to batch replace ${requestsArray.length} images...`, socket)
            const result = await slidesOptimizer.batchReplaceImageUrl(deckData.id, requestsArray);

            console.log(`Changing ownership of deck to ${deckData.owner}...`, socket)
            let ownership_res = await slidesOptimizer.changeOwnership(deckData.id, deckData.owner, deckData.name, requestsArray.length, cumulativeSourceSize - cumulativeOutputSize);

            socket.emit(`finishProcess`, {'link': 'https://docs.google.com/presentation/d/' + deckData.id});

            // quick implementation of cleanup
            console.log(`Cleaning up files...`, socket);
            await removeFilesAndDirectory(sourceDir);
            await removeFilesAndDirectory(outputDir);

            console.log(`All done! Deck Optimmizer saved ${formatSizeUnits(cumulativeSourceSize - cumulativeOutputSize)} which is a ${Math.round(100 - ((cumulativeOutputSize / cumulativeSourceSize) * 100))}% reduction!`, socket);
            console.log(`New Presentation URL:<br>${toHref('https://docs.google.com/presentation/d/' + deckData.id)}`, socket);


        });


        socket.on('deleteGifs', async (props) => {
            const {deckId} = props;

            const sourceDir = `${__dirname}/gif/source/${deckId}/`;
            const outputDir = `${__dirname}/gif/output/${deckId}/`;

            // quick implementation of cleanup
            console.log(`Cleaning up files...`, socket);
            await removeFilesAndDirectory(sourceDir);
            await removeFilesAndDirectory(outputDir);
        });


    });


    http.listen(port, () => {
        console.log(`Deck Optimmizer - Server running at http://localhost:${port}/`);
    });

})();




