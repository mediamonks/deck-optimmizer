const fs = require("fs-extra");
const inquirer = require("inquirer");
module.exports = async function getCredentials( credsFilePath ) {
    let credentials;

    try {
        credentials = await fs.readJson(credsFilePath);
    } catch (e) {
        const questions = ['client_id', 'client_secret', 'redirect_uri', 'accessKeyId', 'secretAccessKey', 'bucket'].map(question => {
            return {
                type: 'input',
                name: question,
                message: question
            }
        })

        const answers = await inquirer.prompt(questions);

        credentials = {
            'google': {
                'client_id': answers.client_id,
                'client_secret': answers.client_secret,
                'redirect_uris': [
                    answers.redirect_uri
                ]
            },
            'aws': {
                'accessKeyId': answers.accessKeyId,
                'secretAccessKey': answers.secretAccessKey,
                'bucket': answers.bucket
            }
        }
        await fs.writeJson(credsFilePath, credentials);
    }

    return credentials;
}
