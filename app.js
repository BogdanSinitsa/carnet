/**
 * @license
 * Licensed Materials - Property of IBM
 * 5725-I43 (C) Copyright IBM Corp. 2014, 2015. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */

"use strict";

//ToDO: Only for local development
//process.env = require("./env.json");

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var request = require('request');
var async = require("async");
var ImfBackendStrategy = require('passport-imf-token-validation').ImfBackendStrategy;
var imf = require('imf-oauth-user-sdk');
var ibmbluemix = require('ibmbluemix');
var ibmpush = require('ibmpush');

var geo = require("./geo-calc");

var app = express();

app.use(bodyParser.urlencoded());
app.use(bodyParser.json());

try {
	passport.use(new ImfBackendStrategy());
} catch (e) {
	console.log(e);
}

app.use(passport.initialize());

//redirect to mobile backend applica-tion doc page when accessing the root context
app.get('/', function(req, res) {
	res.sendfile('public/index.html');
});

// create a public static content service
app.use("/public", express.static(__dirname + '/public'));

// create another static content service, and protect it with imf-backend-strategy
app.use("/protected", passport.authenticate('imf-backend-strategy', {session: false }));
app.use("/protected", express.static(__dirname + '/protected'));

// create a backend service endpoint
app.get('/publicServices/generateToken', function(req, res) {
		// use imf-oauth-user-sdk to get the authorization header, which can be used to access the protected resource/endpoint by imf-backend-strategy
		imf.getAuthorizationHeader().then(function(token) {
			res.send(200, token);
		}, function(err) {
			console.log(err);
		});
	});

//create another backend service endpoint, and protect it with imf-backend-strategy
app.get('/protectedServices/test', passport.authenticate('imf-backend-strategy', {session: false }),
		function(req, res){
			res.send(200, "Successfully access to protected backend endpoint.");
		}
);

var Cloudant = require('cloudant');

//ToDo: move to config
var username = "8092fc83-a449-4234-a28e-0897fd7637ac-bluemix";
var password = "42c664bbcf55e0449237e006e151e5acf2250e40aafef1d596b36fcddc2ebfa3";
var cloudant = Cloudant({account:username, password:password});
var db = cloudant.db.use("carnetdb");

app.post("/create-account", (req, res)=>{
	res.setHeader('Content-Type', 'application/json');

	var deviceID = req.body.deviceID;
	var email    = req.body.email;
	var make     = req.body.make;
	var model    = req.body.model;

	async.waterfall([
		(next)=>{
			db.find({selector: {email: email}}, (err, data)=>{
				next(err, data)
			});
		}
	],
	(err, result)=>{
		if(result && result.docs.length){
			res.end(JSON.stringify({err: "Account already exists"}));
		}else{
			db.insert({
				deviceID: deviceID,
				email: email,
				make: make,
				model: model
			}, (err, body)=>{
				if(err){
					res.status(500);
					res.end(JSON.stringify({err: "Internal Error"}));
				}else{
					res.end(JSON.stringify({success: true}));
				}
			})
		}
	});
});

app.put("/update-location", (req, res)=>{
	res.setHeader('Content-Type', 'application/json');

	var deviceID = req.body.deviceID;
	var currLon = parseFloat(req.body.lon);
	var currLat = parseFloat(req.body.lat);

	async.waterfall([
		//Find doc by device Id
		(next)=>{
			db.find({selector: {deviceID: deviceID}}, (err, data)=>{
				if(data.docs.length) {
					next(err, data.docs[0])
				}else{
					res.end(JSON.stringify({err: "device not found"}));
				}
			});
		},
		//Update new coordinates
		(doc, next)=>{
			if(doc.geometry){
				doc.prevCoordinates = {
					lon: doc.geometry.coordinates[0],
					lat: doc.geometry.coordinates[1]
				}
			}else{
				doc.prevCoordinates = {
					lon: currLon,
					lat: currLat
				}
			}

			doc.geometry = {
				type: "Point",
				coordinates: [
					currLon,
					currLat
				]
			};

			db.insert(doc, (err, data)=>{
				next(err, data, doc)
			})
		},
		//Find cars within 100 meters
		(data, doc, next)=>{
			cloudant.request({
				db: "carnetdb",
				path: `_design/geodd/_geo/geoidx?lat=${currLat}&lon=${currLon}&radius=100&include_docs=true`
			}, (err, data)=>{
				next(err, data , doc)
			});
		},
		//Determine cars position relatively to current car
		(data, doc, next)=>{
			var dirAngle = geo.angleFromCoordinate(doc.prevCoordinates.lat, doc.prevCoordinates.lon, currLat, currLon);
			var tCurrLoc = geo.rotatePoint({lon: currLon, lat: currLat}, doc.prevCoordinates, dirAngle);

			var results = [];

			for (let row of data.rows){
				if(row.id == doc._id) {
					continue
				}

				let carDoc = row.doc;
				results.push(carDoc);

				let tCarLoc = geo.rotatePoint({lon: carDoc.geometry.coordinates[0],
					 						   lat: carDoc.geometry.coordinates[1]},
					                           doc.prevCoordinates, dirAngle);

				carDoc.position = [];

				if(tCarLoc.lat > tCurrLoc.lat){
					carDoc.position.push("front")
				}else{
					carDoc.position.push("back")
				}

				if(tCarLoc.lon > tCurrLoc.lon){
					carDoc.position.push("right")
				}else{
					carDoc.position.push("left")
				}
			}

			next(null, results)
		}
	], (err, result)=>{
		res.end(JSON.stringify({ cars: result}));
	});
});

