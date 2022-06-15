const {execFile} = require("child_process");
const gifsicle = require("gifsicle");

module.exports = async function optimizeGif( sourceImagePath, outputImagePath, applyLossy, factor, applyColourCorrect, colourRange, adjustFrameRate, frameRate ) {
    // http://www.lcdf.org/gifsicle/man.html

    const optimizationArray = [];


    if (applyLossy) {
        // apply desired level of lossiness
        optimizationArray.push('--lossy='+factor.toString());
        console.log('lossy applied');
    };
    
    if (applyColourCorrect) {
        // apply color correction
        optimizationArray.push('--colors='+colourRange.toString());
        console.log('color correction applied');
    };


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
