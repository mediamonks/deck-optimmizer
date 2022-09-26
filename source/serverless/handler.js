'use strict';

const { v4: uuidv4 } = require('uuid');

const downloadImageToDisk = require('./utils/downloadImageToDisk');
const optimizeGif = require('./utils/optimizeGif');
const uploadImageToS3 = require('./utils/uploadImageToS3');
const getOptimizationStats = require('./utils/getOptimizationStats');

module.exports.optimize = async (props) => {
    const { sourceUrl, objectId, deckId, optimizeOptions } = props


    const bucket = process.env.BUCKET;
    const keyId = process.env.ACCESSKEYID;
    const keySecret = process.env.SECRETACCESSKEY;

    // return the results
    return {
        statusCode: 200,
        body: JSON.stringify(
            {
                message: `${bucket}, ${keyId}, ${keySecret}`
            },
            null,
            2
        ),
    };

    const tmpImgName = uuidv4();
    const tmpDir = `/tmp`;
    const outputImagePath = `${tmpDir}/${tmpImgName}_optimized.gif`;

    // first download the image
    const sourceImagePath = await downloadImageToDisk(sourceUrl, tmpDir, tmpImgName);

    // apply optimization
    await optimizeGif(sourceImagePath, outputImagePath, optimizeOptions)

    // upload optimized gif to s3 bucket
    const key = await uploadImageToS3(outputImagePath, deckId, objectId);

    const stats = await getOptimizationStats(sourceImagePath, outputImagePath)

    // return the results
    return {
        statusCode: 200,
        body: JSON.stringify(
            {
                ...stats,
                url: `https://deck-optimmizer.monks.tools/${key}`
            },
            null,
            2
        ),
    };
};