app.post(["/like", "/dislike"], (req, res)=>{
	res.setHeader('Content-Type', 'application/json');

	var currDeviceID    = req.body.currDeviceID;
	var carDeviceID     = req.body.carDeviceID;

	async.waterfall([
		//Find current car doc
		(next)=>{
			db.find({selector: {deviceID: currDeviceID}}, (err, data)=>{
				if(data.docs.length) {
					next(err, data.docs[0])
				}else{
					res.end(JSON.stringify({err: "device not found"}));
				}
			});
		},
		//Find car doc
		(currCar, next)=>{
			db.find({selector: {deviceID: carDeviceID}}, (err, data)=>{
				if(data.docs.length) {
					next(err, currCar, data.docs[0])
				}else{
					res.end(JSON.stringify({err: "device not found"}));
				}
			});
		},
		//Set like
		(currCar, car, next)=>{
			var likeKey = req.url == "/dislike" ? "dislike" : "like";

			if(!car[likeKey]){
				car[likeKey] = [];
			}

			if(car[likeKey].indexOf(currCar._id) == -1) {
				car[likeKey].push(currCar._id);

				db.insert(car, (err, data)=> {
					next(err, data)
				})
			}else{
				next(null)
			}
		}
	], (err, result)=>{
		if(err){
			res.end(JSON.stringify({err: "Internal Error"}));
		}else{
			res.end(JSON.stringify({success: true}));
		}
	});
});

// Send the notification
function notify(deviceId, data) {
	var options = {
		url: 'https://mobile.eu-gb.bluemix.net/imfpush/v1/apps/d43573b3-7324-4cff-9a1b-70a62bbc3316/messages',
		method: 'POST',
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
			"appSecret": "0481576e-2e8a-4484-854c-5e5952a78a53",
			"Accept-Language": "en-US",
			"Application-Mode": "SANDBOX"
		},
		body: JSON.stringify({
			"message": {
				"alert": JSON.stringify(data)
			},
			"target": {"deviceIds": [deviceId]}, "settings": {"apns": {}, "gcm": {}}
		})
	};

	request(options, (error, response, body)=> {
		if (!error && response.statusCode == 202) {
			// Print out the response body
			//res.end(body)
		} else {
			//res.end()
		}
	})
}

app.post("/message", (req, res)=>{
	var currDeviceID = req.body.currDeviceID;
	var carDeviceID  = req.body.carDeviceID;
	var text = req.body.text;

	async.waterfall([
		//Find current car doc
		(next)=>{
			db.find({selector: {deviceID: currDeviceID}}, (err, data)=>{
				if(data.docs.length) {
					next(err, data.docs[0])
				}else{
					res.end(JSON.stringify({err: "device not found"}));
				}
			});
		},
		//Find car doc
		(currCar, next)=>{
			db.find({selector: {deviceID: carDeviceID}}, (err, data)=>{
				if(data.docs.length) {
					next(err, currCar, data.docs[0])
				}else{
					res.end(JSON.stringify({err: "device not found"}));
				}
			});
		},
		//Send notification
		(currCar, car, next)=>{
			//ToDo: Add connection check
			notify(carDeviceID, { from: currCar, text: text});
			next(null);
		}
	], (err, result)=>{
		if(err){
			res.end(JSON.stringify({err: "Internal Error"}));
		}else{
			res.end(JSON.stringify({success: true}));
		}
	});
});



var port = (process.env.VCAP_APP_PORT || 3000);
app.listen(port);
console.log("mobile backend app is listening at " + port);
