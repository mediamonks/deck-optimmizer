const {execFile} = require("child_process");
const gifsicle = require("gifsicle");

module.exports = async function cropGif(sourceImagePath, outputImagePath, cropLine, resizeLine) {
    const cropArray = [];
    console.log(cropLine);
    console.log(resizeLine);
    
    if (cropLine !== '') {
        cropArray.push('--crop='+cropLine.toString());
    }

    // apply desired size
    if (resizeLine !== '') {
        cropArray.push('--resize='+resizeLine.toString());
    }

    return await new Promise((resolve) => {
        execFile(gifsicle, [
            ...cropArray,
            '-o', outputImagePath,
            sourceImagePath
        ], (error, stdout) => {

            if (error) {
                console.log(error);
            }

        });
    });
};
