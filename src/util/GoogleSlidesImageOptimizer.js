const {google} = require("googleapis");
const fs = require("fs-extra");
const AWS = require("aws-sdk");
const path = require("path");
const {OAuth2Client} = require('google-auth-library');
const getCredentials = require("./getCredentials");
const request = require('request');
const { resolve } = require("path");

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
        try {
            let res =  await this.slidesService.presentations.get({presentationId});
            return res
        } catch (e) {
            return e['response']['status']
        };
    }

    getSlideIdFromUrl(url) {
        let [_, url2] = url.split('https://docs.google.com/presentation/d/');
        let [id] = url2.split('/');
        return id;
    }

    async generateAccessToken() {
        const creds = await getCredentials('./creds.json');
        const client_id = creds['workato']['client_id'];
        const client_secret = creds['workato']['client_secret']

        let data = {
            grant_type: 'client_credentials',
            client_id: client_id,
            client_secret: client_secret,
        }

        let res = request.post({
            url: 'https://apim.workato.com/oauth2/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body:  JSON.stringify(data)
        }, function(error, response, body){
            if (response.statusCode == 200){
                let rawdata = fs.readFileSync('./creds.json');
                let creds = JSON.parse(rawdata);
                let bod = JSON.parse(body)
                creds['workato']['access_key'] = bod['access_token']
                let data = JSON.stringify(creds);
                fs.writeFileSync('./creds.json', data);
                return bod['access_token']
            }
        });

    };

    async copySlides(presentationId, email) {
        const originalFile = await this.slidesService.presentations.get({presentationId});
        const newName = "Optimized copy of " + originalFile.data.title;
        const creds = await getCredentials('./creds.json');
        let workato_token = creds['workato']['access_key']
        
        return await new Promise((resolve) => {
            let data = {file_id: presentationId, requester_email: email};
            let res = request.post({
                url: 'https://apim.workato.com/mediamonks_api/labs-deck-optimmizer-v1/copy-presentation',
                headers: {
                    'Authorization': 'Bearer ' + workato_token,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body:  JSON.stringify(data)
            }, function(error, response, body){
                if (response.statusCode != 200 ){
                    resolve(response.statusCode);
                } else {
                    let bod = JSON.parse(body)
                    resolve(bod['copy_file_id'])
                }        
            });
        });
    }


    async changeOwnership(presentationId, email, name){
        const creds = await getCredentials('./creds.json');
        let workato_token = creds['workato']['access_key'];
        return await new Promise((resolve) => {
            let res = request.post({
                url: 'https://apim.workato.com/mediamonks_api/labs-deck-optimmizer-v1/transfer-file-ownership',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Bearer ' + workato_token,
                },
                body:  JSON.stringify({file_id: presentationId, email:email, notification_text: "string", move_to_root: true, file_name: name})
            }, function(error, response, body){
                resolve(response.statusCode); 
            });
        });
    }

    async deleteSlides(id){
        const del = await new Promise((resolve) => {
            try{
                this.driveService.files.delete({
                    supportsTeamDrives: 'true',
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
                    if (pageElement.image && !pageElement.image.imageProperties['transparency']) elementsArray.push(pageElement);
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
        console.log(imagePropertiesObj);

        let requests = [{
            updateImageProperties: {
                objectId: imageObjectId,
                imageProperties: imagePropertiesObj,
                fields: 'outline, link'
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