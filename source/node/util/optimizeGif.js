const {execFile} = require("child_process");
const gifsicle = require("gifsicle");

module.exports = async function optimizeGif( sourceImagePath, outputImagePath, factor, colourRange) {
    // http://www.lcdf.org/gifsicle/man.html

    const optimizationArray = [];

    // apply desired level of lossiness
    optimizationArray.push('--lossy=' + factor.toString());


    // apply color correction
    optimizationArray.push('--colors=' + colourRange.toString());

    return new Promise((resolve) => {
        try{
            execFile(gifsicle, [
                ...optimizationArray,
                '-o', outputImagePath,
                sourceImagePath
            ], (error, stdout) => {
            resolve(stdout);
            });
        } catch (error) {
            resolve();
        };
    });
}
