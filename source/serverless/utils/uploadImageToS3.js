const fs = require("fs");
const AWS = require("aws-sdk");
const path = require('path');
// var scriptName = path.basename(__filename);

module.exports = async function uploadImageToS3( filePath, Key ) {
    const bucket = process.env.BUCKET;
    const fileContent = fs.readFileSync(filePath);

    const s3 = new AWS.S3({
        accessKeyId: process.env.ACCESSKEYID,
        secretAccessKey: process.env.SECRETACCESSKEY
    });

    const params = {
        Bucket: bucket,
        //Key: `data/${deckId}/${objectId}_optimized.gif`, // File name you want to save as in S3
        Key,
        Body: fileContent
    };

    return await new Promise((resolve) => {
        s3.upload(params, function (err, data) {
            if (err) {
                throw err;
            }
            resolve(data.Key);
        });
    });
}
