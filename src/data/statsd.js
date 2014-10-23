/* jshint strict:false */

var dgram = require('dgram');
var dns = require('dns');
var utils = require('../utils')

var defaultStatsdConfig = {
  host: 'localhost',
  port: 8125,
  socketTimeout: 500,
  prefix: '',
  preCacheDNS: true,
  bufferTimeout: 500
};

function Statsd(config) {
  this.config = utils.merge({}, defaultStatsdConfig, config);

  if (this.config.preCacheDNS) {
    dns.lookup(config.host, (function(err, addr) {
      if (!err) {
        this.config.host = addr;
      }
    }).bind(this));
  }

  this.send = this.send.bind(this);

  this.lastFlush = new Date();
  this.buffer = [];
  this.socket = this.config.socket || dgram.createSocket('udp4');
}

Statsd.prototype.stop = function() {
  this.socket.close();
}

Statsd.prototype.send = function(segment, config, req) {
  config.statsd = config.statsd || {};

  segment.forEach((function(stat) {
    var config = stat.config;
    var name = stat.name;
    var value = stat.val;
    var message = '';

    if (!Statsd[config.statsd.eventType]) {
      return;
    }

    if (config.prefix) {
      name = config.prefix + '.' + name;
    }

    message = Statsd[config.statsd.eventType](name, value);

    if (config.statsd.sampleRate) {
      message += '|@' + config.statsd.sampleRate
    }

    if (config.statsd.tags) {
      message += '|#' + config.statsd.tags.join(',')
    }

    this.buffer.push(message);
  }).bind(this));

  this.flushBuffer();
}

Statsd.prototype.flushBuffer = function() {
  if (!this.config.bufferTimeout) {
    this.flushToSocket();
    return;
  }

  var now = new Date();

  // If it's been a second, go ahead and flush and clear the timeout.
  if (now - this.lastFlush > this.config.bufferTimeout) {
    clearTimeout(this.bufferTimeout);
    this.bufferTimeout = undefined;
    this.flushToSocket();
  } else {
    // If it hasn't been a second, and there's no delayed call, create one
    // so everything gets flushed after a second.
    if (!this.bufferTimeout) {
      this.bufferTimeout = setTimeout(this.flushBuffer.bind(this),
          this.config.bufferTimeout);
    }
  }
}

Statsd.prototype.flushToSocket = function() {
  if(!this.buffer) {
    return;
  }

  var buffer = new Buffer(this.buffer.join('\n'));

  var response = (function(err, bytes) {
    if (this.config.debug) {
      console.log(err);
    }
  }).bind(this);

  this.socket.send(buffer, 0, buffer.length, this.config.port,
                   this.config.host, response);

  this.buffer = [];
}

Statsd.counter = function(name, value) {
  return name + ':' + value + '|c';
}

Statsd.increment = function(name, value) {
  return Statsd.counter(name, value || 1);
}

Statsd.decrement = function(name, value) {
  return Statsd.counter(name, -value || -1);
}

Statsd.gauge = function(name, value) {
  return name + ':' + value + '|g';
}

Statsd.timing = function(name, value) {
  return name + ':' + value + '|ms';
}

Statsd.set = function(name, value) {
  return name + ':' + value + '|s';
}

module.exports = Statsd;
