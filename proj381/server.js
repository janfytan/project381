var express = require('express');
var app = express();
var fileUpload = require('express-fileupload');
var session = require('cookie-session');
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var MongoClient = require('mongodb').MongoClient;
var mongourl = 'mongodb://user:pass@ds129776.mlab.com:29776/prodb';
var bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(fileUpload());
app.set('view engine', 'ejs');
app.use(session({
	name: 'session',
	keys: ['key1', 'key2'],
	maxAge: 1000000
}));
app.use(function(req,res,next){
    res.locals.session = req.session;
    next();
});

app.get('/api/restaurant/read', function(req, res) {
	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err, null);
		findRestaurants(db, {}, function(result) {
			db.close();
			res.status(200);
			res.setHeader('Content-Type', 'application/json');
			res.send(JSON.stringify(result));
		});
	});
});

app.get('/api/restaurant/read/:key/:value', function(req, res) {
	var criteria = {};
	criteria[req.params.key] = req.params.value;

	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err, null);
		findRestaurants(db, criteria, function(result) {
			db.close();
			res.status(200);
			res.setHeader('Content-Type', 'application/json');
			res.send(JSON.stringify(result));
		});
	});
});

app.post('/api/restaurant/create', function(req, res) {
	var rest = {};
	var message = {};
	rest['restaurant_id'] = randomID();

	for (data in req.body){
		if(data!="street" || data!="building" || data!="zipcode" || data!="coord" ){rest[data] = req.body[data];
		} else {
			var address = {};
			address['street'] = req.body.street;
			address['building'] = req.body.building;
			address['zipcode'] = req.body.zipcode;
			var coordArray = req.body.coord.split(",");
			address['coord'] = coordArray;
			rest['address'] = address;
		}
	}

	if (req.files != null) {
		rest['photo'] = req.files.photoToUpload.data.toString('base64');
		rest['photo_mimetype'] = req.files.photoToUpload.mimetype;
	}

	if (rest['name'] != null && rest['owner'] != null){
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			createRestaurant(db, rest, function(result) {
				db.close();
				if (result) {
					res.status(200);
					res.setHeader('Content-Type', 'application/json');
					message['status'] = "ok"
					message['_id'] = result['ops'][0]['_id'];
					res.send(JSON.stringify(message));
				} else {
					res.status(404);
					res.setHeader('Content-Type', 'application/json');
					message['status'] = "error";
					res.send(JSON.stringify(message));
				}
			});
		});
	} else {
    	res.status(200);
		res.setHeader('Content-Type', 'application/json');
		message['status'] = "failed";
		res.send(JSON.stringify(message));
	}
});

app.get('/', function(req, res) {
	if (req.session.authenticated) {
		var criteria = {};
		for (i in req.query) {
			criteria[i] = req.query[i];
		}

		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			findRestaurants(db, criteria, function(result) {
				db.close();
				res.status(200);
				res.setHeader('Content-Type', 'text/html');
				res.render('index', {restaurants: result, criteria: criteria});
			});
		});
	} else {
		res.status(404);
		res.setHeader('Content-Type', 'text/html');
		res.render('login');
	}
});

app.post('/register', function(req, res) {
	var user = {};
	user['userid'] = req.body.userid;
	user['password'] = req.body.password;

	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err, null);
		createUser(db, user, function(result) {
			db.close();
			if (result) {
				res.status(200);
				res.setHeader('Content-Type', 'text/html');
				res.render('login', {success: 'Registration complete. Please login.'});
			} else {
				res.status(404);
				res.setHeader('Content-Type', 'text/html');
				res.render('login', {warning: 'User ID "' + user['userid'] + '" is taken. Try another.'});
			}
		});
	});
});

function createUser(db, user, callback) {
	db.collection('users').insertOne(user, function(err, result) {
		try {
			assert.equal(err, null);
		} catch (err) {
			console.error('User ID: "' + user['userid'] + '" is taken. Insert user failed.');
		}
		callback(result);
	});
}

