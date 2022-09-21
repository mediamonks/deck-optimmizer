const axios = require('axios');
const fs = require('fs');
const mime = require('mime');

module.exports = async (url) => {
    let resp = await axios.get(url, {
        responseType: 'stream'
    });
    const contentType = resp.headers['content-type'];
    return mime.getExtension(contentType) === 'gif';
}

