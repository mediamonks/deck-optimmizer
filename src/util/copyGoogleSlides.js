const {google} = require("googleapis");

module.exports = async function copyGoogleSlides(sourcePresentationId, oAuth2Client) {
    const slidesService = google.slides({version: 'v1', auth: oAuth2Client});
    const driveService = google.drive({version: 'v3', auth: oAuth2Client});

    const originalPresentation = await slidesService.presentations.get({presentationId: sourcePresentationId});

    const newPresentationId =  await new Promise((resolve) => {
        driveService.files.copy({
            fileId: originalPresentation.data.presentationId,
            supportsAllDrives: true,
            resource: {
                name: 'Optimized Copy of ' + originalPresentation.data.title,
            },
        }, (err, driveResponse) => {
            if (err) console.log(err)
            resolve(driveResponse.data.id);

        });
    })

    return await slidesService.presentations.get({ presentationId: newPresentationId });
}
