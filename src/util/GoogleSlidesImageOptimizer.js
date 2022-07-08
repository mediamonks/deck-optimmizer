const {google} = require("googleapis");
const fs = require("fs-extra");
const AWS = require("aws-sdk");
const path = require("path");
const {OAuth2Client} = require('google-auth-library');

class GoogleSlidesOptimizer {

    constructor (auth) {
        this.auth = new google.auth.GoogleAuth({
            credentials: auth.google,
            scopes: [
                'https://www.googleapis.com/auth/presentations',
                'https://www.googleapis.com/auth/drive'
            ],
        });

        this.s3 = new AWS.S3({
            accessKeyId: auth.aws.accessKeyId,
            secretAccessKey: auth.aws.secretAccessKey
        });

        this.bucket = auth.aws.bucket;
        this.clientId = auth.google['client_id']

        this.slidesService = google.slides({version: 'v1', auth: this.auth});
        this.driveService = google.drive({version: 'v3', auth: this.auth});
        this.authClient = new OAuth2Client(auth.google['client_id']);
    }

    async getSlides(presentationId) {
        return await this.slidesService.presentations.get({presentationId});
    }

    getSlideIdFromUrl(url) {
        let [_, url2] = url.split('https://docs.google.com/presentation/d/');
        let [id] = url2.split('/');
        return id;
    }

    async copySlides(presentationId) {
        try {
            const originalFile = await this.slidesService.presentations.get({presentationId});

            const newName = "Optimized copy of " + originalFile.data.title;

            const newFile = await new Promise((resolve) => {
                this.driveService.files.copy({
                    fileId: presentationId,
                    supportsAllDrives: true,
                    resource: {
                        name: newName,
                    },
                }, (err, driveResponse) => {
                    if (err) console.log(err)
                    resolve(driveResponse.data);
                });
            });

            const permission = { type: 'anyone', kind: 'drive#permission', role: 'writer' }

            await new Promise((resolve) => {
                this.driveService.permissions.create({
                    fileId: newFile.id,
                    supportsAllDrives: true,
                    resource: permission,
                }, (err, driveResponse) => {
                    if (err) console.log(err)
                    resolve(driveResponse.data);
                });
            })

            return newFile;

        } catch (e) {
            console.log(e)
        }
    }

    async changeOwnership(presentationId, targetUserEmail){
        try {
            const res = await new Promise((resolve) => {
                try{
                    this.driveService.permissions.list({
                        'fileId': presentationId
                    }, (err, driveResponse) => {
                        if (err) console.log(err)
                        resolve(driveResponse.data);
                    });
                } catch (error) {console.log(error)}
            });

            console.log(res['permissions']);

            // Iterate through permissions and make signed-in user the owner
            res['permissions'].forEach(permission => {
                if(permission['role'] == 'owner'){
                    
                    try {

                        this.driveService.permissions.create({
                            fileId: presentationId,
                            supportsAllDrives: true,
                            transferOwnership: true,
                            resource: {role: 'owner', type: 'user', pendingOwner: true, 'emailAddress': targetUserEmail},
                        });

                        // this.driveService.permissions.update({
                        //     'fileId': presentationId,
                        //     'permissionId': permission['id'],
                        //     'transferOwnership': true,
                        //     'resource': { 'role': 'owner'}
                        // });
                    } catch (err) { console.log(err)}

                }
            })
            

        } catch (e) {
            console.log(e)
        }
    }

    async deleteSlides(id){
        const del = await new Promise((resolve) => {
            try{
                this.driveService.files.delete({
                    supportsTeamDrives: 'false',
                    fileId: id
                }, (err, driveResponse) => {
                    if (err) console.log(err)
                    resolve();
                });
            } catch (error) {console.log(error)}
        });
    }

    getImageElements (slides) {
        const elementsArray = [];
        slides.data.slides.forEach(slide => {
            if (slide.hasOwnProperty('pageElements')) {
                slide.pageElements.forEach(pageElement => {
                    if (pageElement.image) elementsArray.push(pageElement);
                });
            }
        })
        return elementsArray;
    }

    async uploadFileToS3(filePath) {

        const fileContent = fs.readFileSync(filePath);

        const params = {
            Bucket: this.bucket,
            Key: path.basename(filePath), // File name you want to save as in S3
            Body: fileContent
        };

        return await new Promise((resolve) => {
            this.s3.upload(params, function (err, data) {
                if (err) {
                    throw err;
                }
                resolve(data.Location);
            });
        });

    }

    async replaceImageUrl(presentationId, imageObjectId, newImageUrl) {
        const imageReplaceMethod = 'CENTER_CROP'; // CENTER_INSIDE or CENTER_CROP

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
                this.slidesService.presentations.batchUpdate({
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

    async updateImageProperties(presentationId, imageObjectId, imagePropertiesObj) {

        console.log('updating image properties!')
        console.log(imagePropertiesObj);

        let requests = [{
            updateImageProperties: {
                objectId: imageObjectId,
                imageProperties: imagePropertiesObj,
                fields: 'cropProperties'
            }
        }];

        return await new Promise(resolve => {
            try {
                this.slidesService.presentations.batchUpdate({
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

    async checkIfGifStored(filePath) {
        const params = {
            Bucket: this.bucket,
            Key: path.basename(filePath), // File name you want to save as in S3
        };

        try {
            await this.s3.headObject(params).promise();
            return true;
        } catch (err) {
            console.log("File not Found ERROR : " + err.code);
            return false;
        };
    }

    async removeFileFromS3(filePath){
        const params = {
            Bucket: this.bucket,
            Key: path.basename(filePath), // File name you want to save as in S3
        };

        try {
            await this.s3.deleteObject(params).promise();
            console.log('Removed file from bucket');
        } catch (err) {
            console.log("File not Found ERROR : " + err.code);
        };
    }

    async verifyToken(token){
        const ticket = await this.authClient.verifyIdToken({
            idToken: token,
            audience: this.clientId, 
        });
        return ticket
    }

}

module.exports = GoogleSlidesOptimizer;