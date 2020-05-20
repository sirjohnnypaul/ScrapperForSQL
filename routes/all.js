const express = require('express');
const router = require('express-promise-router')();
const axios = require('axios')

const ScraperController = require("../app/controllers/ScrapperController");

//routes
router.route('/scrapper')
    .get(ScraperController.getOffers)

router.route('/scrapper2')
    .get(ScraperController.getOffers2)


module.exports = router;