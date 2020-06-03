const express = require('express');
const router = require('express-promise-router')();
const axios = require('axios')

const ScraperController = require("../app/controllers/ScrapperController");

//routes
router.route('/')
    .get(ScraperController.welcome)

router.route('/index')
    .get(ScraperController.allMoviesList)

router.route('/details/:id')
    .get(ScraperController.movieDetails)

router.route('/fiddle')
    .get(ScraperController.fiddle)

router.route('api/scrapper')
    .get(ScraperController.getOffers)

router.route('api/scrapper2')
    .get(ScraperController.getOffers2)

router.route('api/testDBConnection')
    .get(ScraperController.loadDB)

router.route('api/uploadActors')
    .get(ScraperController.uploadActors)

router.route('api/uploadActorRoles')
    .get(ScraperController.uploadRoles)

router.route('api/uploadDirectors')
    .get(ScraperController.uploadDirectors)

router.route('api/uploadStudios')
    .get(ScraperController.uploadStudios)

router.route('api/uploadProductionCountry')
    .get(ScraperController.uploadProductionCountry)

router.route('api/uploadAuthors')
    .get(ScraperController.uploadBookAuthors)

router.route('api/uploadAuthorsBooks')
    .get(ScraperController.uploadAuthorsBooks)

router.route('api/uploadMovies')
    .get(ScraperController.uploadMoviesFull)

    
module.exports = router;