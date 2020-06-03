const request = require('request');
const cheerio = require('cheerio');
const ObjectsToCsv = require('objects-to-csv')
const fs = require('fs');
const csvTransform = require('csv-to-array');
const axios = require('axios')
const sql = require("mssql")
const {configAzureDb, configAzureDbSimple} = require('../../config/azureDBOrig');
const {Connection} = require("tedious");
const Request = require('tedious').Request  
const TYPES = require('tedious').TYPES;  
const asynchronous = require("async");


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
            }
            data[k].details = await details
            results.push(...data);
        }
}

const resultsToReturn = [...new Set(results)]
fs.writeFile("output.json", JSON.stringify(resultsToReturn), 'utf8', function (err) {
    if (err) {
        console.log("An error occured while writing JSON Object to File.");
        return console.log(err);
    }
    console.log("JSON file has been saved.");
});
res.status(200).json({allCount:resultsToReturn.length,results:resultsToReturn})

},

async loadDB(req,res) {
const connection = makeConnection(configAzureDb)
// Attempt to connect and execute queries if connection goes through
connection.on("connect", err => {
    if (err) {
      res.status(400).json("error",err.message);
    } else {
        //dostuff
      res.status(200).json("connection succesfull")
    }
  });

},

async uploadActors(req,res) {
    let actorsList = []
    let actorListFinal = []
    let finalResponse;
    //load JSON
    await fs.readFile('output.json', async function(err, data) {
        let file = await JSON.parse(data);
        await file.forEach(async (file)=>{
            file.details.crew.forEach(async (el)=>{
                await actorsList.push(el);
            })
        })
        await actorsList.forEach(async (actor)=>{
        let actorData = await actor.actor.split(" ");
        await actorListFinal.push(`("${actorData[0]}","${actorData[1]}")`)
      })
        console.log(actorListFinal.length)
        let requestCount = await Math.ceil(actorListFinal.length/1000)
        for(let r=0; r<requestCount; r++){
            if(r==0){
                let test2 = await actorListFinal.slice(0,999).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Actor (actorName, actorSurname) OUTPUT INSERTED.actorId VALUES ${test5}`, function(err) {  
                            if (err) { 
                               console.log(err);}  
                           });
                           request.on('row', function(columns) {  
                               columns.forEach(function(column) {  
                                 if (column.value === null) {  
                                   console.log('NULL');  
                                 } else {  
                                   console.log("actorId of inserted item is " + column.value);  
                                 }  
                               });  
                           });       
                           connection.execSql(request)
                    }
                  });
            } else if (r==1){
                let test2 = await actorListFinal.slice(r*1000,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Actor (actorName, actorSurname) OUTPUT INSERTED.actorId VALUES ${test5}`, function(err) {  
                            if (err) { 
                               console.log(err);}  
                           });
                           request.on('row', function(columns) {  
                               columns.forEach(function(column) {  
                                 if (column.value === null) {  
                                   console.log('NULL');  
                                 } else {  
                                   console.log("actorId of inserted item is " + column.value);  
                                 }  
                               });  
                           });       
                           connection.execSql(request)
                    }
                  });
            }else {
                let test2 = await actorListFinal.slice(r*1000+1,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Actor (actorName, actorSurname) OUTPUT INSERTED.actorId VALUES ${test5}`, function(err) {  
                            if (err) { 
                               console.log(err);}  
                           });
                           request.on('row', function(columns) {  
                               columns.forEach(function(column) {  
                                 if (column.value === null) {  
                                   console.log('NULL');  
                                 } else {  
                                   console.log("actorId of inserted item is " + column.value);  
                                 }  
                               });  
                           });       
                           connection.execSql(request)
                    }
                  });
            }
        }
        await console.log("done")
    });
    
    },
async uploadRoles(req,res) {
    let actorsList = []
    let rolesListFinal = []
    let finalResponse;
    //load JSON
    await fs.readFile('output.json', async function(err, data) {
        let file = await JSON.parse(data);
        await file.forEach(async (file)=>{
            file.details.crew.forEach(async (el)=>{
                await actorsList.push(el);
            })
        })
        await actorsList.forEach(async (actor)=>{
        let roleData = await actor.role.split(" ");
        let roleName;
        let roleSurname;
        if(roleData[0]==undefined){roleName = "-"}
        if(roleData[1]==undefined){roleSurname = "-"}
        if(roleData[0]!=undefined){roleName = roleData[0].replace(/"/g,"'")}
        if(roleData[1]!=undefined){roleSurname = roleData[1].replace(/"/g,"'")}

        await rolesListFinal.push(`("${roleName.trim()}","${roleSurname.trim()}")`)
      })
        console.log(rolesListFinal.length)
        let requestCount = await Math.ceil(rolesListFinal.length/1000)
        for(let r=0; r<requestCount; r++){
            if(r==0){
                let test2 = await rolesListFinal.slice(0,999).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/'/g,"");
                let test5 = await test4.replace(/"/g,"'");
                let test6 = await test5.replace(/\\/g, " ");
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT MovieRole (roleName, roleSurname) OUTPUT INSERTED.roleId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("roleId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            } else if (r==1){
                let test2 = await rolesListFinal.slice(r*1000,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/'/g,"");
                let test5 = await test4.replace(/"/g,"'");
                let test6 = await test5.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT MovieRole (roleName, roleSurname) OUTPUT INSERTED.roleId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("roleId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }else {
                let test2 = await rolesListFinal.slice(r*1000+1,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/'/g,"");
                let test5 = await test4.replace(/"/g,"'");
                let test6 = await test5.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT MovieRole (roleName, roleSurname) OUTPUT INSERTED.roleId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("roleId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }
        }
    await console.log("done")
  });
},

async uploadBookAuthors(req,res) {
    let authorsList = []
    let authorsListFinal = []
    let finalResponse;
    //load JSON
    await fs.readFile('output.json', async function(err, data) {
        let file = await JSON.parse(data);
        await file.forEach(async (file)=>{
            file.details.basedOn.forEach(async (el)=>{
                await authorsList.push(el);
            })
        })
        await authorsList.forEach(async (author)=>{
        let authorData = await author.person.split(" ");
        let authorName;
        let authorSurname;
        if(authorData[0]==undefined){authorName = "-"}
        if(authorData[1]==undefined){authorSurname = "-"}
        if(authorData[0]!=undefined){authorName = authorData[0].replace(/"/g,"'")}
        if(authorData[1]!=undefined){authorSurname = authorData[1].replace(/"/g,"'")}

        await authorsListFinal.push(`("${authorName.trim()}","${authorSurname.trim()}")`)
      })
        console.log(authorsListFinal.length)
        let requestCount = await Math.ceil(authorsListFinal.length/1000)
        for(let r=0; r<requestCount; r++){
            if(r==0){
                let test2 = await authorsListFinal.slice(0,999).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/'/g,"");
                let test5 = await test4.replace(/"/g,"'");
                let test6 = await test5.replace(/\\/g, " ");
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Author (authorName, authorSurname) OUTPUT INSERTED.authorId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("authorId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            } else if (r==1){
                let test2 = await authorsListFinal.slice(r*1000,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/'/g,"");
                let test5 = await test4.replace(/"/g,"'");
                let test6 = await test5.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Author (authorName, authorSurname) OUTPUT INSERTED.authorId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("authorId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }else {
                let test2 = await authorsListFinal.slice(r*1000+1,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/'/g,"");
                let test5 = await test4.replace(/"/g,"'");
                let test6 = await test5.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Author (authorName, authorSurname) OUTPUT INSERTED.authorId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("authorId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }
        }
        await console.log("done")
    });
},

async uploadAuthorsBooks(req,res) {
    let authorsList = []
    let booksListFinal = []
    let finalResponse;
    //load JSON
    fs.readFile('output.json', async function(err, data) {
        let file = JSON.parse(data);
        file.forEach((file)=>{
            file.details.basedOn.forEach((el)=>{
                authorsList.push(el);
            })
        })
        authorsList.forEach((author)=>{
        let authorData = author.person.split(" ");
        let bookData = author.item.split("\"");
        let authorName;
        let authorSurname;
        if(authorData[0]==undefined){authorName = "-"}
        if(authorData[1]==undefined){authorSurname = "-"}
        if(authorData[0]!=undefined){authorName = authorData[0].replace(/"/g,"'")}
        if(authorData[1]!=undefined){authorSurname = authorData[1].replace(/"/g,"'")}
        booksListFinal.push({book:bookData,authorName:authorName,authorSurname:authorSurname});
        //console.log({book:bookData,authorName:authorName,authorSurname:authorSurname})
      })

        let booksListTotalFinal = []
        await sql.connect(configAzureDbSimple,async function(err){
        if(err) {console.log(err)}
        let sqlQuery = `select * from Author`
        console.log(sqlQuery)
        let sqlRequest = new sql.Request();
        await sqlRequest.query(sqlQuery,function(err,data){
            if(err){console.log(err)}
            const allAuthors = data.recordset;
            sql.close();
            booksListFinal.forEach(async(book)=>{
                let result = allAuthors.filter(author => (author.authorName == book.authorName) && (author.authorSurname == book.authorSurname));
                if(result){
                    try {
                        console.log(result[0].authorId)
                        let title;
                        if(book.book.length>1){
                            title = book.book[1]
                        } else {
                            title = book.book[0]
                        }
                        console.log(book.book)
                        booksListTotalFinal.push(`("${title}","${result[0].authorId}")`)
                    } catch (error) {
                        console.log(error)
                    }
                }
            })

        let requestCount = Math.ceil(booksListTotalFinal.length/1000)
        for(let r=0; r<requestCount; r++){
            if(r==0){
                let test2 = booksListTotalFinal.slice(0,999).join(",")
                let test3 = test2.replace(/'/g,"");
                let test4 = test3.replace(/'/g,"");
                let test5 = test4.replace(/"/g,"'");
                let test6 = test5.replace(/\\/g, " ");
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Book (bookTitle, authorId) OUTPUT INSERTED.bookId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("bookId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            } else if (r==1){
                let test2 = authorsListFinal.slice(r*1000,(r*1000)+1000).join(",")
                let test3 = test2.replace(/'/g,"");
                let test4 = test3.replace(/'/g,"");
                let test5 = test4.replace(/"/g,"'");
                let test6 = test5.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Book (bookTitle, authorId) OUTPUT INSERTED.bookId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("bookId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }else {
                let test2 = authorsListFinal.slice(r*1000+1,(r*1000)+1000).join(",")
                let test3 = test2.replace(/'/g,"");
                let test4 = test3.replace(/'/g,"");
                let test5 = test4.replace(/"/g,"'");
                let test6 = test5.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Book (bookTitle, authorId) OUTPUT INSERTED.bookId VALUES ${test6}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("bookId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }
        }
        console.log("done")
        })
        })

    })
},

async uploadMoviesFull(req,res) {
    let fullMoviesList = [];
    let fullDirectorsList = [];
    let fullAuthorsList = [];
    let fullBooksList = [];
    let fullStudiosList = [];
    let fullActorsList = [];
    let fullRolesList = [];
    let fullProductionCountryList = [];

    //get DirectorsData
    try {
        // make sure that any items are correctly URL encoded in the connection string
        await sql.connect(configAzureDbSimple)
        const result = await sql.query`select * from Director`
        fullDirectorsList = await result.recordset;
    } catch (err) {
        console.log(err)
    }

    //get AuthorsData
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from Author`
      fullAuthorsList = await result.recordset;
    } catch (err) {
        console.log(err)
    }

    //get ActorsData
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from Actor`
      fullActorsList = await result.recordset;
    } catch (err) {
        console.log(err)
    }

    //get RolesData
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from MovieRole`
      fullRolesList = await result.recordset;
    } catch (err) {
        console.log(err)
    }

    //get BooksData
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from Book`
      fullBooksList = await result.recordset;
    } catch (err) {
        console.log(err)
    }

    //get StudiosData
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from Studio`
      fullStudiosList = await result.recordset;
    } catch (err) {
        console.log(err)
    }

    //get ProductionCountry
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from ProductionCountry`
      fullProductionCountryList = await result.recordset;
    } catch (err) {
        console.log(err)
    }

    try {
      fs.readFile('output.json', async function(err, data) {
        let file = JSON.parse(data);
        file.forEach((file)=>{
          //movie title
          let title0 = file.title;
          let title = title0.replace(/\,/g,"");
          //movie originTitle
          let titleOrg0 = file.origTitle;
          let titleOrg = titleOrg0.replace(/\,/g,"");
          if(titleOrg==""){titleOrg="-"}
          //movieYear
          let year = file.filmYear;
          //movieRate = film.filmRate
          let rateo = file.filmRate;
          let rate = rateo.replace(/\,/g,"");
          //movieGenres
          let genres = file.movieGenre;
          //movieBio
          let biooo = file.details.description;
          let bio = biooo.replace(/\,/g,"");
          //movieWorldBudget
          let budgets = file.details.budget.toString().split("$");
          let worldBudget = budgets[1];
          let usaBudget = budgets[2];
          let other = budgets[3];

          //movieDirector
          let directorsListIndexes = []
          let uniqueDirectors = Array.from(new Set(fullDirectorsList.map(x => x.directorSurname))).map(directorSurnameLoop =>{
            return {
              directorSurname: directorSurnameLoop,
              id:fullDirectorsList.find(x => x.directorSurname == directorSurnameLoop).directorId,
              directorName:fullDirectorsList.find(x => x.directorSurname == directorSurnameLoop).directorName
            }
          })
          file.movieDirector.forEach((director)=>{
              let directorData = director.split(" ");
              let directorName;
              let directorSurname;
              if(directorData[0]==undefined){directorName = "-"}
              if(directorData[1]==undefined){directorSurname = "-"}
              if(directorData[0]!=undefined){directorName = directorData[0].replace(/"/g,"'")}
              if(directorData[1]!=undefined){directorSurname = directorData[1].replace(/"/g,"'")}
              let result = uniqueDirectors.filter(director => (director.directorName == directorName) && (director.directorSurname == directorSurname));
              if(result.length>0){
                directorsListIndexes.push(result[0].id);
              } else {
                directorsListIndexes.push("-");
              }

          });


          //movieproductionCountry
          let countryListIndexes = []
          file.details.production.forEach((prod)=>{
              let result = fullProductionCountryList.filter(productCount => (productCount.countryName == prod));
              if(result.length>0){
                countryListIndexes.push(result[0].countryId);
              } else {
                countryListIndexes.push("-");
              }
          });
          console.log(countryListIndexes)

        //movieStudio
        let studiosListIndexes = []
          file.details.studio.forEach((studio)=>{
          let studios = studio.split("/");
          studios.forEach((studEl)=>{
            if(studEl.includes("przedstawia")){
              //console.log(studEl)
              let name = studEl.replace("(przedstawia)","").trim();
              let result = fullStudiosList.filter(stud => (stud.studioName == name) && (stud.presenting == 1));
              //console.log(result)
              if(result.length>0){
                studiosListIndexes.push(result[0].studioID);
              }
            }
            if(studEl.includes("produkcja")){
              //console.log(studEl)
              let name = studEl.replace("(produkcja)","").trim();
              let result = fullStudiosList.filter(stud => (stud.studioName == name) && (stud.presenting == 1));
              //console.log(result)
              if(result.length>0){
                studiosListIndexes.push(result[0].studioID);
              }
            }
            });
      });

      //movieCrew
      let actorsListIndexes = []
      let rolesListIndexes = []
      file.details.crew.forEach((actor)=>{
      let actorData = actor.actor.split(" ");
      let actorRole = actor.role.split(" ");
      let actorName;
      let actorSurname;
      if(actorData[0]==undefined){actorName = "-"}
      if(actorData[1]==undefined){actorSurname = "-"}
      if(actorData[0]!=undefined){actorName = actorData[0].replace(/"/g,"'")}
      if(actorData[1]!=undefined){actorSurname = actorData[1].replace(/"/g,"'")}

      let roleName;
      let roleSurname;
      if(actorRole[0]==undefined){roleName = "-"}
      if(actorRole[1]==undefined){roleSurname = "-"}
      if(actorRole[0]!=undefined){roleName = actorRole[0].replace(/"/g,"'")}
      if(actorRole[1]!=undefined){roleSurname = actorRole[1].replace(/"/g,"'")}

      let result = fullActorsList.filter(act => (act.actorName == actorName) && (act.actorSurname == actorSurname));
      let resultRole = fullRolesList.filter(rol => (rol.roleName == roleName) && (rol.roleSurname == roleSurname));

      if(result.length>0){
        actorsListIndexes.push(result[0].actorId)
      } else {
        actorsListIndexes.push("-");
      }
      if(resultRole.length>0){
        rolesListIndexes.push(resultRole[0].roleId)
      } else {
        rolesListIndexes.push("-");
      }
    });

    //movieBook
    let booksListIndexes = []

    file.details.basedOn.forEach((book)=>{
        let bookData = book.item.split("\"");
        let bookTitle;
        if(bookData.length>1){
          bookTitle = bookData[1]
        } else {
          bookTitle = bookData[0]
        }

        let result = fullBooksList.filter(boo => (boo.bookTitle == bookTitle));
        if(result.length>0){
          booksListIndexes.push(result[0].bookId);
        } else {
          booksListIndexes.push("-");
        }
    });
    let gen = JSON.stringify(genres).replace(",",";")
    let dirs = JSON.stringify(directorsListIndexes).replace(",",";")
    let countrs = JSON.stringify(countryListIndexes).replace(",",";")
    let actrs = JSON.stringify(actorsListIndexes).replace(",",";")
    let stds = JSON.stringify(studiosListIndexes).replace(",",";")
    let bkks = JSON.stringify(booksListIndexes).replace(",",";")

    fullMoviesList.push(`("${title}","${titleOrg}","${year}","${rate}","${genres.join(";")}","${directorsListIndexes.join(";")}","${bio}","${countryListIndexes.join(";")}","${actorsListIndexes.join(";")}","${rolesListIndexes.join(";")}","${worldBudget}","${usaBudget}","${other}","${studiosListIndexes.join(";")}","${booksListIndexes.join(";")}")`)
        })
        let finalToUp = fullMoviesList.join(",")
        let test3 = finalToUp.replace(/\'/g,"");
        let test4 = test3.replace(/\'/g,"");
        let test5 = test4.replace(/\'/g,"");
        let test6 = test5.replace(/"/g,"'");
        let test7 = test6.replace(/\'Milionerów\'/g,"Milionerów");
        let test8 = test7.replace(/\'carpe diem\'/g,"carpe diem");
        let test9 = test8.replace(/\'Piotrusia Pana\'/g,"Piotrusia Pana");
        let test10 = test9.replace(/\'Jeziorze łabędzim\'/g,"Jeziorze łabędzim");
        let test11 = test10.replace(/\'robactwem\'/g,"Jeziorze łabędzim");

        const connection = makeConnection(configAzureDb)
        connection.on("connect", err => {
            if (err) {
              res.status(400).json("error",err.message);
            } else {
                  let request = new Request(`INSERT Movie (title,originalTitle,filmYear,filmRating,movieGenre,movieDirector,movieBio,production,crew,roles,worldBudget,usaBudget,outsideBudget,studio,basedOnBook) OUTPUT INSERTED.movieId VALUES ${test11}`, function(err) {  
                    if (err) { 
                        console.log(err);}  
                    });
                    request.on('row', function(columns) {  
                        columns.forEach(function(column) {  
                          if (column.value === null) {  
                            console.log('NULL');  
                          } else {  
                            console.log("movieId of inserted item is " + column.value);  
                          }  
                        });  
                    });       
                    connection.execSql(request)
            }
          });
        return res.json(test11)
    })
    } catch (error) {
      console.log(error)
  }
},
    
async uploadDirectors(req,res) {
  let directorsList = []
  let directorListFinal = []
  let finalResponse;
  //load JSON
  await fs.readFile('output.json', async function(err, data) {
      let file = await JSON.parse(data);
      await file.forEach(async (file)=>{
          file.movieDirector.forEach(async (el)=>{
              await directorsList.push(el);
          })
      })
      await directorsList.forEach(async (director)=>{
      let directorData = await director.split(" ");
      await directorListFinal.push(`("${directorData[0]}","${directorData[1]}")`)
    })
      console.log(directorListFinal.length)
      let requestCount = await Math.ceil(directorListFinal.length/1000)
      for(let r=0; r<requestCount; r++){
          if(r==0){
              let test2 = await directorListFinal.slice(0,999).join(",")
              let test3 = await test2.replace(/'/g,"");
              let test4 = await test3.replace(/"/g,"'");
              let test5 = await test4.replace(/\\/g, " ");
              const connection = makeConnection(configAzureDb)
              connection.on("connect", err => {
                  if (err) {
                    res.status(400).json("error",err.message);
                  } else {
                        let request = new Request(`INSERT Director (directorName, directorSurname) OUTPUT INSERTED.directorId VALUES ${test5}`, function(err) {  
                          if (err) { 
                              console.log(err);}  
                          });
                          request.on('row', function(columns) {  
                              columns.forEach(function(column) {  
                                if (column.value === null) {  
                                  console.log('NULL');  
                                } else {  
                                  console.log("directorId of inserted item is " + column.value);  
                                }  
                              });  
                          });       
                          connection.execSql(request)
                  }
                });
          } else if (r==1){
              let test2 = await directorListFinal.slice(r*1000,(r*1000)+1000).join(",")
              let test3 = await test2.replace(/'/g,"");
              let test4 = await test3.replace(/"/g,"'");
              let test5 = await test4.replace(/\\/g, " ");
              //return res.json(test5)
              const connection = makeConnection(configAzureDb)
              connection.on("connect", err => {
                  if (err) {
                    res.status(400).json("error",err.message);
                  } else {
                        let request = new Request(`INSERT Director (directorName, directorSurname) OUTPUT INSERTED.directorId VALUES ${test5}`, function(err) {  
                          if (err) { 
                              console.log(err);}  
                          });
                          request.on('row', function(columns) {  
                              columns.forEach(function(column) {  
                                if (column.value === null) {  
                                  console.log('NULL');  
                                } else {  
                                  console.log("directorId of inserted item is " + column.value);  
                                }  
                              });  
                          });       
                          connection.execSql(request)
                  }
                });
          }else {
              let test2 = await directorListFinal.slice(r*1000+1,(r*1000)+1000).join(",")
              let test3 = await test2.replace(/'/g,"");
              let test4 = await test3.replace(/"/g,"'");
              let test5 = await test4.replace(/\\/g, " ");
              //return res.json(test5)
              const connection = makeConnection(configAzureDb)
              connection.on("connect", err => {
                  if (err) {
                    res.status(400).json("error",err.message);
                  } else {
                        let request = new Request(`INSERT Director (directorName, directorSurname) OUTPUT INSERTED.directorId VALUES ${test5}`, function(err) {  
                          if (err) { 
                              console.log(err);}  
                          });
                          request.on('row', function(columns) {  
                              columns.forEach(function(column) {  
                                if (column.value === null) {  
                                  console.log('NULL');  
                                } else {  
                                  console.log("directorId of inserted item is " + column.value);  
                                }  
                              });  
                          });       
                          connection.execSql(request)
                  }
                });
          }
      }
      await console.log("done")
  });
  
},

async uploadStudios(req,res) {
    let studiosList = []
    let studiosListFinal = []
    let finalResponse;
    //load JSON
    await fs.readFile('output.json', async function(err, data) {
        let file = await JSON.parse(data);
        await file.forEach(async (file)=>{
            file.details.studio.forEach(async (el)=>{
                await studiosList.push(el);
            })
        })

        //["Castle Rock Entertainment (przedstawia)  /  Darkwoods Productions (produkcja)  /  Warner Bros."]
        await studiosList.forEach(async (studio)=>{
        let studioData = await studio.split("/");
        studioData.forEach(async(studioEl)=>{
            if(studioEl.toString().includes("przedstawia")){
                let studioName = studioEl.replace("(przedstawia)","").trim()
                await studiosListFinal.push(`("${studioName}","0","1")`)
            } 
            if(studioEl.toString().includes("produkcja")){
                let studioName = studioEl.replace("(produkcja)","").trim()
                await studiosListFinal.push(`("${studioName}","1","0")`)
            }  
            if(studioEl.toString().includes("Więcej...")){
                //do nothing
            } 
            if(!(studioEl.toString().includes("przedstawia"))&&!(studioEl.includes("produkcja"))&&!(studioEl.includes("Wiecej"))) {
                let studioName = studioEl.trim();
                await studiosListFinal.push(`("${studioName}","1","0")`)
            }

        })
      })
        console.log(studiosListFinal.length)
        let FinalStudioListUnique = [...new Set(studiosListFinal)]
        let requestCount = await Math.ceil(FinalStudioListUnique.length/1000)
        for(let r=0; r<requestCount; r++){
            if(r==0){
                let test2 = await FinalStudioListUnique.slice(0,999).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Studio (studioName, production, presenting) OUTPUT INSERTED.studioId VALUES ${test5}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("studioId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            } else if (r==1){
                let test2 = await FinalStudioListUnique.slice(r*1000,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Studio (studioName, production, presenting) OUTPUT INSERTED.studioId VALUES ${test5}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("studioId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }else {
                let test2 = await FinalStudioListUnique.slice(r*1000+1,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT Studio (studioName, production, presenting) OUTPUT INSERTED.studioId VALUES ${test5}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("studioId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }
        }
        await console.log("done")
    });
}, 
async uploadProductionCountry(req,res) {
    let productionList = []
    let productionListFinal = []
    let finalResponse;
    //load JSON
    await fs.readFile('output.json', async function(err, data) {
        let file = await JSON.parse(data);
        await file.forEach(async (file)=>{
            file.details.production.forEach(async (el)=>{
                await productionList.push(el);
            })
        })

        //["Castle Rock Entertainment (przedstawia)  /  Darkwoods Productions (produkcja)  /  Warner Bros."]
        await productionList.forEach(async (country)=>{
        await productionListFinal.push(`("${country}")`)

      })
        console.log(productionListFinal.length)
        let FinalCountriesListUnique = [...new Set(productionListFinal)]
        let requestCount = await Math.ceil(FinalCountriesListUnique.length/1000)
        for(let r=0; r<requestCount; r++){
            if(r==0){
                let test2 = await FinalCountriesListUnique.slice(0,999).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT ProductionCountry (countryName) OUTPUT INSERTED.countryId VALUES ${test5}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("countryId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            } else if (r==1){
                let test2 = await FinalCountriesListUnique.slice(r*1000,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT ProductionCountry (countryName) OUTPUT INSERTED.countryId VALUES ${test5}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("countryId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }else {
                let test2 = await FinalCountriesListUnique.slice(r*1000+1,(r*1000)+1000).join(",")
                let test3 = await test2.replace(/'/g,"");
                let test4 = await test3.replace(/"/g,"'");
                let test5 = await test4.replace(/\\/g, " ");
                //return res.json(test5)
                const connection = makeConnection(configAzureDb)
                connection.on("connect", err => {
                    if (err) {
                      res.status(400).json("error",err.message);
                    } else {
                          let request = new Request(`INSERT ProductionCountry (countryName) OUTPUT INSERTED.countryId VALUES ${test5}`, function(err) {  
                            if (err) { 
                                console.log(err);}  
                            });
                            request.on('row', function(columns) {  
                                columns.forEach(function(column) {  
                                  if (column.value === null) {  
                                    console.log('NULL');  
                                  } else {  
                                    console.log("countryId of inserted item is " + column.value);  
                                  }  
                                });  
                            });       
                            connection.execSql(request)
                    }
                  });
            }
        }
        await console.log("done")
    });
},        

async welcome(req,res) {
  
  res.render('index');

},

async allMoviesList(req,res) {
  
  //aggregate all movies
  let moviesList;
  try {
    // make sure that any items are correctly URL encoded in the connection string
    await sql.connect(configAzureDbSimple)
    const result = await sql.query`select * from Movie`
    moviesList = await result.recordset;
    console.log(moviesList)
  } catch (err) {
      console.log(err)
  }

  moviesList.forEach((movie)=>{
    //setup rating
    let getDigits = Array.from(movie.filmRating.toString(), Number);
    movie.filmRating = `${getDigits[0]}.${getDigits[1]}`

    //remove ; for , in genres
    let genres = movie.movieGenre.toString().split(";");
    movie.movieGenre = genres.join(",")

  })
  return res.render("allMovies",{moviesList})
},

async movieDetails(req,res) {
  let id = req.params.id
  console.log(id)
  //aggregate all movies
  let movie;
  try {
    // make sure that any items are correctly URL encoded in the connection string
    await sql.connect(configAzureDbSimple)
    const result = await sql.query`select * from Movie WHERE movieId = ${id}`
    movie = await result.recordset;
    console.log(movie[0].title)
  } catch (err) {
      console.log(err)
  }

  let moviePoster;
  //getPoster
  await axios.get(`http://www.omdbapi.com/?t=${movie[0].originalTitle}&apikey=553e1fb0`)
  .then(function (response) {
    // handle success
    movie[0].poster = response.data.Poster;
    console.log(response.data)
    console.log(movie[0].poster)
  })
  .catch(function (error) {
    // handle error
    console.log(error);
  })
  .finally(function () {

  });

  //setup rating
  let getDigits = Array.from(movie[0].filmRating.toString(), Number);
  movie[0].filmRating = `${getDigits[0]}.${getDigits[1]}`

  //remove ; for , in genres
  let genres = movie[0].movieGenre.toString().split(";");
  movie[0].movieGenre = genres.join(",")

  //get director
  try {
    // make sure that any items are correctly URL encoded in the connection string
    await sql.connect(configAzureDbSimple)
    const result = await sql.query`select * from Director WHERE directorId = ${movie[0].movieDirector}`
    let directorData = await result.recordset;
    movie[0].movieDirector = await `${directorData[0].directorName} ${directorData[0].directorSurname}`
  } catch (err) {
      console.log(err)
  }

  //get production
  try {
    // make sure that any items are correctly URL encoded in the connection string
    await sql.connect(configAzureDbSimple)
    const result = await sql.query`select * from ProductionCountry WHERE countryId = ${movie[0].production}`
    let production = await result.recordset;
    movie[0].production = await production[0].countryName
  } catch (err) {
      console.log(err)
  }


  //get studio
  try {
    // make sure that any items are correctly URL encoded in the connection string
    await sql.connect(configAzureDbSimple)
    const result = await sql.query`select * from Studio WHERE studioId = ${movie[0].studio}`
    let studioData = await result.recordset;
    console.log(studioData)
    movie[0].studio = await studioData[0].studioName
  } catch (err) {
      console.log(err)
  }

  //get book
  try {
    // make sure that any items are correctly URL encoded in the connection string
    await sql.connect(configAzureDbSimple)
    const result = await sql.query`select * from Book WHERE bookId = ${movie[0].basedOnBook}`
    let bookData = await result.recordset;
    console.log(bookData)
    //get book author
    let bookAuthor;
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from Author WHERE authorId = ${bookData[0].authorId}`
      let authorData = await result.recordset;
      console.log(authorData)
      bookAuthor = await `${authorData[0].authorName} ${authorData[0].authorSurname}`
    } catch (err) {
        console.log(err)
    }
    movie[0].basedOnBook = await `Autor: ${bookAuthor} | Dzieło: ${bookData[0].bookTitle}`
  } catch (err) {
      console.log(err)
  }

  let fullCrew = movie[0].crew.split(";")
  let fullCrewActors = [];

  for(let x =0; x<fullCrew.length; x++){
    try {
      // make sure that any items are correctly URL encoded in the connection string
      await sql.connect(configAzureDbSimple)
      const result = await sql.query`select * from Actor WHERE actorId = ${fullCrew[x]}`
      let actorData = await result.recordset;
      await fullCrewActors.push(actorData)
    } catch (err) {
        console.log(err)
    }
  }
 

  let fullRoles = movie[0].roles.split(";")
  fullCrewRoles = []

  for(let z=0; z<fullRoles.length; z++){
    if(fullRoles[z]=="-"){
      await fullCrewRoles.push("-")
    } else  {
      try {
        // make sure that any items are correctly URL encoded in the connection string
        await sql.connect(configAzureDbSimple)
        const result = await sql.query`select * from MovieRole WHERE roleId = ${fullRoles[z]}`
        let roleData = await result.recordset;
        //console.log(roleData)
        await fullCrewRoles.push(roleData)
      } catch (err) {
          console.log(err)
      }
    }
  }

  //console.log(fullCrewRoles)

  let CrewAndRolesList = [];
  let indexx = 0;
  fullCrewActors.forEach((act)=>{
    let actorD =  {
      actorName:  act[0].actorName,
      actorSurname: act[0].actorSurname,
      roleName:  fullCrewRoles[indexx][0].roleName,
      roleSurname: fullCrewRoles[indexx][0].roleSurname
    }
    CrewAndRolesList.push(actorD)
    indexx++;
  });

console.log(CrewAndRolesList)

return res.render("movieDetails",{movie:movie[0],crew:CrewAndRolesList})
 },

 async fiddle(req,res) {
  let queries = [];

  //GetMovieById
  let getMovieById = `CREATE PROCEDURE GetMovieById  
  @ID NUMERIC   
AS   

  SET NOCOUNT ON;  
  SELECT TOP 1 Movie.Title,Movie.originalTitle,Movie.movieBio,Movie.filmYear,Movie.filmRating, Director.directorName, Director.directorSurname, ProductionCountry.countryName, Book.bookTitle, Author.authorName, Author.authorSurname FROM Movie, Director, ProductionCountry, Book, Author WHERE Director.directorId = Movie.movieDirector AND ProductionCountry.countryId = Movie.production AND Book.bookId = Movie.basedOnBook AND Author.authorId = Book.authorId AND Movie.movieId = @ID
GO  `;

let exampleQueryResult;
try {
  // make sure that any items are correctly URL encoded in the connection string
  await sql.connect(configAzureDbSimple)
  const result = await sql.query`EXEC GetMovieById @ID=7`
  exampleQueryResult = await result.recordset;
  await queries.push({getMovieById:getMovieById, response:exampleQueryResult})
  console.log(exampleQueryResult)
} catch (err) {
    console.log(err)
}


//GetMovieActors
let getMovieActors = `CREATE PROCEDURE AggregateMovieActors
@ID NUMERIC   
AS   

SET NOCOUNT ON;  
SELECT Actor.actorName, Actor.actorSurname, Movie.Title,Movie.originalTitle,Movie.movieBio,Director.directorName, Director.directorSurname FROM Movie, Director, Actor WHERE Director.directorId = Movie.movieDirector AND  Movie.movieId = @ID AND Actor.actorId IN (SELECT value FROM STRING_SPLIT(Movie.crew, ';'));
GO  `;

let exampleQueryResult2;
try {
// make sure that any items are correctly URL encoded in the connection string
await sql.connect(configAzureDbSimple)
const result = await sql.query`EXEC AggregateMovieActors @ID=7`
exampleQueryResult2 = await result.recordset;
await queries.push({getMovieActors:getMovieActors, response:exampleQueryResult2})
console.log(exampleQueryResult)
} catch (err) {
  console.log(err)
}


//GetMovieRoles
let getMovieRoles = `CREATE PROCEDURE AggregateMovieRoles
@ID NUMERIC   
AS   

SET NOCOUNT ON;  
SELECT MovieRole.roleName, MovieRole.roleSurname, Movie.Title,Movie.originalTitle,Movie.movieBio,Director.directorName, Director.directorSurname FROM Movie, Director, MovieRole WHERE Director.directorId = Movie.movieDirector AND  Movie.movieId = @ID AND MovieRole.roleId IN (SELECT value FROM STRING_SPLIT(Movie.roles, ';'));
GO `;

let exampleQueryResult3;
try {
// make sure that any items are correctly URL encoded in the connection string
await sql.connect(configAzureDbSimple)
const result = await sql.query`EXEC AggregateMovieRoles @ID = 7`
exampleQueryResult3 = await result.recordset;
await queries.push({getMovieRoles:getMovieRoles, response:exampleQueryResult3})
console.log(exampleQueryResult)
} catch (err) {
  console.log(err)
}

let getOtherQueries = `/*1. Imie, nazwisko kilentów, którzy zamówili produkty do Alaski*/ 
SELECT customerName, customerSurname, Shipping_State
    FROM Shop
    WHERE Shipping_State LIKE 'Alaska';

/*2. Imie, nazwisko klientow, ktorzy zaplacili za produktu w przedziale 50-100*/
SELECT customerName, customerSurname, Retail_Price
    FROM Shop
    WHERE Retail_Price BETWEEN 50 AND 100;

/*3. Id, Imie, Nazwisko klienta, ktore nie koncza sie na litery z zakresu p-w*/
SELECT customerID, customerName, customerSurname
    FROM Shop
    WHERE RTRIM(customerSurname) LIKE '%[^p-w]';

/*4. Wyświetlic nazwiska klientow, ich dlugosc, imiona klientów, miejsce litery 'k'
w imionach;*/

SELECT customerSurname, 
    LEN(customerSurname) AS customerSurnameLength,
    customerName, CHARINDEX('k', customerSurname, 1) AS letterAindex
    FROM Shop;

/* 5. Wyswietlic id klietna, id transakcji, nazwę przedmiotu dla zakupów o kwocie mniejszej niz 70 zl i dyskoncie lojalnościowym powyżej 0,04 ;
wyswietlic obnizoną kwotę zakupów do do "okraglej liczby" (np. 17%
zamieniamy na 10%, 6% na 0% itp.) */

SELECT customerID, transactionId, ItemDescription, Loyalty_Discount, Retail_Price,
    FLOOR(Retail_Price/10)*10 AS NewRetail_Price
    FROM Shop
    WHERE Retail_Price < 70;

 /*6. Wyswietlic inicjaly klientow (w formacie pierwsza imienia kropka spacja pierwsza nazwiska)*/

SELECT customerID, customerName, customerSurname,
    SUBSTRING(customerName, 1, 1) + '. ' + ' ' + SUBSTRING(customerSurname, 1, 1) + '.' AS ClientInitials
    FROM Shop;


/* 7. Znalezc klientow, ktorych imie zaczynaja dwie te same litery, co w nazwisk */

SELECT customerID, customerName, customerSurname
    FROM Shop
    WHERE SUBSTRING(customerName, 1, 2) = SUBSTRING(customerSurname, 1, 2);

/* 8. Wyświetlic klientów, którzy zrobili zakupy w czasie 2013-12-13 2016-12-13 15:43:39.0000000*/

SELECT customerID, customerName, customerSurname
    FROM Shop
    WHERE YEAR([transactionDate]) LIKE '2016-12-13 15:08:52.0000000';

/* 9. Wyswietlic klientow, ktorzy zrobili zakupy w cenie powyzej 100 bez dyskontu lojalnosciowego */

SELECT customerID, customerName, customerSurname
    FROM Shop
    WHERE Retail_Price <100 AND Loyalty_Discount = 0;

/* 10. Wyswietlic klientkow, ktorzy zrobili zakupy w cenie ponizej 80 z dyskontem lojalnościowym powyzej 0,07 oraz i kupili plascz */

SELECT customerID, customerName, customerSurname, Retail_Price, Loyalty_Discount, ItemDescription
    FROM Shop
    WHERE Retail_Price < 80 AND Loyalty_Discount < 0.07 And ItemDescription LIKE 'COAT';



/* 11. Wyswietlić zamowienia do ktorych miast maja  maksymalną cenę zakupow w kolejności wg ID klienta*/
SELECT customerID, customerName, customerSurname, Retail_Price
    FROM Shop
    WHERE Retail_Price = (SELECT MAX(Retail_Price) FROM Shop)
    GROUP BY customerID, Retail_Price, customerName, customerSurname;


/* 12. Wyświetlić średnią cenę zakupów */

SELECT AVG(Retail_Price) AS MeanRetailPrice
    FROM Shop;

/* 13. Wyswietlic klientow, ktorzy zaplacili powyzej sredniej ceny zakupow wg kolejnosci dyskontu lojalnosciowego */

SELECT  customerName, customerSurname, AVG(Retail_Price) AS Retail_PriceMean, Loyalty_Discount
    FROM Shop
    GROUP BY Loyalty_Discount, customerName, customerSurname
    HAVING AVG(Retail_Price)>(SELECT AVG(Retail_Price) FROM Shop);

/* 14. Wyświetlić średni dyskont lojalnosciowy */

SELECT AVG(Loyalty_Discount) AS MeanLoyalty_Discount
    FROM Shop;

/* 15. Wyswietlić klientow, ktorzy zaplacili ponizej sredniego dyskontu lojalnosciowego w kolejnosci wg nazwiska klienta */

SELECT customerName, customerSurname, AVG(Loyalty_Discount) AS AboveMeanLoyalty_Discount
    FROm Shop
    GROUP BY customerSurname, customerName
    HAVING AVG(Loyalty_Discount)>(SELECT AVG(Loyalty_Discount) FROM Shop);

/* 16. Wyswietlić miasta, do ktorych klienci wydaja powyzej sredniej ceny zakupu */

SELECT Shipping_State, customerName, customerSurname, AVG(Retail_Price) AS AboveMeanRetail_Price
    FROM Shop
    GROUP BY Retail_Price, customerName, customerSurname, Shipping_State
    HAVING AVG(Retail_Price)>(SELECT AVG(Retail_Price) FROM Shop);

/* 17. Wyswietlić całkowity dochód sklepu z zakupów */

SELECT SUM(Retail_Price) AS SumRetail_Price
    FROM Shop;

/* 18. Wyświetić wariancję cen zakupów */

SELECT VAR(Retail_Price) AS VarRetail_Price
    FROM Shop

/* 19. Wyświetlić odchylenie standardowe cen zakupów */

SELECT STDEV(Retail_Price) AS StandDevRetail_Price
    FROM Shop


select * from Shop

/* Unique products list */
SELECT DISTINCT ItemDescription
FROM  Shop 
ORDER BY ItemDescription

/* Unique products list and number of transactions*/
select Item,
  ItemDescription,
  count(distinct transactionId) sold
from Shop
group by ItemDescription,Item;

/* Unique products list, sold and total income*/
select ItemDescription,
  Retail_Price,
  count(distinct transactionId) sold,
  sum(Retail_Price) income
from Shop
group by ItemDescription,Retail_Price

/* List of clients, purchased items, number sold and total income*/
select customerName,customerSurname,ItemDescription, Retail_Price,
count(distinct transactionId) sold,
sum(Retail_Price) income
from Shop
group by Retail_Price,customerName,customerSurname,ItemDescription,Retail_Price

/* List of products sold in different states, income */
select ItemDescription,Shipping_State,Retail_Price,
count(distinct Shipping_State) numberOfOrders,
sum(Retail_Price) incomeFromState
from Shop
group by ItemDescription,Shipping_State,Retail_Price
ORDER by incomeFromState desc
`;

await queries.push({getOtherQueries:getOtherQueries})

  return res.render("fiddle",{queries})
},


}

async function findAuthorID(name,surname) {  
    console.log("querying started")
    const connection = makeConnection(configAzureDb)
    const request = new Request(`select TOP 1 authorId from dbo.Author WHERE authorName=${name} AND authorSurname=${surname}`, function(err) {  
    if (err) {  
        console.log(err);}  
    });  
    var result = "";  
    request.on('row', function(columns) {  
        columns.forEach(function(column) {  
          if (column.value === null) {  
            console.log('NULL');  
          } else {  
            result+= column.value + " ";  
          }  
        });  
        console.log("returned",result);  
        result ="";  
    });  

    request.on('done', function(rowCount, more) {  
    console.log(rowCount + ' rows returned');  
    });  
    connection.execSql(request);  
    return result
}

function executeStatement() {  
    const request = new Request("SELECT c.CustomerID, c.CompanyName,COUNT(soh.SalesOrderID) AS OrderCount FROM SalesLT.Customer AS c LEFT OUTER JOIN SalesLT.SalesOrderHeader AS soh ON c.CustomerID = soh.CustomerID GROUP BY c.CustomerID, c.CompanyName ORDER BY OrderCount DESC;", function(err) {  
    if (err) {  
        console.log(err);}  
    });  
    var result = "";  
    request.on('row', function(columns) {  
        columns.forEach(function(column) {  
          if (column.value === null) {  
            console.log('NULL');  
          } else {  
            result+= column.value + " ";  
          }  
        });  
        console.log(result);  
        result ="";  
    });  

    request.on('done', function(rowCount, more) {  
    console.log(rowCount + ' rows returned');  
    });  
    connection.execSql(request);  
}

function executeStatement1() {  
    request = new Request("INSERT SalesLT.Product (Name, ProductNumber, StandardCost, ListPrice, SellStartDate) OUTPUT INSERTED.ProductID VALUES (@Name, @Number, @Cost, @Price, CURRENT_TIMESTAMP);", function(err) {  
     if (err) {  
        console.log(err);}  
    });  
    request.addParameter('Name', TYPES.NVarChar,'SQL Server Express 2014');  
    request.addParameter('Number', TYPES.NVarChar , 'SQLEXPRESS2014');  
    request.addParameter('Cost', TYPES.Int, 11);  
    request.addParameter('Price', TYPES.Int,11);  
    request.on('row', function(columns) {  
        columns.forEach(function(column) {  
          if (column.value === null) {  
            console.log('NULL');  
          } else {  
            console.log("Product id of inserted item is " + column.value);  
          }  
        });  
    });       
    connection.execSql(request);  
}  

function uploadActor(actorListFinal) { 
    const connection = makeConnection(configAzureDb) 
    let request = new Request(`INSERT Actor (actorName, actorSurname) OUTPUT INSERTED.actorId VALUES ${actorListFinal}`, function(err) {  
     if (err) { 
        console.log(err);}  
    });  
    request.on('row', function(columns) {  
        columns.forEach(function(column) {  
          if (column.value === null) {  
            console.log('NULL');  
          } else {  
            console.log("actorId of inserted item is " + column.value);  
          }  
        });  
    });       
    connection.execSql(request);  
}  

function makeConnection(config)
{
    const connection = new Connection(config);
    return connection;
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
    }
    
    await console.log(details)
    return details
}

const getAllDirectorsSQL = async function(){
  return function(cb){
    sql.connect(configAzureDbSimple,function(err){
      console.log("Inside2")
      if(err) {console.log(err)}
      console.log("Inside3")
      let sqlQuery = `select * from Director`
      console.log(sqlQuery)
      let sqlRequest =new sql.Request();
      sqlRequest.query(sqlQuery,function(err,data){
        console.log("Inside4")
        if(err){console.log(err)}
        const allDirectors = data.recordset;
        sql.close();
        cb(allDirectors)
      })
    })
  }
}