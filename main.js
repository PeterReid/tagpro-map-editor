var http = require('http');
var FormData = require('form-data');
var fs = require('fs');
var express = require('express');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var app = express();

app.use(express.static('static'));

app.use(express.urlencoded())
app.use(express.json())


function DeferredData(payload) {
  EventEmitter.call();
  this.payload = payload;
}
util.inherits(DeferredData, EventEmitter)
DeferredData.prototype.pause = function() {
  console.log('pause');
}
DeferredData.prototype.resume = function() {
  console.log('resume');
  process.nextTick(function() {
    console.log('sending', this.payload);
    this.emit('data', this.payload);
    this.emit('end');
  }.bind(this));
}


app.post('/test', function(req, res) {
    var logic = JSON.parse(req.body.logic);
    var layout = new Buffer(req.body.layout, 'base64');
    
    if (req.body.eu == 'true')
      var url =  Math.random() < 0.5 ? 'http://maptest.newcompte.fr/testmap' : 'http://justletme.be:8080/testmap';
    else
      var url = 'http://tagpro-maptest.koalabeast.com/testmap';
    /*var form = new FormData();
    var request = http.request({
      method: 'post',
      host: 'tagpro-maptest.koalabeast.com',
      path: '/testmap',
      headers: form.getHeaders()
    });

    form.pipe(request);
    form.append('logic', fs.createReadStream('1.png'));//new Buffer(JSON.stringify(logic)));
    form.append('layout', fs.createReadStream('1.json'));//layout);


    request.on('response', function(testServerRes) {
      console.log(testServerRes.headers);
      console.log(testServerRes.statusCode);
      res.send(JSON.stringify({
        location: testServerRes.headers.location
      }));
      testServerRes.on('data', function(d) {
        console.log(d.toString())
      });
    });
    */
    
    
    var form = new FormData();
    
    fs.writeFileSync('temp.json', new Buffer(JSON.stringify(logic)));
    fs.writeFileSync('temp.png', layout);
    form.append('logic', fs.createReadStream('temp.json'));
    form.append('layout', fs.createReadStream('temp.png'));
    
    form.submit(url, function(err, testRes) {
      if (err) {
        res.send('Sorry, we could not start up a test map. ' + err.toString());
      } else {
        testRes.resume();
        res.send(testRes.headers);
      }
    });
    
    /*
    var request = http.request({
      method: 'post',
      host: 'tagpro-maptest.koalabeast.com',
      path: '/testmap',
      headers: form.getHeaders()
    });

    form.pipe(request);
    
    
    form.on('data',function(d) {
      console.log(d.toString())
    });

    request.on('response', function(res2) {
      console.log(res2.headers);
      console.log(res2.statusCode);
      res2.on('data', function(d) {
        console.log(d.toString());
      });
      res.send(res2.headers);
    });
*/

});
app.listen(8060);
