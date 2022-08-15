const fs = require("fs-extra");
const inquirer = require("inquirer");
const dotenv = require('dotenv');

module.exports = async function getCredentials( credsFilePath ) {
    let credentials;

    try {
        credentials = await fs.readJson(credsFilePath);
    } catch (e) {
        await dotenv.config();
        credentials = {
            'google': {
                client_email: process.env.CLIENT_EMAIL,
                private_key: '-----BEGIN PRIVATE KEY-----\n'+process.env.PRIVATE_KEY+'\n-----END PRIVATE KEY-----',
                client_id: process.env.CLIENT_ID
            },
            'aws': {
                accessKeyId: process.env.ACCESSKEYID,
                secretAccessKey: process.env.SECRETACCESSKEY,
                bucket: process.env.BUCKET
            },
            'workato': {
                client_id: process.env.WORKATO_CLIENT_ID,
                client_secret: process.env.WORKATO_CLIENT_SECRET
            }
        }
        await fs.writeJson(credsFilePath, credentials);
    }

    return credentials;
}
