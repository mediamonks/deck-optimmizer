const {execFile} = require("child_process");
const gifsicle = require("gifsicle");
const fs = require('fs');
const path = require("path");

module.exports = async function optimizeGif(sourceImagePath, outputImagePath, factor = '50', colourRange = '256', cropLine = '', resizeLine = '') {
    // http://www.lcdf.org/gifsicle/man.html

    const optimizationArray = [];

    // apply desired level of lossiness
    optimizationArray.push('--lossy=' + factor.toString());

    // apply color correction
    optimizationArray.push('--colors=' + colourRange.toString());

    // apply desired crop if necessary
    if (cropLine !== '') {
        optimizationArray.push('--crop=' + cropLine.toString());
    }

    // apply desired size if necessary
    if (resizeLine !== '') {
        optimizationArray.push('--resize=' + resizeLine.toString());
    }

    if (!fs.existsSync(path.dirname(outputImagePath))) {
        fs.mkdirSync(path.dirname(outputImagePath)); // if the directory doesn't exist yet, create a new one
    }

    return new Promise((resolve) => {
        try {
            execFile(gifsicle, [
                ...optimizationArray,
                '-o', outputImagePath,
                sourceImagePath
            ], (error, stdout) => {
                resolve(stdout);
            });
        } catch (error) {
            console.log(error);
            resolve();
        }
    });
}