app.post('/login', function(req, res) {
	var user = {};
	user['userid'] = req.body.userid;
	user['password'] = req.body.password;

	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err, null);
		findUser(db, user, function(result) {
			db.close();
			if (result) {
				req.session.authenticated = true;
				req.session._id = result._id;
				req.session.userid = result.userid;
				res.redirect('/');
			} else {
				res.status(404);
				res.setHeader('Content-Type', 'text/html');
				res.render('login', {warning: 'Incorrect user ID or password.'});
			}
		});
	});
});

app.get('/logout', function(req, res) {
	req.session = null;
	res.redirect('/');
});

app.post('/createRestaurants', function(req, res) {
	if (req.session.authenticated) {
		var restaurant = {};
		var address = {};
		var coord = [];
		restaurant['restaurant_id'] = randomID();
		restaurant['name'] = req.body.name;
		if (req.body.borough) restaurant['borough'] = req.body.borough;
		if (req.body.cuisine) restaurant['cuisine'] = req.body.cuisine;
		if (req.body.address_street) address['street'] = req.body.address_street;
		if (req.body.address_building) address['building'] = req.body.address_building;
		if (req.body.address_zipcode) address['zipcode'] = req.body.address_zipcode;
		if (req.body.address_coord) {
			coord = req.body.address_coord.split(',');
			address['coord'] = coord;
		}
		if (req.body.address_street || req.body.address_building || req.body.address_zipcode || req.body.address_coord) restaurant['address']= address;
		restaurant['owner'] = req.session.userid;

		if (req.files.photoToUpload != null) {
			var mimetype = req.files.photoToUpload.mimetype;
			var base64 = req.files.photoToUpload.data.toString('base64');
			restaurant['photo_mimetype'] = mimetype;
			restaurant['photo'] = base64;
		}

		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			createRestaurant(db, restaurant, function(result) {
				db.close();
				if (result) {
					res.render('create', {prompt: 'success'});
				} else {
					res.render('create', {prompt: 'failed'});
				}
			});
		});
	}
});

function createRestaurant(db, rest, callback) {
	db.collection('restaurants').insertOne(rest, function(err, result) {
		try {
			assert.equal(err, null);
		} catch (err) {
			console.error(err);
		}
		callback(result);
	});
}

app.get('/createRestaurant', function(req, res) {
	if (req.session.authenticated) {
		res.render('create', {prompt: ''});
	}
});

app.get('/deleteRestaurant', function(req, res) {
	if (req.session.authenticated) {
		var restaurant = {};
		restaurant['_id'] = new ObjectId(req.query._id);
		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			deleteRestaurant(db, restaurant, function(result) {
				db.close();
				if (result) {
					res.render('delete', {message: 'success delete restaurant'});
				}
			});
		});
	}
});

function deleteRestaurant(db, rest, callback) {
	db.collection('restaurants').deleteOne(rest, function(err, result) {
		try {
			assert.equal(err, null);
		} catch (err) {
			console.error('error');
		}
		callback(result);
	});
}

app.get('/editRestaurant', function(req, res) {
	if (req.session.authenticated) {
		var restaurant = {};
		restaurant['_id'] = new ObjectId(req.query._id);

		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			findRestaurantById(db, restaurant, function(result) {
				db.close();
				if (result) {
					res.status(200);
					res.render('edit', {restaurant: result, message:''});
				} else {
					res.status(404).end('restaurant id:' + req.query._id + ' not found!');
				}
			});
		});
	} else {
		res.redirect('/');
	}
});

