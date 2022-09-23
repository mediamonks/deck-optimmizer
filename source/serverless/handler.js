'use strict';

module.exports.hello = async (event) => {

    return {
        statusCode: 200,
        body: JSON.stringify(
            {
                message: "Hello from Mirko's serverless function!",
                event: event
            },
            null,
            2
        ),
    };
};
