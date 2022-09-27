const app = require('express')();
const express = require('express');
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    pingInterval: 10000,
    pingTimeout: 30000
});
const util = require("util");
const path = require('path');
const packageJson = require('./package.json');
const probe = require('probe-image-size');

const GoogleSlidesOptimizer = require("./util/GoogleSlidesImageOptimizer");
const getCredentials = require("./util/getCredentials");
const formatSizeUnits = require("./util/formatSizeUnits");
const optimizeGifSls = require('./util/optimizeGifSls')
const getCropAndResizeLines = require("./util/getCropAndResizeLines")
const getObjectsInS3Bucket = require('./util/getObjectsInS3Bucket');

const port = process.env.PORT || 3000;
const log_stdout = process.stdout;

const toHref = (url, label) => '<a target="_blank" href="' + url + '">' + (label || url) + '</a>';

const getObjectIdFromS3Key = (key, deckId) => {
    // returns id 'g124586d1df0_0_12' from string like 'data/1XL7_Sg-aJDiEjGF4CIxpD_Z-driXg8_US0vLtOX9C58/g124586d1df0_0_12_optimized.gif'
    let [_, url2] = key.split(`data/${deckId}/`);
    let [id] = url2.split('_optimized');
    return id;
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

    const baseUrl = `https://deck-optimmizer.monks.tools/`;

    io.on('connection', async (socket) => {
        console.log('Socket connection established. Socket id: ' + socket.id)
        console.log(`Welcome to Deck Optimmizer ${packageJson.version}!`, socket);
        const credentials = await getCredentials();

        const slidesOptimizer = new GoogleSlidesOptimizer(credentials);

        socket.on('processDeck', async ({presentationId, token}) => {
            // makes a copy of the deck, finds+downloads all images, finds all gif images
            const tokenData = await slidesOptimizer.verifyToken(token)
            const payload = tokenData.getPayload()

            // copy source slides to new slides
            console.log(`Making a temporary copy of slides with ID ${presentationId}...`, socket)
            socket.emit('DisplayTxt', {txt: `Making a temporary copy of slides with ID ${presentationId}...`});
            let newSlidesId = await slidesOptimizer.copySlides(presentationId, payload['email'])

            if (newSlidesId === 500) {
                socket.emit('noAccess', {});
                return;
            }

            console.log(`Copied source slides to new presentation with ID: ${newSlidesId}`, socket)
            socket.emit('DisplayTxt', {txt: `Copied source slides to new presentation with ID: ${newSlidesId}`});

            // get all slides data
            const slidesData = await slidesOptimizer.getSlides(newSlidesId);

            // Fish out all the images in slides data
            const imageElements = slidesOptimizer.getImageElements(slidesData);
            console.log(`Found ${imageElements.length} images in slides..`, socket);

            // probe all image URLs and check which are GIFs
            let counter = 0;
            let gifElements = await Promise.all(imageElements.map(element => {
                return limit(async () => {
                    try {
                        const fileData = await probe(element.image.contentUrl);

                        counter += 1;
                        socket.emit('DisplayTxt', {txt: `Checked #${counter} of ${imageElements.length} images...`});

                        if (fileData.type === 'gif') {
                            return {
                                ...element,
                                fileData
                            };
                        } else {
                            return 'not a gif';
                        }
                    } catch (e) {
                        return 'not a gif';
                    }
                })
            }));

            gifElements = gifElements.filter(element => element !== 'not a gif');
            console.log(`Found ${gifElements.length} GIFs in slides..`, socket);
            socket.emit('DisplayTxt', {txt: `Found ${gifElements.length} GIFs in slides..`});

            let cumulativeSourceSize = 0;
            counter = 0;
            const gifs = await Promise.all(gifElements.map(element => {
                return limit(async () => {
                    const {
                        cropLine,
                        resizeLine
                    } = await getCropAndResizeLines(element.fileData.width, element.fileData.height, element);

                    const processedGif = await optimizeGifSls({
                        sourceUrl: element.image.contentUrl,
                        deckId: newSlidesId,
                        objectId: element.objectId,
                        suffix: 'source',
                        optimizeOptions: {
                            cropLine, resizeLine
                        }
                    }); // returns { url, ext, sourceSize, outputSize, optimizationSize, optimizationPercentage }

                    counter += 1;
                    socket.emit('DisplayTxt', {txt: `Processed #${counter} of ${gifElements.length} GIFs...`});

                    cumulativeSourceSize += processedGif.sourceSize;

                    return {
                        sourceElement: element,
                        source: processedGif
                    }
                })
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
        });

        socket.on('manualOptimizeSingleGif', async ({deckId, gifId, sourceUrl, factor, colourRange}) => {

            const processedGif = await optimizeGifSls({
                sourceUrl,
                deckId: deckId,
                objectId: gifId,
                suffix: 'optimized',
                optimizeOptions: {
                    factor, colourRange
                }
            }); // returns { url, ext, sourceSize, outputSize, optimizationSize, optimizationPercentage }

            socket.emit(`replaceGif`, {output: processedGif.url, gifId, stats: processedGif});
        });

        socket.on('autoOptimizeAll', async ({deckData, factor, colourRange}) => {
            // find out which gifs still need optimization. at this point some gifs may not have been optimized yet
            let unoptimizedGifsArray;
            const allGifsInBucketDir = await getObjectsInS3Bucket({Prefix: `data/${deckData.id}/`})
            if (allGifsInBucketDir.length > 0) {
                const optimizedGifs = allGifsInBucketDir.filter(gif => gif.Key.includes('_optimized'));
                const optimizedGifIds = optimizedGifs.map(gif => getObjectIdFromS3Key(gif.Key, deckData.id));
                unoptimizedGifsArray = deckData.gifs.filter(sourceGif => !optimizedGifIds.includes(sourceGif.sourceElement.objectId));
            } else {
                unoptimizedGifsArray = deckData.gifs; // do them all
            }

            console.log(`Found ${unoptimizedGifsArray.length} GIF images that have not been (manually) optimized yet, optimizing now..`, socket);

            let counter = 0;
            await Promise.all(unoptimizedGifsArray.map((element) => {
                return gifOptimizeLimit(async () => {

                    //optimize gif via serverless function
                    const optimizedGif = await optimizeGifSls({
                        sourceUrl: element.source.url,
                        deckId: deckData.id,
                        objectId: element.sourceElement.objectId,
                        suffix: 'optimized',
                        optimizeOptions: {
                            factor, colourRange
                        }
                    }); // returns { url, ext, sourceSize, outputSize, optimizationSize, optimizationPercentage }

                    counter += 1;
                    console.log(`# ${counter} of ${unoptimizedGifsArray.length}, Input: ${formatSizeUnits(optimizedGif.sourceSize)}, Output: ${formatSizeUnits(optimizedGif.outputSize)}, Optimization: ${Math.round(optimizedGif.optimizationPercentage)}%`, socket);
                });
            }));

            let allGifsInS3BucketArray = await getObjectsInS3Bucket({Prefix: `data/${deckData.id}/`})
            allGifsInS3BucketArray = allGifsInS3BucketArray.filter(gifObject => gifObject.Key.includes('_optimized'));

            let requestsArray = allGifsInS3BucketArray.map(gif => {
                return {
                    id: getObjectIdFromS3Key(gif.Key, deckData.id),
                    outputSize: gif.Size,
                    url: baseUrl + gif.Key
                }
            })

            const cumulativeOutputSize = requestsArray.reduce((totalFilesize, currentValue) => {
                totalFilesize += currentValue.outputSize;
                return totalFilesize;
            }, 0);

            // remove gifs that are > 50mb
            requestsArray = requestsArray.filter(optimizedGif => {
                if (optimizedGif.outputSize < 50000000) {
                    return optimizedGif;
                } else {
                    console.log(`Found a gif over 50mb: ${optimizedGif.id}, skipping upload (API does not allow files of this size).`, socket)
                }
            });

            console.log(`Sending request to Slides API to batch replace ${requestsArray.length} images...`, socket)
            const result = await slidesOptimizer.batchReplaceImageUrl(deckData.id, requestsArray);

            console.log(`Changing ownership of deck to ${deckData.owner}...`, socket)
            let ownership_res = await slidesOptimizer.changeOwnership(deckData.id, deckData.owner, deckData.name, requestsArray.length, deckData.cumulativeSourceSize - cumulativeOutputSize);

            socket.emit(`finishProcess`, {'link': 'https://docs.google.com/presentation/d/' + deckData.id});

            // TODO Clean up files on bucket

            console.log(`All done! Deck Optimmizer saved ${formatSizeUnits(deckData.cumulativeSourceSize - cumulativeOutputSize)} which is a ${Math.round(100 - ((cumulativeOutputSize / deckData.cumulativeSourceSize) * 100))}% reduction!`, socket);
            console.log(`New Presentation URL:<br>${toHref('https://docs.google.com/presentation/d/' + deckData.id)}`, socket);
        });
    });

    http.listen(port, () => {
        console.log(`Deck Optimmizer ${packageJson.version} - Server running at http://localhost:${port}/`);
    });
})();




