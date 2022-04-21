const {execFile} = require("child_process");
const gifsicle = require("gifsicle");

module.exports = async function optimizeGif( sourceImagePath, outputImagePath, optimizeLevel = 30 ) {
    return new Promise((resolve) => {
        execFile(gifsicle, [ // http://www.lcdf.org/gifsicle/man.html
            '--lossy='+optimizeLevel.toString(),
            '-o', outputImagePath,
            sourceImagePath], (error, stdout) => {

            if (error) {
                throw error;
            }

            resolve(stdout);
        });
    });
}
