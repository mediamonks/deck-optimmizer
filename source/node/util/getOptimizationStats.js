const fs = require('fs');
const formatSizeUnits = require("./formatSizeUnits");

module.exports = async function(sourceFile, outputFile) {
    const sourceSize = fs.statSync(sourceFile).size;
    const outputSize = fs.statSync(outputFile).size;

    return {
        sourceSize,
        outputSize,
        optimizationSize: formatSizeUnits(sourceSize-outputSize),
        optimizationPercentage: 100 - ((outputSize / sourceSize) * 100)
    }
}