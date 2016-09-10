var mount = require('koa-mount');
var proxy = require('koa-proxy');
var serve = require('koa-static');
var koa = require('koa');
var app = koa();

app.use(serve(__dirname + '/test'));
app.use(serve(__dirname + '/css'));
app.use(serve(__dirname + '/dev'));
app.use(serve(__dirname + '/bin'));

app.use(mount('/weewx', proxy({
  host: 'http://localhost:5000'
})));
app.listen(3000);

console.log('listening on port 3000');