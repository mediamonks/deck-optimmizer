const util = require("util");
const sizeOf = util.promisify(require('image-size'))

module.exports = async function getCropAndResizeLines(sourceImagePath, element) {
    //check image dimensions
    let imgDimensions = await sizeOf(sourceImagePath);
    let imgWidth = imgDimensions.width;
    let imgHeight = imgDimensions.height;

    // set "trueScale", name I came up with for the actual scale when a image is 1:1 pixels in fullscreen presenting mode
    const trueScaleX = 190.5; // 381/2 and 381x25 = 9525
    const trueScaleY = 190.5;

    // determine what resolution the image is actually rendered at in the slide
    let renderedImgWidth = ((element.size.width.magnitude / 25) * element.transform.scaleX) / trueScaleX;
    let renderedImgHeight = ((element.size.height.magnitude / 25) * element.transform.scaleY) / trueScaleY;

    // declare resize/crop string to pass in the optimizeGif function
    let resizeLine = '';
    let cropLine = '';

    // //determine if resizing of the image is required (when a image is placed at 0.95 scale or lower)
    if (renderedImgWidth / imgWidth < 0.95 || renderedImgHeight / imgHeight < 0.95) {
        resizeLine = Math.round(renderedImgWidth) + 'x' + Math.round(renderedImgHeight);
    }

    if (element.image.imageProperties.hasOwnProperty('cropProperties')) {
        const cropProps = {
            leftOffset: 0, rightOffset: 0, topOffset: 0, bottomOffset: 0, // make sure all required props are in the object
            ...element.image.imageProperties.cropProperties // overwrite if necessary with props from google's object
        };

        // construct the cropLine to pass in the optimizeGif function
        let cropX1 = Math.round(cropProps.leftOffset * imgWidth);
        let cropY1 = Math.round(cropProps.topOffset * imgHeight);
        let cropX2 = Math.round(imgWidth - (cropProps.rightOffset * imgWidth));
        let cropY2 = Math.round(imgHeight - (cropProps.bottomOffset * imgHeight));

        // Address negative crop coords
        if ((parseInt(cropX1) < 0 || parseInt(cropY1)) < 0) {
            cropLine = ""
        } else {
            cropLine = cropX1 + ',' + cropY1 + '-' + cropX2 + ',' + cropY2;
        }

        // additional check to see if resize is actually needed by calculating the full rendered image dimensions, without crop
        let fullWidth = (renderedImgWidth / ((1 - (cropProps.leftOffset + cropProps.rightOffset)) * 100)) * 100;
        let fullHeight = (renderedImgHeight / ((1 - (cropProps.topOffset + cropProps.bottomOffset)) * 100)) * 100;
        console.log('Rendered image dimensions without crop: ' + Math.round(fullWidth) + 'x' + Math.round(fullHeight))

        if (fullWidth / imgWidth < 0.95 || fullHeight / imgHeight < 0.95) {

        } else {
            console.log('no resize required. uncropped image is not actually scaled down.')
            resizeLine = '';
        }
    }

    return {
        cropLine,
        resizeLine
    }
}