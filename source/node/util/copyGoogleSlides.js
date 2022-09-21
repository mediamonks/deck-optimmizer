const {google} = require("googleapis");

const getDriveFilePermissions = async (fileId, driveService) => {
    return await new Promise((resolve) => {
        driveService.permissions.list({
            fileId: fileId,
            supportsAllDrives: true,
            fields: '*'
        }, (err, driveResponse) => {
            if (err) console.log(err)
            resolve(driveResponse.data);
        });
    });
}

const copyDriveFile = async (fileId, newName, driveService) => {
    return await new Promise((resolve) => {
        driveService.files.copy({
            fileId: fileId,
            supportsAllDrives: true,
            includePermissionsForView: 'published',
            resource: {
                name: newName,
            },
        }, (err, driveResponse) => {
            if (err) console.log(err)
            resolve(driveResponse.data);
        });
    })
}

const createDriveFilePermissions = async (fileId, request, driveService) => {
    return await new Promise((resolve) => {
        driveService.permissions.create({
            fileId: fileId,
            supportsAllDrives: true,
            resource: request,
        }, (err, driveResponse) => {
            if (err) console.log(err)
            resolve(driveResponse.data);
        });
    })
}

module.exports = async function copyGoogleSlides(sourcePresentationId, auth) {
    const slidesService = google.slides({version: 'v1', auth});
    const driveService = google.drive({version: 'v3', auth});

    const originalPresentation = await slidesService.presentations.get({presentationId: sourcePresentationId});

    const newPresentation = await copyDriveFile(sourcePresentationId, 'Optimized Copy of ' + originalPresentation.data.title, driveService);

    const permission = { type: 'anyone', kind: 'drive#permission', role: 'writer' }
    await createDriveFilePermissions(newPresentation.id, permission, driveService);

    return await slidesService.presentations.get({ presentationId: newPresentation.id });
}
