/**
 * @license
 * Licensed Materials - Property of IBM
 * 5725-I43 (C) Copyright IBM Corp. 2014, 2015. All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 */

"use strict";

var express = require('express');
var passport = require('passport');
var ImfBackendStrategy = require('passport-imf-token-validation').ImfBackendStrategy;
var imf = require('imf-oauth-user-sdk');
var async = require("async");
var geo = require("./geo-calc");

try {
	passport.use(new ImfBackendStrategy());
} catch (e) {
	console.log(e);
}

var app = express();
app.use(passport.initialize());

//redirect to mobile backend applica-tion doc page when accessing the root context
app.get('/', function(req, res){
	res.sendfile('public/index.html');
});

// create a public static content service
app.use("/public", express.static(__dirname + '/public'));

// create another static content service, and protect it with imf-backend-strategy
app.use("/protected", passport.authenticate('imf-backend-strategy', {session: false }));
app.use("/protected", express.static(__dirname + '/protected'));

// create a backend service endpoint
app.get('/publicServices/generateToken', function(req, res){
		// use imf-oauth-user-sdk to get the authorization header, which can be used to access the protected resource/endpoint by imf-backend-strategy
		imf.getAuthorizationHeader().then(function(token) {
			res.send(200, token);
		}, function(err) {
			console.log(err);
		});
	}
);

//create another backend service endpoint, and protect it with imf-backend-strategy
app.get('/protectedServices/test', passport.authenticate('imf-backend-strategy', {session: false }),
		function(req, res){
			res.send(200, "Successfully access to protected backend endpoint.");
		}
);

var Cloudant = require('cloudant');

var username = "60ae5ee0-cfa2-4da3-b5a4-8a79e1466b37-bluemix";
var password = "1b2f3ea175e745f689de62da9df0675082897c3653f477785a94fe8046e285fe";
var cloudant = Cloudant({account:username, password:password});
var db = cloudant.db.use("carnetdb");

app.get("/update-my-location/:id", (req, res)=>{

	var currLon = parseFloat(req.query.lon);
	var currLat = parseFloat(req.query.lat);

	async.waterfall([
		(next)=>{
			db.get(req.params.id, (err, data)=>{
				next(err, data)
			});
		},
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
		(data, doc, next)=>{
			cloudant.request({
				db: "carnetdb",
				path: `_design/geodd/_geo/geoidx?lat=${req.query.lat}&lon=${req.query.lon}&radius=100&include_docs=true`
			}, (err, data)=>{
				next(err, data , doc)
			});
		},
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
					 						   lat:  carDoc.geometry.coordinates[1]},
					                           doc.prevCoordinates, dirAngle);

				carDoc.keys = [];

				if(tCarLoc.lat > tCurrLoc.lat){
					carDoc.keys.push("front")
				}else{
					carDoc.keys.push("back")
				}

				if(tCarLoc.lon > tCurrLoc.lon){
					carDoc.keys.push("right")
				}else{
					carDoc.keys.push("left")
				}
			}

			next(null, results)
		}
	], (err, result)=>{
		res.setHeader('Content-Type', 'application/json');
		res.end(JSON.stringify(result));
	});

	//var doc = {
	//	geometry: {
	//		type: "Point",
	//		coordinates: [
	//			30.422084033489224,
	//			50.34579931822534
	//		]
	//	}
	//};
	//db.insert(doc, (err, body, header)=>{
	//	if(!err){
	//		res.write(JSON.stringify(body));
	//	}
	//	res.end();
	//});

});

//app.get("/update-car-location-data", application.updateCarLocationAction);
//app.get("/pass", (req, res)=>{
//	res.end(JSON.stringify(process.env));
//});
//

//
//app.get("/dbs", (req, res)=>{
//	cloudant.db.list(function(err, allDbs) {
//		res.end(JSON.stringify(allDbs));
//	});
//});
//
//app.get("/location", (req, res)=>{
//	cloudant.db.inser
//});

var port = (process.env.VCAP_APP_PORT || 3000);
app.listen(port);
console.log("mobile backend app is listening at " + port);
