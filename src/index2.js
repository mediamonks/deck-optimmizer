const optimizeGifsInPresentation = require('./optimizeGifsInPresentation');

(async () => {
    console.log('starting..')
    const optimizedPresentation = await optimizeGifsInPresentation('1JRhJixy6U5JlzkgsVe-XP7K6zXClXSo1wm2gDW5_UVE');
    // https://docs.google.com/presentation/d/1LHYVob94CrKyNBP7BPza58I_Ul-7VqPrseciSuLxeiM
    console.log('done', 'https://docs.google.com/presentation/d/' + optimizedPresentation.data.presentationId)
})();


