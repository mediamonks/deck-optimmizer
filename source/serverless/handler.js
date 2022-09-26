'use strict';

const { v4: uuidv4 } = require('uuid');

const downloadImageToDisk = require('./utils/downloadImageToDisk');
const optimizeGif = require('./utils/optimizeGif');
const uploadImageToS3 = require('./utils/uploadImageToS3');
const getOptimizationStats = require('./utils/getOptimizationStats');

module.exports.optimize = async (props) => {
    const { sourceUrl, objectId, deckId, suffix, optimizeOptions } = props

    const tmpImgName = uuidv4();
    const tmpDir = `/tmp`;
    const outputImagePath = `${tmpDir}/${tmpImgName}_optimized.gif`;

    // first download the image
    const sourceImage = await downloadImageToDisk(sourceUrl, tmpDir, tmpImgName);

    // apply optimization
    await optimizeGif(sourceImage.path, outputImagePath, optimizeOptions)

    // upload optimized gif to s3 bucket
    const key = await uploadImageToS3(outputImagePath, `data/${deckId}/${objectId}_${suffix}.gif`);

    const stats = await getOptimizationStats(sourceImage.path, outputImagePath)

    // return the results
    return {
        statusCode: 200,
        body: {
            ...stats,
            ext: sourceImage.ext,
            url: `https://deck-optimmizer.monks.tools/${key}`
        },
    };
};