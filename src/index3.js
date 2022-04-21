const {google} = require('googleapis');

const getDriveFilePermissions = async (fileId, driveService) => {
    return await new Promise((resolve) => {
        driveService.permissions.list({
            fileId: fileId,
            supportsAllDrives: true
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

(async () => {
    const auth = new google.auth.GoogleAuth({
        keyFile: './deck-optimmizer-serviceaccount-creds.json',
        scopes: [
            'https://www.googleapis.com/auth/presentations',
            'https://www.googleapis.com/auth/drive'
        ],
    });

    const slidesService = google.slides({version: 'v1', auth});
    const driveService = google.drive({version: 'v3', auth});

    const originalPresentationId = '1JRhJixy6U5JlzkgsVe-XP7K6zXClXSo1wm2gDW5_UVE'
    const originalPresentation = await slidesService.presentations.get({presentationId: originalPresentationId});
    const originalPresentationPermissions = await getDriveFilePermissions(originalPresentationId, driveService);

    console.log('original permissions', originalPresentationPermissions.permissions);


    const copiedPresentation = await copyDriveFile(originalPresentationId, 'Copy of ' + originalPresentation.data.title, driveService);
    const copiedPresentationPermissions = await getDriveFilePermissions(copiedPresentation.id, driveService);
    console.log('copied file permissions', copiedPresentationPermissions.permissions)


    const permissionsRequest1 = {
        // id: '01382900577287461994',
        type: 'user',
        kind: 'drive#permission',
        role: 'writer'
    }

    const updatedDriveFilePermissions = await createDriveFilePermissions(copiedPresentation.id, permissionsRequest1, driveService)

    const copiedPresentationPermissions2 = await getDriveFilePermissions(copiedPresentation.id, driveService);
    console.log('copied file permissions 2', copiedPresentationPermissions2.permissions)

})();
