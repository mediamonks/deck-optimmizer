// app.js
const express = require('express')
const optimizeGifsInPresentation = require('./optimizeGifsInPresentation')

// Create Express app
const app = express()

// A sample route
app.get('/', async (req, res) => {

    const optimizedPresentation = await optimizeGifsInPresentation(req.query.presentationId)
    // https://docs.google.com/presentation/d/1LHYVob94CrKyNBP7BPza58I_Ul-7VqPrseciSuLxeiM
    console.log('done', 'https://docs.google.com/presentation/d/' + optimizedPresentation.data.presentationId)
    res.send('https://docs.google.com/presentation/d/' + optimizedPresentation.data.presentationId);
})

// Start the Express server
app.listen(4000, () => console.log('Server running on port 4000!'))
