const fs = require("fs-extra");
const filetype = require("file-type-cjs");

module.exports = async (filePath) => {
    const fileBuffer = await fs.readFileSync(filePath);
    const fileType = await filetype.fromBuffer(fileBuffer);
    return fileType.ext === 'gif'
}

