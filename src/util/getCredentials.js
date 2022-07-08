const fs = require("fs-extra");
const inquirer = require("inquirer");
module.exports = async function getCredentials( credsFilePath ) {
    let credentials;

    try {
        credentials = await fs.readJson(credsFilePath);
    } catch (e) {
        const google_questions = ['client_email', 'private_key', 'client_id'].map(question => {
            return {
                type: 'input',
                name: question,
                message: question
            }
        })

        const google_answers = await inquirer.prompt(google_questions);

        const aws_questions = ['accessKeyId', 'secretAccessKey', 'bucket'].map(question => {
            return {
                type: 'input',
                name: question,
                message: question
            }
        })


        const aws_answers = await inquirer.prompt(aws_questions);

        credentials = {
            'google': {
                client_email: google_answers.client_email,
                private_key: '-----BEGIN PRIVATE KEY-----\n'+google_answers.private_key+'\n-----END PRIVATE KEY-----',
                client_id: google_answers.client_id
            },
            'aws': {
                ...aws_answers
            }
        }
        await fs.writeJson(credsFilePath, credentials);
    }

    return credentials;
}
