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

    return new Promise((resolve) => {
        try{
            execFile(gifsicle, [
                ...optimizationArray,
                '-o', outputImagePath,
                sourceImagePath
            ], (error, stdout) => {

            if (error) {
                console.log(error);
            }
            resolve(stdout);
            return
            }).timeout(7500);
        } catch (error) {};
        
    });
}
