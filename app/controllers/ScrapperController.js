const request = require('request');
const cheerio = require('cheerio');
const ObjectsToCsv = require('objects-to-csv')
const fs = require('fs');
const csvTransform = require('csv-to-array');
const axios = require('axios')

module.exports =  {

async getOffers(req,res) {
    let page;
    if(!req.params.page){page=1}
    page = req.body.page;
    console.log("page:",page)
    let results = [];

    for(let z = 1; z<=page; z++){
        request(`https://www.filmweb.pl/films/search?orderBy=popularity&descending=true&page=${z}`, async (err,response,html)=>{
            if(err){res.status(400).json(err)}
            if(response.statusCode==200){
                //res.status(200).json(html)
                const $ = cheerio.load(html);
                $('.filmPreviewHolder').each(async (i,el)=>{
    
                    //get movie title
                    const filmTitle = $(el).find('h2');
                    const title = filmTitle.text();    
    
                    //get movie eng_title
                    const filmOrgTitle = $(el).find('.filmPreview__originalTitle');
                    const orgtitle = filmOrgTitle.text();
    
                    //get movie year
                    const filmYear = $(el).find('.filmPreview__year');
                    const year = filmYear.text();
    
                    //get movie rate
                    const filmRate = $(el).find('.rateBox__rate');
                    const rate = filmRate.text();
    
                    let movieGenre;
                    //get movie genre
                    $(el).find('.filmPreview__info--genres > ul').each(async(x,item)=>{
                        let genres = []
                        $(item).find('li > h3 > a').each(async (y,gen)=>{
                            let genre = $(gen).text();
                            genres.push(genre);
                        })
                        movieGenre = genres;
                    })
                    
                    let movieDirector;
                    //get movie director
                    $(el).find('.filmPreview__info--directors > ul').each(async(x,item)=>{
                        let directors = []
                        $(item).find('li > h3 > a').each(async (y,gen)=>{
                            let dir = $(gen).text();
                            directors.push(dir);
                        })
                        movieDirector = directors;
                    })

                    //get movie url
                    let link = $(el).find('.filmPreview__link').attr('href');
                    // let production = "-";
                    // await getProd(link).then(async(response)=>{
                    //     production = await response
                    // }).then(async()=>{
                    // })

                    let movie = await {
                        title: await title,
                        origTitle: await orgtitle,
                        year:await year,
                        rating:await rate,
                        genre:await movieGenre,
                        director: await movieDirector,
                        movieDetailsURL: await link,
                        
                    }

                    results.push(movie);

                })
                console.log("z",z)
                if(z==page){
                    const csv = await new ObjectsToCsv(results)
                    await csv.toDisk('./list.csv')
                    await console.log(results.length)
                    await res.status(200).json(results)
                }
            }
        })
    }

},

async getOffers2(req,res) {
    let page = await req.body.page;
    console.log("page:",page)
    let results = [];

    for(let z = 1; z<=page; z++){
        console.log("iteration:",z);
        const html = await axios.get(`https://www.filmweb.pl/films/search?orderBy=popularity&descending=true&page=${z}`);
        const $ = await cheerio.load(html.data);
        let data = [];
        let iteration = 0;
        
        await $('.filmPreviewHolder').each((i, elem) => {

            let movie =  {
                title:  $(elem).find('h2').text(),
                origTitle:  $(elem).find('.filmPreview__originalTitle').text(),
                filmYear:  $(elem).find('.filmPreview__year').text(),
                filmRate:  $(elem).find('.rateBox__rate').text(),
                movieGenre: findGenres(elem),
                movieDirector: findDirectors(elem),
                movieDetailsURL: $(elem).find('.filmPreview__link').attr('href'),
                // desc: getMovieDetails($(elem).find('.filmPreview__link').attr('href'))
            }

            data.push(movie)
            iteration ++;
        });

        for(let k=0;k<data.length;k++){
            const html = await axios.get(`https://www.filmweb.pl${data[k].movieDetailsURL}`)
            const $ = await cheerio.load(html.data);
            let details = await {
                description:  await $('.filmPosterSection__container').find('.filmPosterSection__plot').text(),
                production :  await getProd($),
                crew: await getCrew($),
                budget: await getBudget($),
                studio: await getStudios($),
                basedOn: await getBase($)
                // filmRate:  $(elem).find('.rateBox__rate').text(),
                // movieGenre: findGenres(elem),
                // movieDirector: findDirectors(elem),
                // movieDetailsURL: $(elem).find('.filmPreview__link').attr('href')
            }
            data[k].details = await details
            results.push(...data);
        }
}
const resultsToReturn = [...new Set(results)]
res.status(200).json({allCount:resultsToReturn.length,results:resultsToReturn})

},

}

