const AWS = require ('aws-sdk');
const getCredentials = require("./getCredentials");

module.exports = async function optimizeGifSls(props) {
    const { sourceUrl, objectId, deckId, suffix, optimizeOptions } = props;
    const credentials = await getCredentials();

    const lambda = new AWS.Lambda({
        accessKeyId: credentials.aws.accessKeyId,
        secretAccessKey: credentials.aws.secretAccessKey,
        region: 'eu-west-1',
    });

    const params = {
        FunctionName: "arn:aws:lambda:eu-west-1:188419647749:function:deckoptimmizer-production-optimize:8",
        Payload: JSON.stringify({
            sourceUrl, objectId, deckId, suffix, optimizeOptions
        }),
    };

    const result = await invokeLambda(lambda, params);
    const responseObj = JSON.parse(result.Payload);
    return responseObj.body;
}

const invokeLambda = (lambda, params) => new Promise((resolve, reject) => {
    lambda.invoke(params, (error, data) => {
        if (error) {
            reject(error);
        } else {
            resolve(data);
        }
    });
});