app.post('/updateRestaurant', function(req, res) {
	if (req.session.authenticated) {
		var restaurant = {};
		var updateID = {};
		var address = {};
		var coord = [];
		updateID['_id'] = new ObjectId(req.query._id);
		restaurant['_id'] = new ObjectId(req.query._id);
		restaurant['name'] = req.body.name;
		restaurant['borough'] = req.body.borough;
		restaurant['cuisine'] = req.body.cuisine;
		address['street'] = req.body.address_street;
		address['building'] = req.body.address_building;
		address['zipcode'] = req.body.address_zipcode;
		coord = req.body.address_coord.split(',');
		address['coord'] = coord;
		restaurant['address']= address;
		restaurant['owner'] = req.session.userid;

		if (req.files.photoToUpload != null) {
			var mimetype = req.files.photoToUpload.mimetype;
			var base64 = req.files.photoToUpload.data.toString('base64');
			restaurant['photo_mimetype'] = mimetype;
			restaurant['photo'] = base64;
		}

		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			updateRestaurant(db, updateID, restaurant, function(result){
				db.close();
				if (result) {
					res.status(200);
					res.redirect('/restaurant?_id='+updateID['_id']);
				} else {
					res.status(400).end('restaurant id:' + req.query._id + ' not found!');
				}
			});
		});
	}
});

function updateRestaurant(db, restaurant, updateRest, callback) {
	db.collection('restaurants').findOne(restaurant,  function(err, result) {
		assert.equal(err, null);
		if (result) {
			db.collection('restaurants').updateOne(restaurant, { $set: updateRest }, function(err, result) {
				assert.equal(err, null);
				callback(result);
			});
		}
	});
}

app.get('/map', function(req,res) {
	if (req.session.authenticated) {
		res.status(200);
		res.setHeader('Content-Type', 'text/html');
		res.render('map.ejs', {lat:req.query.lat,lon:req.query.lon,title:req.query.title});
	}
});


app.get('/restaurant', function(req, res) {
	if (req.session.authenticated) {
		var restaurant = {};
		restaurant['_id'] = new ObjectId(req.query._id);

		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			findRestaurantById(db, restaurant, function(result) {
				db.close();
				if (result) {
					res.status(200);
					res.setHeader('Content-Type', 'text/html');
					res.render('restaurant', {restaurant: result});
				} else {
					res.setHeader('Content-Type', 'text/html');
					res.status(404).end('restaurant id: ' + req.query._id + ' not found!');
				}
			});
		});
	} else {
		res.redirect('/');
	}
});

app.get('/rate', function(req, res) {
	if (req.session.authenticated) {
		var restaurant = {};
		restaurant['_id'] = new ObjectId(req.query._id);
		res.status(200);
		res.setHeader('Content-Type', 'text/html');
		res.render('rate', {restaurant: restaurant});
	} else {
		res.redirect('/');
	}
});

app.get('/doRate', function(req, res) {
	if (req.session.authenticated) {
		var restaurant = {};
		var grade = {};
		restaurant['_id'] = new ObjectId(req.query._id);
		grade['user'] = req.session.userid;
		grade['score'] = req.query.score;

		MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err, null);
			insertGrade(db, restaurant, grade, req.session.userid, function(result) {
				db.close();
				if (result) {
					res.redirect('/restaurant?_id=' + req.query._id);
				} else {
					res.status(404);
					res.setHeader('Content-Type', 'text/html');
					res.render('error', {error: 'You have already rated this restaurant'});
				}
			});
		});
	} else {
		res.redirect('/');
	}
});

function randomID(){
	return Math.floor(Math.random() * 1000000);
}


function findUser(db, user, callback) {
	db.collection('users').findOne(user, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

function findRestaurants(db, criteria, callback) {
	var restaurants = [];
	var cursor = db.collection('restaurants').find(criteria);
	cursor.each(function(err, result) {
		assert.equal(err, null); 
		if (result != null) {
			restaurants.push(result);
		} else {
			callback(restaurants);
		}
	});
}


function findRestaurantById(db, restaurant, callback) {
	db.collection('restaurants').findOne(restaurant, function(err, result) {
		assert.equal(err, null);
		callback(result);
	});
}

function insertGrade(db, restaurant, grade, userid, callback) {
	db.collection('restaurants').findOne(restaurant, {'grades': {$elemMatch: {'user': userid}}}, function(err, result) {
		assert.equal(err, null);
		if (result.grades) {
			callback(null);
		} else {
			db.collection('restaurants').updateOne(restaurant, {$push: {'grades': grade}}, function(err, result) {
				assert.equal(err, null);
				callback(result);
			});
		}
	});
}

app.listen(process.env.PORT || 8099);