const getCrew = async (data) => {   
    const $ = data;
    let crew =  []
    $('.personRole__container').each((x,item)=>{
        let actor = $(item).find('.personRole__person').text().trim();
        let role = $(item).find('.personRole__role').text().trim();
        let CrewItem = {actor:actor,role:role}
        crew.push(CrewItem);
    })
    return crew
}


const getProd = async (data) => {   
    const $ = data;
    let productions =  []
    $('.filmPosterSection__info .filmInfo__info > span').each((x,item)=>{
        let itemFound = $(item).find('a').attr('href')
        let itemFoundText = $(item).find('a').text();
        const regex = new RegExp("^\\/films\\/search\\?countries=\\d*$", );
        if(regex.test(itemFound) == true){
            productions.push(itemFoundText);
        }
    })
    console.log(productions)
    return productions
}

const getBase= async (data) => {   
    const $ = data;
    let foundData = []
    $('.filmInfo__info').each((x,item)=>{
        let itemPerson = $(item).find('.originalMaterials > a').text().trim();
        let itemFoundText = $(item).find('.originalMaterials').text().trim();
        if((itemPerson!="")&&(itemFoundText!="")){
            foundData.push({person:itemPerson,item:itemFoundText})
        }
    })
    return foundData
}

const getBudget = async (data) => {   
    const $ = data;
    let budgets = []
    $('.filmInfo__info').each((x,item)=>{
        let itemFound = $(item).text()
        if(itemFound.indexOf("$")!=-1){
            budgets.push(itemFound)
        }
    })
    return budgets
}

const getStudios = async (data) => {   
    const $ = data;
    let studios = []
    $('.filmInfo__info').each((x,item)=>{
        let itemFound = $(item).text()
        if(itemFound.indexOf("przedstawia")!=-1){
            studios.push(itemFound)
        }
    })
    return studios
}
        
const findGenres = (elem)=>{
    const $ =  cheerio.load(elem);
    let genres =  []
    $('.filmPreview__info--genres > ul').each((x,item)=>{
        $(item).find('li > h3 > a').each((y,gen)=>{
            let genre =  $(gen).text();
             genres.push(genre);
        })
    })
    console.log(genres)
    return genres;
}

const findDirectors = (elem)=>{
    const $ =  cheerio.load(elem);
    let directors = []
    $('.filmPreview__info--directors > ul').each((x,item)=>{
        $(item).find('li > h3 > a').each((y,gen)=>{
            let dir = $(gen).text();
            directors.push(dir);
        })
    })
    console.log(directors)
    return directors;
}



const getMovieDetails = async (url) => {
    console.log(url)
    const html = await axios.get(`https://www.filmweb.pl${url}`)
    const $ = await cheerio.load(html.data);
    let details = {
        desc:  await $('.filmPosterSection__container').find('.filmPosterSection__plot').text(),
        // origTitle:  $(elem).find('.filmPreview__originalTitle').text(),
        // filmYear:  $(elem).find('.filmPreview__year').text(),
        // filmRate:  $(elem).find('.rateBox__rate').text(),
        // movieGenre: findGenres(elem),
        // movieDirector: findDirectors(elem),
        // movieDetailsURL: $(elem).find('.filmPreview__link').attr('href')
    }
    
    await console.log(details)
    return details
}
