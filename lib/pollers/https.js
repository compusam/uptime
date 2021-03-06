/**
 * Module dependencies.
 */

var util  = require('util');
var https = require('https');
var url   = require('url');
var HttpPoller = require('./http');

// The http module lacks proxy support. Let's monkey-patch it.
require('../proxy');

/**
 * Poller constructor
 *
 * @param {Mixed} Poller Target (e.g. URL)
 * @param {Number} Poller timeout in milliseconds. Without response before this duration, the poller stops and executes the error callback.
 * @param {Function} Error/success callback
 * @api   public
 */
function HttpsPoller(target, timeout, callback) {
  HttpsPoller.super_.call(this, target, timeout, callback);
}

util.inherits(HttpsPoller, HttpPoller);

/**
 * Launch the actual polling
 *
 * @api   public
 */
HttpsPoller.prototype.poll = function() {
  HttpsPoller.super_.super_.prototype.poll.call(this);
  this.request = https.get(this.target, this.onResponseCallback.bind(this));
  this.request.on('error', this.onErrorCallback.bind(this));
};

/**
 * Response callback
 *
 * Note that all responses may not be successful, as some return non-200 status codes,
 * and others return too slowly.
 * This method handles redirects.
 *
 * @api   private
 */
HttpsPoller.prototype.onResponseCallback = function(res) {
  var statusCode = res.statusCode;
  var poller = this;
  if (statusCode == 301 || statusCode == 302) {
    this.debug(this.getTime() + "ms - Got redirect response to " + this.target.href);
    var target = url.parse(res.headers.location);
    if (!target.protocol) {
      // relative location header. This is incorrect but tolerated
      this.target = url.parse('http://' + this.target.hostname + res.headers.location);
      this.setUserAgent(this.userAgent);
      this.poll();
      return;
    }
    switch (target.protocol) {
      case 'https:':
        this.target = target;
        this.setUserAgent(this.userAgent);
        this.poll();
        break;
      default:
        this.request.abort();
        this.onErrorCallback({ name: "WrongRedirectUrl", message: "Received redirection from https: to unsupported protocol " + target.protocol});
    }
    return;
  }
  if (statusCode == 200) {
    var body = '';
    this.debug(this.getTime() + "ms - Status code 200 OK");
    res.on('data', function(chunk) {
      body += chunk.toString();
      poller.debug(poller.getTime() + 'ms - BODY: ' + chunk.toString().substring(0, 100) + '...');
    });
    res.on('end', function() {
      poller.timer.stop();
      poller.debug(poller.getTime() + "ms - Request Finished");
      poller.callback(undefined, poller.getTime(), body);
    });
  } else {
    this.request.abort();
    this.onErrorCallback({ name: "NonOkStatusCode", message: "HTTP status " + statusCode});
  }
};

module.exports = HttpsPoller;
