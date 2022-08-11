const fs = require("fs-extra");
const AWS = require("aws-sdk");
const path = require('path');
var scriptName = path.basename(__filename);

module.exports = async function uploadImageToS3( newImagePath, accessKeyId, secretAccessKey, bucket ) {
    const fileContent = fs.readFileSync(newImagePath);

    const s3 = new AWS.S3({
        accessKeyId,
        secretAccessKey
    });

    const params = {
        Bucket: bucket,
        Key: path.basename(newImagePath), // File name you want to save as in S3
        Body: fileContent
    };

    return await new Promise((resolve) => {
        s3.upload(params, function (err, data) {
            if (err) {
                throw err;
            }
            resolve(data.Location);
        });
    });
}
