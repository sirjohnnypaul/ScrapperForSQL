//basic
const express = require("express");
const logger = require('morgan');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require("path");
const expressValidator = require('express-validator');
const ejs = require('ejs');

//routes definitions
const all = require('./routes/all');

const app = express();
app.use(helmet());
app.use(express.json({
    inflate: true,
    limit: '100mb',
    reviver: null,
    strict: true,
    type: 'application/json',
    verify: undefined
  }))

app.set('view engine', 'ejs')
//Middlewares
app.use(logger('dev'));
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());

app.use(cors());
app.use('/', express.static("public"))
app.use('/', all);

// catch 404 and forward to error handler
// app.use(function(req, res, next)
// {
// 	let err = new Error('Page not found!');
// 	err.status = 404;

// 	next(err);
// });

// //error handler
// app.use(function(err, req, res, next)
// {
// 	// set locals, only providing error in development
// 	res.locals.message = err.message;
// 	res.locals.error = req.app.get('env') === 'development' ? err : {};

// 	// render the error page
//     res.status(err.status || 500).json({ errors : [ { field: "general", error: err.message } ]})
// });


//start 
const PORT = process.env.PORT || 5000

//listen 
app.listen(PORT, () => console.info(`Started on port ${PORT}`));