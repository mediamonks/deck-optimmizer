const axios = require("axios");
const fs = require("fs-extra");

module.exports = async function downloadImageToDisk( originalImageUrl, tempImagePath ) {

    // download the gif
    const originalImageFile = await axios({
        url: originalImageUrl,
        method: 'GET',
        responseType: 'stream'
    })

    // write gif to disk
    return await new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(tempImagePath)
        originalImageFile.data.pipe(writer)
        writer.on('finish', resolve)
        writer.on('error', reject)
    })
}
