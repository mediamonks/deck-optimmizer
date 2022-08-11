const {google} = require("googleapis");

module.exports = async function replaceImageInGoogleSlides(presentationId, imageObjectId, newImageUrl, auth) {
    const slidesService = google.slides({version: 'v1', auth});

    const imageReplaceMethod = 'CENTER_INSIDE';
    // replace image URL in slides
    let requests = [{
        replaceImage: {
            imageObjectId: imageObjectId,
            imageReplaceMethod: imageReplaceMethod,
            url: newImageUrl
        }
    }];

    return await new Promise(resolve => {
        try {
            slidesService.presentations.batchUpdate({
                presentationId,
                resource: {requests},
            }, (err, response) => {
                if (err) {
                    throw err;
                }

                resolve(response);
            });
        } catch (e) {
            console.log(e);
        }
    })
}
