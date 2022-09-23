const {google} = require("googleapis");
const fs = require("fs-extra");
const AWS = require("aws-sdk");
const path = require("path");
const {OAuth2Client} = require('google-auth-library'); // todo: remove dependency on this and use googleapis instead
const request = require('request'); // todo: remove dependency on this outdated package and use axios instead
const axios = require("axios");

class GoogleSlidesOptimizer {

    constructor (credentials) {
        this.credentials = credentials;

        // google auth
        this.googleAuth = new google.auth.GoogleAuth({
            credentials: this.credentials.google,
            scopes: [
                'https://www.googleapis.com/auth/presentations',
                'https://www.googleapis.com/auth/drive'
            ],
        });
        this.slidesService = google.slides({version: 'v1', auth: this.googleAuth});
        this.authClient = new OAuth2Client(this.credentials.google.client_id);

        //aws
        this.s3 = new AWS.S3({
            accessKeyId: this.credentials.aws.accessKeyId,
            secretAccessKey: this.credentials.aws.secretAccessKey
        });
        this.bucket = this.credentials.aws.bucket;

    }

    async generateAccessToken() {
        // generates workato access token
        const url = 'https://apim.workato.com/oauth2/token';
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        let data = {
            grant_type: 'client_credentials',
            client_id: this.credentials.workato.client_id,
            client_secret: this.credentials.workato.client_secret,
        }

        const result = await axios.post(url, data, { headers })

        return result.data.access_token;
    };

    async verifyToken(token){
        // verifies google token
        return this.authClient.verifyIdToken({
            idToken: token,
            audience: this.credentials.google.client_id,
        });
    }

    getSlideIdFromUrl(url) {
        let [_, url2] = url.split('https://docs.google.com/presentation/d/');
        let [id] = url2.split('/');
        return id;
    }

    async getSlides(presentationId) {
        try {
            let res =  await this.slidesService.presentations.get({presentationId});
            return res
        } catch (e) {
            return e['response']['status']
        };
    }

    async copySlides(presentationId, email) {
        const token = await this.generateAccessToken();

        return await new Promise((resolve) => {
            let data = {file_id: presentationId, requester_email: email};

            request.post({ // todo: change to axios request
                url: 'https://apim.workato.com/mediamonks_prod/labs-deck-optimmizer-v1/copy-presentation',

                headers: {
                    'Authorization': 'Bearer ' + token,
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


    async changeOwnership(presentationId, email, name, gif_count, reduction){
        const token = await this.generateAccessToken();
        return await new Promise((resolve) => {
            request.post({ // todo: change to axios request
                url: 'https://apim.workato.com/mediamonks_prod/labs-deck-optimmizer-v1/transfer-file-ownership',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Bearer ' + token,
                },
                body:  JSON.stringify({file_id: presentationId, email:email, notification_text: "string", move_to_root: true, file_name: name, analytics_gif_count:gif_count, analytics_filesize_reduction: reduction})
            }, function(error, response, body){
                resolve(response.statusCode);
            });
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

    async uploadFileToS3(filePath, slidesId) {
        const fileContent = fs.readFileSync(filePath);
        const params = {
            Bucket: this.bucket,
            Key: `data/${slidesId}/${path.basename(filePath)}`, // File name you want to save as in S3
            Body: fileContent
        };
        return await new Promise((resolve) => {
            this.s3.upload(params, function (err, data) {
                if (err) {
                    throw err;
                }
                resolve(data.key);
            });
        });
    }

    async batchReplaceImageUrl(presentationId, replaceRequests) {
        const imageReplaceMethod = 'CENTER_CROP'; // CENTER_INSIDE or CENTER_CROP

        let requests = replaceRequests.map(replaceRequest => {
            return {
                replaceImage: {
                    imageObjectId: replaceRequest.id,
                    imageReplaceMethod: imageReplaceMethod,
                    url: replaceRequest.url
                }
            }
        })

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
                throw e;
            }
        })
    }
}

module.exports = GoogleSlidesOptimizer;