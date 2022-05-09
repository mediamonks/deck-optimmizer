const {execFile} = require("child_process");
const gifsicle = require("gifsicle");

module.exports = async function optimizeGif( sourceImagePath, outputImagePath, optimizeLevel = 30 , cropLine = '') {
    // http://www.lcdf.org/gifsicle/man.html

    const optimizationArray = [];

    console.log(cropLine)

    // apply desired level of lossiness
    optimizationArray.push('--lossy='+optimizeLevel.toString());

    // apply desired crop
    optimizationArray.push('--crop='+cropLine.toString());

    // TO DO apply desired FPS

    return new Promise((resolve) => {
        execFile(gifsicle, [
            ...optimizationArray,
            '-o', outputImagePath,
            sourceImagePath
        ], (error, stdout) => {

            if (error) {
                throw error;
            }

            resolve(stdout);
        });
    });
}
