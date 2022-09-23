const {execFile} = require("child_process");
const gifsicle = require("gifsicle");
const fs = require('fs');
const path = require("path");

module.exports = async function optimizeGif(sourceImagePath, outputImagePath, options) {
    // http://www.lcdf.org/gifsicle/man.html
    const { factor, colourRange, cropLine, resizeLine } = options;

    const optimizationArray = [];

    // apply desired level of lossiness
    if (factor) optimizationArray.push(`--lossy=${factor.toString()}`);

    // apply color correction
    if (colourRange) optimizationArray.push(`--colors=${colourRange.toString()}`);

    // apply desired crop if necessary
    if (cropLine && cropLine !== '') optimizationArray.push(`--crop=${cropLine.toString()}`);

    // apply desired size if necessary
    if (resizeLine && resizeLine !== '') optimizationArray.push(`--resize=${resizeLine.toString()}`);

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
