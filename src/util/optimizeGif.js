const {execFile} = require("child_process");
const gifsicle = require("gifsicle");

module.exports = async function optimizeGif( sourceImagePath, outputImagePath, optimizeLevel = 30 , cropLine = '', resizeLine  = '') {
    // http://www.lcdf.org/gifsicle/man.html

    const optimizationArray = [];

    console.log(cropLine);
    console.log(resizeLine);

    // apply desired level of lossiness
    optimizationArray.push('--lossy='+optimizeLevel.toString());

    // apply desired crop
    if (cropLine !== '') {
        optimizationArray.push('--crop='+cropLine.toString());
    }

    // apply desired size
    if (resizeLine !== '') {
        optimizationArray.push('--resize='+resizeLine.toString());
    }


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
