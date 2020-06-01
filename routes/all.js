const express = require('express');
const router = require('express-promise-router')();
const axios = require('axios')

const ScraperController = require("../app/controllers/ScrapperController");

//routes
router.route('/scrapper')
    .get(ScraperController.getOffers)

router.route('/scrapper2')
    .get(ScraperController.getOffers2)

router.route('/testDBConnection')
    .get(ScraperController.loadDB)

router.route('/uploadActors')
    .get(ScraperController.uploadActors)

router.route('/uploadActorRoles')
    .get(ScraperController.uploadRoles)

router.route('/uploadDirectors')
    .get(ScraperController.uploadDirectors)

router.route('/uploadStudios')
    .get(ScraperController.uploadStudios)

router.route('/uploadProductionCountry')
    .get(ScraperController.uploadProductionCountry)

router.route('/uploadAuthors')
    .get(ScraperController.uploadBookAuthors)

router.route('/uploadAuthorsBooks')
    .get(ScraperController.uploadAuthorsBooks)

router.route('/uploadMovies')
    .get(ScraperController.uploadMoviesFull)
    
module.exports = router;