const axios = require("axios");
const fs = require("fs");
const mime = require('mime');
const path = require('path');

module.exports = async function downloadImageToDisk( url, downloadDir, filename) {
    // download the file
    const originalImageFile = await axios({
        url: url,
        method: 'GET',
        responseType: 'stream'
    })

    const contentType = originalImageFile.headers['content-type'];
    const extension = mime.getExtension(contentType)
    // const downloadPath = path.join(downloadDir, (`${filename}.${extension}`));

    const downloadPath = `/tmp/${filename}.gif`;

    await new Promise((resolve) => {
        const writer = fs.createWriteStream(downloadPath)
        originalImageFile.data.pipe(writer)
        writer.on('finish', resolve)
    })

    return {
        path: downloadPath,
        ext: extension
    };
}
