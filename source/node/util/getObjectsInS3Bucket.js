const getCredentials = require("./getCredentials");
const AWS = require("aws-sdk");

module.exports = async function getObjectsInS3Bucket(props) {
    const { Prefix } = props;
    const credentials = await getCredentials();

    const s3 = new AWS.S3({
        accessKeyId: credentials.aws.accessKeyId,
        secretAccessKey: credentials.aws.secretAccessKey,
        region: 'eu-west-1',
    });

    const params = {
        Bucket: credentials.aws.bucket,
        Prefix,
    };

    return await new Promise( resolve => {
        s3.listObjectsV2(params, (err, data)=> {

            if (err) {
                console.log(err);
            }

            resolve(data.Contents);
            //
            // resolve( data.Contents.map(object => {
            //     return object.Key;
            // }))
        })
    })
}